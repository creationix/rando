let utf8decoder = new TextDecoder();
let utf8Encoder = new TextEncoder();
const SIMPLE = 0;
const POSINT = 1;
const NEGINT = 2;
const PERCENT = 3;
const DEGREE = 4;
const FLOAT = 5;
const POINTER = 6;
const REFERENCE = 7;
const STRING = 8;
const BYTES = 9;
const LIST = 10;
const MAP = 11;
const ARRAY = 12;
// Like rando, but binary using nibs headers
const FALSE = 0;
const FALSE_ENCODED = nibsEncode(SIMPLE, FALSE);
const TRUE = 1;
const TRUE_ENCODED = nibsEncode(SIMPLE, TRUE);
const NULL = 2;
const NULL_ENCODED = nibsEncode(SIMPLE, NULL);
const primitiveTags = {
    [SIMPLE]: true,
    [POSINT]: true,
    [NEGINT]: true,
    [PERCENT]: true,
    [DEGREE]: true,
    [FLOAT]: true,
    [POINTER]: true,
    [REFERENCE]: true,
};
/**
 * Given a value and optional list of known values shared between encoder and decoder,
 * return a binary representation of the value.
 */
export function encode(rootValue, knownValues = []) {
    // Array of byte arrays to be combined into a single byte array
    const parts = [];
    // A running total of the bytes in parts
    let size = 0;
    // Values that have been seen before, and the offset and cost of encoding them.
    const seenPrimitives = new Map();
    // Strings and Numbers from `knownValues` and their offset index.
    const knownPrimitives = new Map();
    // Objects and Arrays from `knownValues` and their offset index.
    const knownObjects = new Map();
    // Create quick lookup maps for known values
    for (let i = 0, l = knownValues.length; i < l; i++) {
        const value = knownValues[i];
        if (typeof value === "string" || typeof value === "number") {
            knownPrimitives.set(value, i);
        }
        else if (value && typeof value === "object") {
            knownObjects.set(value, i);
        }
        else {
            console.warn("Unsupported known value", value);
        }
    }
    const written = encodeAny(rootValue);
    if (written !== size)
        throw new Error("Size mismatch");
    const buffer = new Uint8Array(size);
    let offset = 0;
    for (let i = parts.length - 1; i >= 0; --i) {
        const part = parts[i];
        buffer.set(part, offset);
        offset += part.byteLength;
    }
    return buffer;
    function push(value) {
        parts.push(value);
        const len = value.byteLength;
        size += len;
        return len;
    }
    function pushStr(value) {
        return push(utf8Encoder.encode(value));
    }
    function pushNibs(num, tag) {
        return push(nibsEncode(tag, num));
    }
    function pushContainer(written, tag) {
        return written + pushNibs(tag, written);
    }
    function encodeAny(value) {
        // If the value is a known primitive or object, encode it as a pointer
        let known = knownPrimitives.get(value) ?? knownObjects.get(value);
        if (known === undefined && value && typeof value === "object") {
            for (const k of knownObjects.keys()) {
                if (sameShape(value, k)) {
                    known = knownObjects.get(k);
                    break;
                }
            }
        }
        if (typeof known === "number")
            return pushNibs(known, REFERENCE);
        // If the value has been seen before and a pointer is
        // cheaper than encoding it again, encode it as a pointer
        let seen = seenPrimitives.get(value);
        if (seen) {
            const [seenOffset, cost] = seen;
            const dist = size - seenOffset;
            const pointerCost = sizeNeeded(dist);
            if (pointerCost < cost)
                return pushNibs(dist, POINTER);
        }
        // Encode the value and record how expensive it was to write
        const written = encodeAnyInner(value);
        // Record in the seen values map if it's a string or number
        if (typeof value === "string" || typeof value === "number") {
            seenPrimitives.set(value, [size, written]);
        }
        return written;
    }
    function encodeAnyInner(value) {
        if (value == null)
            return push(NULL_ENCODED);
        if (value === true)
            return push(TRUE_ENCODED);
        if (value === false)
            return push(FALSE_ENCODED);
        if (Array.isArray(value))
            return encodeArray(value);
        if (ArrayBuffer.isView(value))
            return encodeBytes(value);
        if (typeof value === "object")
            return encodeObject(value);
        if (typeof value === "string")
            return encodeString(value);
        if (typeof value === "number")
            return encodeNumber(value);
        console.warn("Unsupported value", value);
        return push(NULL_ENCODED);
    }
    function encodeBytes(value) {
        const buf = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        return pushContainer(push(buf), BYTES);
    }
    function encodeString(value) {
        return pushContainer(pushStr(value), STRING);
    }
    function encodeNumber(value) {
        if (Number.isInteger(value)) {
            if (value >= 0) {
                return pushNibs(value, POSINT);
            }
            return pushNibs(-1 - value, NEGINT);
        }
        if (value > 0 && value < 2.3e13) {
            const percent = Math.round(value * 100);
            if (Math.abs(percent - value * 100) < 1e-15) {
                return pushNibs(percent, PERCENT);
            }
            const degree = Math.round(value * 360);
            if (Math.abs(degree - value * 360) < 1e-15) {
                return pushNibs(degree, DEGREE);
            }
        }
        const buf = new Uint8Array(5);
        const view = new DataView(buf.buffer);
        view.setFloat32(1, value, true);
        buf[0] = (FLOAT << 4) | 14;
        return push(buf);
    }
    function encodeObject(value) {
        const start = size;
        const entries = Object.entries(value);
        let written = 0;
        for (let i = entries.length - 1; i >= 0; --i) {
            const [key, value] = entries[i];
            const valueSize = encodeAny(value);
            const keySize = encodeAny(key);
            written += valueSize + keySize;
        }
        const end = size;
        if (written !== end - start)
            throw new Error("Size mismatch");
        return pushContainer(written, MAP);
    }
    function encodeArray(value) {
        const start = size;
        let written = 0;
        for (let i = value.length - 1; i >= 0; --i) {
            const valueSize = encodeAny(value[i]);
            written += valueSize;
        }
        const end = size;
        if (written !== end - start)
            throw new Error("Size mismatch");
        return pushContainer(written, LIST);
    }
}
function nibsEncode(tag, num) {
    if (num < 12) {
        return new Uint8Array([(tag << 4) | num]);
    }
    if (num < 0x100) {
        return new Uint8Array([(tag << 4) | 12, num]);
    }
    if (num < 0x10000) {
        const buf = new Uint8Array(3);
        const view = new DataView(buf.buffer);
        buf[0] = (tag << 4) | 13;
        view.setUint16(1, num, true);
        return buf;
    }
    if (num < 0x100000000) {
        const buf = new Uint8Array(5);
        const view = new DataView(buf.buffer);
        buf[0] = (tag << 4) | 14;
        view.setUint32(1, num, true);
        return buf;
    }
    const buf = new Uint8Array(9);
    const view = new DataView(buf.buffer);
    buf[0] = (tag << 4) | 15;
    view.setBigUint64(1, BigInt(num), true);
    return buf;
}
function sizeNeeded(num) {
    if (num < 12)
        return 1;
    if (num < 0x100)
        return 2;
    if (num < 0x10000)
        return 3;
    if (num < 0x100000000)
        return 5;
    return 9;
}
function sameShape(a, b) {
    if (a === b)
        return true;
    if (!a || !b)
        return false;
    if (Array.isArray(a)) {
        if (!Array.isArray(b))
            return false;
        if (a.length !== b.length)
            return false;
        for (let i = 0; i < a.length; i++) {
            if (!sameShape(a[i], b[i]))
                return false;
        }
        return true;
    }
    if (typeof a === "object") {
        if (typeof b !== "object")
            return false;
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length)
            return false;
        if (!sameShape(aKeys, bKeys))
            return false;
        if (!sameShape(Object.values(a), Object.values(b)))
            return false;
        return true;
    }
    return false;
}
/**
 * Given an encoded buffer and known values shared between encoder and decoder,
 * return the value that was encoded.
 * Objects and Arrays will be lazilly decoded,
 * so only the root value is decoded eagerly.
 */
export function decode(encoded, knownValues = []) {
    // A DataView for convenience
    const encodedView = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    // Record offset as we go through the buffer
    let offset = 0;
    // Start decoding at the root
    return decodePart();
    function decodeNibsPair() {
        const b = encoded[offset++];
        const small = b >>> 4;
        let big = b & 15;
        if (big < 12) {
            return [small, big];
        }
        if (big === 12) {
            return [small, encoded[offset++]];
        }
        if (big === 13) {
            big = encodedView.getUint16(offset, true);
            offset += 2;
            return [small, big];
        }
        if (big === 14) {
            big = encodedView.getUint32(offset, true);
            offset += 4;
            return [small, big];
        }
        big = Number(encodedView.getBigUint64(offset, true));
        offset += 8;
        return [small, big];
    }
    /**
     * Consume one value as cheaply as possible by only moving offset.
     */
    function skip() {
        const [tag, num] = decodeNibsPair();
        if (!primitiveTags[tag]) {
            offset += num;
        }
    }
    function intToFloat(num) {
        const buf = new ArrayBuffer(4);
        const view = new DataView(buf);
        view.setUint32(0, num, true);
        return view.getFloat32(0, true);
    }
    /**
     * Return the next value in the stream.
     * Note: offset is implicitly modified.
     */
    function decodePart() {
        const [tag, num] = decodeNibsPair();
        // Decode the value based on the tag
        if (tag === POINTER)
            return decodePointer(num);
        if (tag === REFERENCE)
            return knownValues[num];
        if (tag === POSINT)
            return num;
        if (tag === NEGINT)
            return -1 - num;
        if (tag === DEGREE)
            return num / 360;
        if (tag === PERCENT)
            return num / 100;
        if (tag === FLOAT)
            return intToFloat(num);
        if (tag === SIMPLE) {
            if (num === TRUE)
                return true;
            if (num === FALSE)
                return false;
            if (num === NULL)
                return null;
        }
        // All other types are length-prefixed containers of some kind
        const start = offset;
        const end = offset + num;
        let val;
        if (tag === MAP)
            val = wrapObject(start, end);
        else if (tag === LIST)
            val = wrapList(start, end);
        else if (tag === ARRAY)
            val = wrapArray(start, end);
        else if (tag === STRING)
            val = stringSlice(start, end);
        else
            throw new Error("Unknown or invalid tag: " + tag);
        offset = end;
        return val;
    }
    function stringSlice(start, end) {
        return utf8decoder.decode(encoded.subarray(start, end));
    }
    function decodePointer(dist) {
        const saved = offset;
        offset += dist;
        const seen = decodePart();
        offset = saved;
        return seen;
    }
    /**
     * Lazy object wrapper that decodes keys eagerly but values lazily.
     */
    function wrapObject(start, end) {
        const obj = {};
        offset = start;
        while (offset < end) {
            const key = String(decodePart());
            magicGetter(obj, key, offset);
            skip();
        }
        return obj;
    }
    /**
     * Lazy array wrapper that decodes offsets eagerly but values lazily.
     */
    function wrapList(start, end) {
        const arr = [];
        let index = 0;
        offset = start;
        while (offset < end) {
            magicGetter(arr, index, offset);
            skip();
            index++;
        }
        return arr;
    }
    /**
     * Lazy array wrapper that decodes offsets eagerly but values lazily.
     */
    function wrapArray(start, end) {
        const [width, count] = decodeNibsPair();
        const indexStart = offset;
        const indexEnd = indexStart + width * count;
        const arr = [];
        return new Proxy(arr, {
            get(target, property) {
                if (property === "length") {
                    return count;
                }
                if (typeof property === "string" && /^[1-9][0-9]*$/.test(property)) {
                    const index = parseInt(property, 10);
                    if (index >= 0 && index < count) {
                        // Jump to and read index pointer
                        offset = indexStart + width * index;
                        let ptr = 0;
                        for (let i = 0; i < width; i++) {
                            throw "TODO";
                            // ptr = ptr * 64 + b64Value(buffer[offset++]);
                        }
                        // Jump to where the pointer points
                        offset = indexEnd + ptr;
                        const val = decodePart();
                        target[index] = val;
                        return val;
                    }
                }
                return undefined;
            },
        });
    }
    /**
     * Define the property with a getter that decodes the value
     * and replaces the getter with a value on first access.
     */
    function magicGetter(obj, key, valueOffset) {
        Object.defineProperty(obj, key, {
            get() {
                const savedOffset = offset;
                offset = valueOffset;
                const value = decodePart();
                offset = savedOffset;
                Object.defineProperty(obj, key, {
                    value,
                    enumerable: true,
                    configurable: false,
                    writable: false,
                });
                return value;
            },
            enumerable: true,
            configurable: true,
        });
    }
}
