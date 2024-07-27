const NULL = new TextEncoder().encode("?");
const TRUE = new TextEncoder().encode("^");
const FALSE = new TextEncoder().encode("!");
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
    return new TextDecoder().decode(buffer);
    function push(value) {
        parts.push(value);
        const len = value.byteLength;
        size += len;
        return len;
    }
    function pushStr(value) {
        return push(new TextEncoder().encode(value));
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
            return encodeArray(value);
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
        if (/^[1-9a-zA-Z_-][0-9a-zA-Z_-]*$/.test(value)) {
            return pushStr(value + "'");
        }
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
        return pushContainer(written, "{");
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
        return pushContainer(written, "[");
    }
}
const primitiveTags = {
    "'": "string",
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
/**
 * Given an encoded string and known values shared between encoder and decoder,
 * return the value that was encoded.
 * Objects and Arrays will be lazilly decoded,
 * so only the root value is decoded eagerly.
 */
export function decode(encoded, knownValues = []) {
    // Convert to UTF-8 form so the byte offsets make sense
    const buffer = new TextEncoder().encode(encoded);
    // Record offset as we go through the buffer
    let offset = 0;
    // Start decoding at the root
    return decodePart();
    // Test if an ascii byte is a valid base64 character
    function isB64Byte(b) {
        return ((b >= 48 && b <= 57) || // 0-9
            (b >= 65 && b <= 90) || // A-Z
            (b >= 97 && b <= 122) || // a-z
            b === 45 || // -
            b === 95 // _
        );
    }
    /**
     * Consume b64 characters and return as string
     */
    function consumeB64() {
        const start = offset;
        while (isB64Byte(buffer[offset]))
            offset++;
        return stringSlice(start, offset);
    }
    /**
     * Consume one value as cheaply as possible by only moving offset.
     */
    function skip() {
        const b64Str = consumeB64();
        const tag = String.fromCharCode(buffer[offset++]);
        if (!primitiveTags[tag]) {
            offset += b64Decode(b64Str);
        }
    }
    /**
     * Return the next value in the stream.
     * Note: offset is implicitly modified.
     */
    function decodePart() {
        const b64Str = consumeB64();
        const tag = String.fromCharCode(buffer[offset++]);
        // With `'` strings, the b64 number is the string
        if (tag === "'")
            return b64Str;
        // Everything else treats the b64 number as a number
        const num = b64Decode(b64Str);
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
        offset += num;
        if (tag === "{")
            return wrapObject(start, offset);
        if (tag === "[")
            return wrapArray(start, offset);
        if (tag === "$")
            return stringSlice(start, offset);
        if (tag === ".")
            return parseFloat(stringSlice(start, offset));
        throw new Error("Uknown of invalid tag: " + tag);
    }
    function stringSlice(start, end) {
        return new TextDecoder().decode(buffer.subarray(start, end));
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
     * Lazy array wrapper that decodes keys eagerly but values lazily.
     */
    function wrapArray(start, end) {
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
const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";
function b64Encode(num) {
    let str = "";
    while (num > 0) {
        str = chars[num % 64] + str;
        num = Math.floor(num / 64);
    }
    return str;
}
function b64Decode(str) {
    let num = 0;
    for (let i = 0, len = str.length; i < len; i++) {
        num = 64 * num + chars.indexOf(str[i]);
    }
    return num;
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
