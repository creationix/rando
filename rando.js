let utf8decoder = new TextDecoder();
let utf8Encoder = new TextEncoder();
const NULL = utf8Encoder.encode("?");
const TRUE = utf8Encoder.encode("^");
const FALSE = utf8Encoder.encode("!");
/**
 * Given a value and optional list of known values shared between encoder and decoder,
 * return a string representation of the value.
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
    return utf8decoder.decode(buffer);
    function push(value) {
        parts.push(value);
        const len = value.byteLength;
        size += len;
        return len;
    }
    function pushStr(value) {
        return push(utf8Encoder.encode(value));
    }
    function pushInline(num, tag) {
        return pushStr(b64Encode(num) + tag);
    }
    function pushContainer(written, tag) {
        return written + pushStr(b64Encode(written) + tag);
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
            return pushInline(known, "&");
        // If the value has been seen before and a pointer is
        // cheaper than encoding it again, encode it as a pointer
        let seen = seenPrimitives.get(value);
        if (seen) {
            const [seenOffset, cost] = seen;
            const dist = size - seenOffset;
            const pointerCost = sizeNeeded(dist) + 1;
            if (pointerCost < cost)
                return pushInline(dist, "*");
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
            return push(NULL);
        if (value === true)
            return push(TRUE);
        if (value === false)
            return push(FALSE);
        if (Array.isArray(value))
            return encodeList(value);
        if (typeof value === "object")
            return encodeObject(value);
        if (typeof value === "string")
            return encodeString(value);
        if (typeof value === "number")
            return encodeNumber(value);
        console.warn("Unsupported value", value);
        return push(NULL);
    }
    function encodeString(value) {
        return pushContainer(pushStr(value), "$");
    }
    function encodeNumber(value) {
        if (Number.isInteger(value)) {
            if (value >= 0) {
                return pushInline(value, "+");
            }
            return pushInline(-1 - value, "~");
        }
        if (value > 0 && value < 2.3e13) {
            const percent = Math.round(value * 100);
            if (Math.abs(percent - value * 100) < 1e-15) {
                return pushInline(percent, "%");
            }
            const degree = Math.round(value * 360);
            if (Math.abs(degree - value * 360) < 1e-15) {
                return pushInline(degree, "@");
            }
        }
        return pushContainer(pushStr(value.toString()), ".");
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
        return pushContainer(written, ";");
    }
    function encodeList(value) {
        const start = size;
        let written = 0;
        const indexed = value.length > 100;
        const offsets = [];
        for (let i = value.length - 1; i >= 0; --i) {
            const valueSize = encodeAny(value[i]);
            offsets[i] = size;
            written += valueSize;
        }
        const end = size;
        if (written !== end - start)
            throw new Error("Size mismatch");
        if (indexed) {
            const count = offsets.length;
            const width = sizeNeeded(end - offsets[count - 1]);
            for (let i = count - 1; i >= 0; i--) {
                pushStr(b64Encode(end - offsets[i]).padStart(width, "A"));
            }
            pushStr(`${b64Encode(width)}:${b64Encode(count)}:`);
            return pushContainer(size - start, "#");
        }
        return pushContainer(written, ":");
    }
}
const primitiveTags = {
    "+": "positive",
    "~": "negative",
    "!": "false",
    "^": "true",
    "?": "null",
    "*": "seen",
    "&": "known",
    "@": "degree",
    "%": "percent",
};
function b64Value(b) {
    if (b >= 65 && b <= 90)
        return b - 65; // A-Z
    if (b >= 97 && b <= 122)
        return b - 71; // a-z
    if (b >= 48 && b <= 57)
        return b + 4; // 0-9
    if (b === 45)
        return 62; // -
    if (b === 95)
        return 63; // _
    return -1;
}
/**
 * Given an encoded string and known values shared between encoder and decoder,
 * return the value that was encoded.
 * Objects and Arrays will be lazilly decoded,
 * so only the root value is decoded eagerly.
 */
export function decode(encoded, knownValues = []) {
    // Convert to UTF-8 form so the byte offsets make sense
    console.time("parse");
    const buffer = utf8Encoder.encode(encoded);
    // Record offset as we go through the buffer
    let offset = 0;
    // Start decoding at the root
    return decodePart();
    /**
     * Consume b64 characters and return as string
     */
    function parseB64() {
        const s = offset;
        let num = 0;
        let b;
        while ((b = b64Value(buffer[offset])) >= 0) {
            num = num * 64 + b;
            offset++;
        }
        return num;
    }
    /**
     * Consume one value as cheaply as possible by only moving offset.
     */
    function skip() {
        const num = parseB64();
        const tag = String.fromCharCode(buffer[offset++]);
        if (!primitiveTags[tag]) {
            offset += num;
        }
    }
    /**
     * Return the next value in the stream.
     * Note: offset is implicitly modified.
     */
    function decodePart() {
        const bstart = offset;
        const num = parseB64();
        const bend = offset;
        const tag = String.fromCharCode(buffer[offset++]);
        // Decode the value based on the tag
        if (tag === "*")
            return decodePointer(num);
        if (tag === "&")
            return knownValues[num];
        if (tag === "+")
            return num;
        if (tag === "~")
            return -1 - num;
        if (tag === "@")
            return num / 360;
        if (tag === "%")
            return num / 100;
        if (tag === "^")
            return true;
        if (tag === "!")
            return false;
        if (tag === "?")
            return null;
        // All other types are length-prefixed containers of some kind
        const start = offset;
        const end = offset + num;
        let val;
        if (tag === ";")
            val = wrapObject(start, end);
        else if (tag === ":")
            val = wrapList(start, end);
        else if (tag === "#")
            val = wrapArray(start, end);
        else if (tag === "$")
            val = stringSlice(start, end);
        else if (tag === ".")
            val = parseFloat(stringSlice(start, end));
        else
            throw new Error("Unknown or invalid tag: " + tag);
        offset = end;
        return val;
    }
    function stringSlice(start, end) {
        return utf8decoder.decode(buffer.subarray(start, end));
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
        const width = parseB64();
        if (String.fromCharCode(buffer[offset++]) !== ":") {
            throw new Error("Missing index ':'");
        }
        const count = parseB64();
        if (String.fromCharCode(buffer[offset++]) !== ":") {
            throw new Error("Missing index ':'");
        }
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
                            ptr = ptr * 64 + b64Value(buffer[offset++]);
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
const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function b64Encode(num) {
    let str = "";
    while (num > 0) {
        str = chars[num % 64] + str;
        num = Math.floor(num / 64);
    }
    return str;
}
function sizeNeeded(num) {
    if (num === 0)
        return 0;
    return Math.floor(Math.log(num) / Math.log(64) + 1);
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
const values = [
    0,
    1,
    10,
    100,
    1000,
    -1,
    -10,
    -100,
    -1000,
    1 / 30,
    0.13,
    3.14159,
    true,
    false,
    null,
    "",
    "Banana",
    "Hi, World",
    "🍌",
    [1, 2, 3],
    [100, 100, 100],
    { a: 1, b: 2, c: 3 },
    [{ name: "Alice" }, { name: "Bob" }],
];
console.log(`| JSON       | Rando      |`);
console.log(`| ----------:|:---------- |`);
for (const v of values) {
    console.log(`| ${("`" + JSON.stringify(v) + "`").padStart(20, " ")} | ${("`" +
        encode(v) +
        "`").padEnd(20, " ")} |`);
}
