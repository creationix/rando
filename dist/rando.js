// Inline values
const NULL = '?';
const FALSE = '~';
const TRUE = '!';
const REF = '&'; // Reference to shared known value by offset index
const PTR = '*'; // Reference to inline value by byte offset from end of value
const INTEGER = '+'; // zigzag(N)
const RATIONAL = '/'; // Rational number as zigzag(num)|dem
const DECIMAL = '.'; // Decimal (base 10 exponent) number as zigzag(base)|zigzag(exp)
// Separator for multiple parts (used by RATIONAL and DECIMAL)
// For example, 1/3 would be encoded as:
//   B64(zigzag(1)) "|" B64(3) "/"
// And 12.34 as decimal would be encoded as:
//   B64(zigzag(1234)) "|" B64(zigzag(2)) "."
// Separator is one case in the grammar where
// multiple b64 values are required to skip a frame.
const SEP = '|';
// Byte Container Types
const STRING = '$'; // Contains UTF-8 encoded string bytes
const BYTES = '='; // Contains RAW bytes as BASE64URL encoded string
const CHAIN = ','; // String, bytes, or regexp broken into pieces
// Recursive Container Types
const LIST = ';'; // Multiple values in sequence
const MAP = ':'; // Multiple key-value pairs
// Indexed containers:
//   O(n) LIST become O(1) ARRAY
//   O(n) MAP becomes O(log n) TRIE
// For example an indexed LIST (aka an ARRAY) would be encoded as:
//   B64(size) "#" B64(count) "|" B64(width) ";" index ...values
// The `size` would include everything after the `#`, thus
// this is not an exception to the grammar, but a normal frame.
const INDEXED = '#';
const LIST_BRACES = '[]';
const MAP_BRACES = '{}';
const CHAIN_BRACES = '()';
const BYTES_BRACES = '<>';
const binaryTypes = {
    [NULL]: 0,
    [FALSE]: 1,
    [TRUE]: 2,
    [REF]: 3,
    [PTR]: 4,
    [INTEGER]: 5,
    [RATIONAL]: 6,
    [DECIMAL]: 7,
    [SEP]: 8,
    [STRING]: 9,
    [BYTES]: 10,
    [CHAIN]: 11,
    [LIST]: 12,
    [MAP]: 13,
    [INDEXED]: 14,
};
// URL Safe Base64 ordered similar to decimal and hecadecimal
// Used for digits of variable length integers.
const BASE64_DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';
// Normal URL Safe Base64 used for encoding of binary data
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function decodeB64(buf, offset = 0, end = buf.length) {
    let num = 0n;
    while (offset < end) {
        const byte = buf[offset];
        const index = BASE64_DIGITS.indexOf(String.fromCharCode(byte));
        if (index < 0) {
            // skip whitespace
            if (byte === 32 || byte === 10 || byte === 13 || byte === 9) {
                offset++;
                continue;
            }
            break;
        }
        offset++;
        num = num * 64n + BigInt(index);
    }
    if (Number.isSafeInteger(Number(num))) {
        return [Number(num), offset];
    }
    return [num, offset];
}
// When encoding variable integers using the B64 chars, they are encoded in little endian
// This means that the first character is the least significant digit.
// This is the opposite of the normal big endian encoding of numbers.
export function encodeB64(num) {
    const bytes = [];
    if (typeof num === 'bigint') {
        while (num > 0n) {
            bytes.push(BASE64_DIGITS.charCodeAt(Number(num % 64n)));
            num /= 64n;
        }
    }
    else if (num < 2 ** 32) {
        while (num > 0) {
            bytes.push(BASE64_DIGITS.charCodeAt(num & 63));
            num >>>= 6;
        }
    }
    else {
        while (num > 0) {
            bytes.push(BASE64_DIGITS.charCodeAt(num % 64));
            num = Math.floor(num / 64);
        }
    }
    bytes.reverse();
    return bytes;
}
function parseBase64(value) {
    const output = [];
    for (let i = 0, l = value.length; i < l;) {
        const byte1 = BASE64_CHARS.indexOf(String.fromCharCode(value[i++]));
        const byte2 = BASE64_CHARS.indexOf(String.fromCharCode(value[i++]));
        output.push((byte1 << 2) | (byte2 >> 4));
        if (i >= l) {
            break;
        }
        const byte3 = BASE64_CHARS.indexOf(String.fromCharCode(value[i++]));
        output.push(((byte2 & 0x0f) << 4) | (byte3 >> 2));
        if (i >= l) {
            break;
        }
        const byte4 = BASE64_CHARS.indexOf(String.fromCharCode(value[i++]));
        output.push(((byte3 & 0x03) << 6) | byte4);
    }
    return new Uint8Array(output);
}
function encodeZigZag(num) {
    return num >= 0n ? num * 2n : -1n - num * 2n;
}
function decodeZigZag(num) {
    return num & 1n ? -(num >> 1n) - 1n : num >> 1n;
}
function toNumberMaybe(num) {
    if (Number.isSafeInteger(Number(num))) {
        return Number(num);
    }
    return num;
}
const decMatch = /^(?<whole>[+-]?\d+?)(?<zeroes>0*)(?:\.(?<part>\d+))?(?:[eE](?<epow>[+-]?\d+))?$/;
// Split a float into signed integer parts of base and exponent base 10
// This uses the built-in string conversion to get the parts
export function splitDecimal(val) {
    const str = val.toString();
    // Count decimal or trailing zeroes or e-notation to get exponent
    const m = str.match(decMatch);
    if (!m) {
        throw new Error('Invalid float');
    }
    const { whole, zeroes, part, epow } = m.groups;
    let base;
    let exp;
    if (part) {
        base = BigInt(whole + (zeroes ?? '') + part);
        exp = -part.length;
    }
    else {
        base = BigInt(whole);
        exp = base && zeroes ? zeroes.length : 0;
    }
    if (epow) {
        exp += parseInt(epow);
    }
    return [base, exp];
}
const defaults = {
    // Chain defaults were found by brute forcing all combinations on several datasets
    // But they can be adjusted for specific data for fine tuning.
    chainMinChars: 7,
    chainSplitter: /([^a-zA-Z0-9-_]*[a-zA-Z0-9-_]+)/,
    prettyPrint: false,
    knownValues: [],
    binaryHeaders: false,
    streamContainers: false,
};
export function findStringSegments(rootVal, options = {}) {
    const chainMinChars = options.chainMinChars ?? defaults.chainMinChars;
    const chainSplitter = options.chainSplitter ?? defaults.chainSplitter;
    const counts = {};
    walk(rootVal);
    return counts;
    function walk(val) {
        if (typeof val === 'string') {
            if (val.length < chainMinChars) {
                counts[val] = (counts[val] ?? 0) + 1;
            }
            else {
                for (const segment of val.split(chainSplitter).filter(Boolean)) {
                    counts[segment] = (counts[segment] ?? 0) + 1;
                }
            }
        }
        if (Array.isArray(val)) {
            for (const item of val) {
                walk(item);
            }
        }
        else if (val && typeof val === 'object') {
            if (val instanceof Map) {
                for (const [k, v] of val.entries()) {
                    walk(k);
                    walk(v);
                }
            }
            else {
                for (const [k, v] of Object.entries(val)) {
                    walk(k);
                    walk(v);
                }
            }
        }
    }
}
// Appriximate a number as a continued fraction
// This is used to encode floating point numbers as rational numbers
export function continuedFractionApproximation(num, maxIterations = 50, tolerance = 1e-9) {
    const sign = num < 0 ? -1 : 1;
    num = Math.abs(num);
    const coefficients = [];
    const integerPart = Math.floor(num);
    let fractionalPart = num - integerPart;
    coefficients.push(integerPart);
    let iterations = 0;
    while (fractionalPart > tolerance && iterations < maxIterations) {
        const reciprocal = 1 / fractionalPart;
        const nextIntPart = Math.floor(reciprocal);
        coefficients.push(nextIntPart);
        fractionalPart = reciprocal - nextIntPart;
        iterations++;
    }
    let numerator = 1;
    let denominator = 0;
    for (let i = coefficients.length - 1; i >= 0; i--) {
        const temp = numerator;
        numerator = coefficients[i] * numerator + denominator;
        denominator = temp;
    }
    numerator *= sign;
    return [numerator, denominator];
}
function encodeLeb128(num) {
    const bytes = [];
    while (num >= 0x80n) {
        bytes.push(Number(num & 0x7fn) | 0x80);
        num /= 128n;
    }
    bytes.push(Number(num));
    return bytes;
}
function injectWhitespace(bytes, depth) {
    for (let i = 0; i < depth; i++) {
        bytes.unshift(' '.charCodeAt(0));
    }
    if (depth) {
        bytes.unshift('\n'.charCodeAt(0));
    }
}
export function sameShape(a, b) {
    if (a === b) {
        return true;
    }
    if (!(a && typeof a === 'object' && b && typeof b === 'object')) {
        return false;
    }
    if (Array.isArray(a)) {
        if (!Array.isArray(b)) {
            return false;
        }
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (!sameShape(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }
    if (Array.isArray(b)) {
        return false;
    }
    return sameShape(Object.entries(a), Object.entries(b));
}
export function encodeBinary(rootVal, options = {}) {
    return encode(rootVal, {
        ...options,
        binaryHeaders: true,
        prettyPrint: false,
    });
}
export function stringify(rootVal, options = {}) {
    return new TextDecoder().decode(encode(rootVal, { ...options, binaryHeaders: false }));
}
export function encode(rootVal, options = {}) {
    const chainMinChars = options.chainMinChars ?? defaults.chainMinChars;
    const chainSplitter = options.chainSplitter ?? defaults.chainSplitter;
    const prettyPrint = options.prettyPrint ?? defaults.prettyPrint;
    const knownValues = options.knownValues ?? defaults.knownValues;
    const binaryHeaders = options.binaryHeaders ?? defaults.binaryHeaders;
    const streamContainers = options.streamContainers ?? defaults.streamContainers;
    let expectedSegments = findStringSegments(rootVal, options);
    const parts = [];
    let offset = 0;
    let depth = 0;
    const seen = new Map();
    const known = new Map();
    const knownObjects = knownValues.filter((v) => v && typeof v === 'object');
    const entries = Object.entries(expectedSegments)
        .filter(([str, count]) => count > 1 && str.length >= chainMinChars)
        .sort((a, b) => a[1] - b[1]);
    expectedSegments = Object.fromEntries(entries);
    for (let i = 0; i < knownValues.length; i++) {
        const value = knownValues[i];
        if (typeof value === 'string') {
            expectedSegments[value] = Infinity;
        }
        known.set(value, i);
    }
    encodeAny(rootVal);
    const bytes = new Uint8Array(offset);
    offset = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        bytes.set(part, offset);
        offset += part.byteLength;
    }
    return bytes;
    function pushRaw(value) {
        parts.push(value);
        offset += value.byteLength;
    }
    // Encode a binary value as url-safe base64
    function pushBase64(value) {
        const output = [];
        for (let i = 0, l = value.length; i < l;) {
            const byte1 = value[i++];
            output.push(BASE64_CHARS.charCodeAt(byte1 >> 2));
            if (i >= l) {
                output.push(BASE64_CHARS.charCodeAt((byte1 & 0x03) << 4));
            }
            else {
                const byte2 = value[i++];
                output.push(BASE64_CHARS.charCodeAt(((byte1 & 0x03) << 4) | ((byte2 || 0) >> 4)));
                if (i >= l) {
                    output.push(BASE64_CHARS.charCodeAt((byte2 & 0x0f) << 2));
                }
                else {
                    const byte3 = value[i++];
                    output.push(BASE64_CHARS.charCodeAt(((byte2 & 0x0f) << 2) | ((byte3 || 0) >> 6)));
                    output.push(BASE64_CHARS.charCodeAt(byte3 & 0x3f));
                }
            }
        }
        parts.push(new Uint8Array(output));
        offset += output.length;
    }
    function pushHeaderBinary(type, value) {
        const num = BigInt(value) * 16n + BigInt(binaryTypes[type]);
        return pushRaw(new Uint8Array(encodeLeb128(num)));
    }
    function pushHeader(type, value, trim = -1) {
        if (binaryHeaders) {
            return pushHeaderBinary(type, value);
        }
        const bytes = encodeB64(value);
        bytes.push(type.charCodeAt(0));
        if (prettyPrint) {
            if (trim < 0) {
                injectWhitespace(bytes, depth);
            }
            else {
                while (trim-- > 0) {
                    bytes.unshift(' '.charCodeAt(0));
                }
            }
        }
        return pushRaw(new Uint8Array(bytes));
    }
    function pushHeaderPair(type, value1, value2, trim = -1) {
        pushHeader(type, value2, 0);
        return pushHeader(SEP, value1, trim);
    }
    function encodeNumber(val, trim = -1) {
        if (val === Infinity) {
            return pushHeaderPair(RATIONAL, 2, 0, trim);
        }
        if (val === -Infinity) {
            return pushHeaderPair(RATIONAL, 1, 0, trim);
        }
        if (Number.isNaN(val)) {
            return pushHeaderPair(RATIONAL, 0, 0, trim);
        }
        const [base, exp] = splitDecimal(val);
        // console.log({ val, parts });
        // Encode integers as zigzag
        if (exp >= 0 && exp <= 3 && Number.isSafeInteger(val)) {
            return pushHeader(INTEGER, encodeZigZag(BigInt(val)), trim);
        }
        // Try to encode using rational when base is large and exp is negative
        // The goal is to detect repeating decimals that are actually rationals.
        if ((base <= -1000000n || base >= 1000000n) && exp < 0) {
            // Encode rational numbers as two integers
            const [numerator, denominator] = continuedFractionApproximation(val);
            if (numerator !== 0 &&
                numerator < 1e9 &&
                numerator > -1e9 &&
                denominator > 0 &&
                denominator < 1e9 &&
                Math.abs(numerator / denominator - val) < 1e-12) {
                return pushHeaderPair(RATIONAL, encodeZigZag(BigInt(numerator)), denominator, trim);
            }
        }
        // Fallthrough that encodes as decimal floating point
        return pushHeaderPair(DECIMAL, encodeZigZag(BigInt(base)), encodeZigZag(BigInt(exp)), trim);
    }
    function encodeString(val, trim = -1) {
        const body = new TextEncoder().encode(val);
        if (val.length >= chainMinChars) {
            const segments = val.split(chainSplitter).filter(Boolean);
            // combine segments that aren't expected to be reusable
            for (let i = segments.length - 1; i > 0; i--) {
                const exp = expectedSegments[segments[i]];
                const pexp = expectedSegments[segments[i - 1]];
                if (exp === undefined && pexp === undefined) {
                    segments.splice(i - 1, 2, segments[i - 1] + segments[i]);
                }
            }
            if (segments.length > 1) {
                if (streamContainers) {
                    pushRaw(new Uint8Array([CHAIN_BRACES.charCodeAt(1)]));
                }
                depth++;
                const before = offset;
                for (let i = segments.length - 1; i >= 0; i--) {
                    const segment = segments[i];
                    encodeAny(segment, 0);
                }
                depth--;
                if (streamContainers) {
                    return pushRaw(new Uint8Array([CHAIN_BRACES.charCodeAt(0)]));
                }
                return pushHeader(CHAIN, offset - before, trim);
            }
        }
        pushRaw(body);
        return pushHeader(STRING, body.byteLength, trim);
    }
    function encodeBinary(val, trim = -1) {
        if (streamContainers) {
            pushRaw(new Uint8Array([BYTES_BRACES.charCodeAt(1)]));
        }
        const start = offset;
        pushBase64(val);
        if (streamContainers) {
            return pushRaw(new Uint8Array([BYTES_BRACES.charCodeAt(0)]));
        }
        return pushHeader(BYTES, offset - start, trim);
    }
    function encodeList(val, trim = -1) {
        if (streamContainers) {
            pushRaw(new Uint8Array([LIST_BRACES.charCodeAt(1)]));
        }
        depth++;
        const before = offset;
        for (let i = val.length - 1; i >= 0; i--) {
            encodeAny(val[i]);
        }
        depth--;
        if (streamContainers) {
            return pushRaw(new Uint8Array([LIST_BRACES.charCodeAt(0)]));
        }
        return pushHeader(LIST, offset - before, trim);
    }
    function encodeObject(val, trim = -1) {
        if (val instanceof Map) {
            return encodeEntries([...val.entries()], trim);
        }
        return encodeEntries(Object.entries(val), trim);
    }
    function encodeEntries(entries, trim = -1) {
        if (streamContainers) {
            pushRaw(new Uint8Array([MAP_BRACES.charCodeAt(1)]));
        }
        depth++;
        const before = offset;
        for (let i = entries.length - 1; i >= 0; i--) {
            const [key, value] = entries[i];
            encodeAny(value, 1);
            encodeAny(key);
        }
        depth--;
        if (streamContainers) {
            return pushRaw(new Uint8Array([MAP_BRACES.charCodeAt(0)]));
        }
        return pushHeader(MAP, offset - before, trim);
    }
    function encodeAny(val, trim = -1) {
        if (known.has(val)) {
            return pushHeader(REF, known.get(val), trim);
        }
        if (val && typeof val === 'object') {
            for (const knownObj of knownObjects) {
                if (sameShape(val, knownObj)) {
                    return pushHeader(REF, known.get(knownObj), trim);
                }
            }
        }
        if (seen.has(val)) {
            // console.log("SEEN", val, seen.get(val));
            const s = seen.get(val);
            const dist = offset - s.offset;
            const cost = binaryHeaders
                ? Math.ceil(Math.log2(dist) / Math.log2(128))
                : Math.ceil(Math.log2(dist) / Math.log2(64)) + 1;
            if (cost < s.written) {
                return pushHeader(PTR, dist, trim);
            }
        }
        const before = offset;
        encodeAnyInner(val, trim);
        const written = offset - before;
        if (val && typeof val !== 'object' && written >= 3) {
            // console.log("STORE", val, written);
            seen.set(val, { offset, written });
        }
    }
    function encodeAnyInner(val, trim = -1) {
        if (typeof val === 'string') {
            return encodeString(val, trim);
        }
        if (typeof val === 'bigint') {
            return pushHeader(INTEGER, encodeZigZag(val), trim);
        }
        if (typeof val === 'number') {
            return encodeNumber(val, trim);
        }
        if (typeof val === 'boolean') {
            return pushHeader(val ? TRUE : FALSE, 0, trim);
        }
        if (val === null) {
            return pushHeader(NULL, 0, trim);
        }
        if (Array.isArray(val)) {
            return encodeList(val, trim);
        }
        if (val instanceof Uint8Array) {
            return encodeBinary(val, trim);
        }
        if (typeof val === 'object') {
            return encodeObject(val, trim);
        }
        throw new TypeError('Unsupported value');
    }
}
export function parse(rando, options = {}) {
    const buf = new TextEncoder().encode(rando);
    return decode(buf, options);
}
export function decode(rando, options = {}) {
    const knownValues = options.knownValues ?? [];
    return decodeAny(0)[0];
    function decodeAny(offset) {
        const [val, newOffset] = decodeB64(rando, offset);
        offset = newOffset;
        const tag = rando[offset++];
        if (tag === NULL.charCodeAt(0)) {
            return [null, offset];
        }
        if (tag === FALSE.charCodeAt(0)) {
            return [false, offset];
        }
        if (tag === TRUE.charCodeAt(0)) {
            return [true, offset];
        }
        if (tag === INTEGER.charCodeAt(0)) {
            return [toNumberMaybe(decodeZigZag(BigInt(val))), offset];
        }
        if (tag === SEP.charCodeAt(0)) {
            const [val2, newOffset] = decodeB64(rando, offset);
            offset = newOffset;
            const tag2 = rando[offset++];
            if (tag2 === RATIONAL.charCodeAt(0)) {
                return [Number(decodeZigZag(BigInt(val))) / Number(val2), offset];
            }
            if (tag2 === DECIMAL.charCodeAt(0)) {
                const str = `${decodeZigZag(BigInt(val)).toString(10)}e${decodeZigZag(BigInt(val2)).toString(10)}`;
                return [parseFloat(str), offset];
            }
            throw new Error(`Invalid type following separator: ${String.fromCharCode(tag2)}`);
        }
        if (tag === STRING.charCodeAt(0)) {
            const end = offset + Number(val);
            const str = new TextDecoder().decode(rando.slice(offset, end));
            return [str, end];
        }
        if (tag === BYTES.charCodeAt(0)) {
            const end = offset + Number(val);
            const bytes = parseBase64(rando.slice(offset, end));
            return [bytes, end];
        }
        if (tag === BYTES_BRACES.charCodeAt(0)) {
            const start = offset;
            while (rando[offset] !== BYTES_BRACES.charCodeAt(1)) {
                offset++;
            }
            const bytes = parseBase64(rando.slice(start, offset));
            return [bytes, offset + 1];
        }
        if (tag === LIST.charCodeAt(0)) {
            // TODO: lazy parsed list
            const end = offset + Number(val);
            const list = [];
            while (offset < end) {
                const [item, newOffset] = decodeAny(offset);
                list.push(item);
                offset = newOffset;
            }
            return [list, offset];
        }
        if (tag === LIST_BRACES.charCodeAt(0)) {
            const list = [];
            while (rando[offset] !== LIST_BRACES.charCodeAt(1)) {
                const [item, newOffset] = decodeAny(offset);
                list.push(item);
                offset = newOffset;
            }
            return [list, offset + 1];
        }
        if (tag === MAP.charCodeAt(0)) {
            // TODO: lazy parsed map
            const end = offset + Number(val);
            const map = {};
            while (offset < end) {
                const [key, newOffset] = decodeAny(offset);
                const [value, newerOffset] = decodeAny(newOffset);
                map[key] = value;
                offset = newerOffset;
            }
            return [map, offset];
        }
        if (tag === MAP_BRACES.charCodeAt(0)) {
            const map = {};
            while (rando[offset] !== MAP_BRACES.charCodeAt(1)) {
                const [key, newOffset] = decodeAny(offset);
                const [value, newerOffset] = decodeAny(newOffset);
                map[key] = value;
                offset = newerOffset;
            }
            return [map, offset + 1];
        }
        if (tag === CHAIN.charCodeAt(0)) {
            const parts = [];
            const end = offset + Number(val);
            while (offset < end) {
                const [part, newOffset] = decodeAny(offset);
                parts.push(String(part));
                offset = newOffset;
            }
            return [parts.join(''), offset];
        }
        if (tag === CHAIN_BRACES.charCodeAt(0)) {
            const parts = [];
            while (rando[offset] !== CHAIN_BRACES.charCodeAt(1)) {
                const [part, newOffset] = decodeAny(offset);
                parts.push(String(part));
                offset = newOffset;
            }
            return [parts.join(''), offset + 1];
        }
        if (tag === PTR.charCodeAt(0)) {
            return [decodeAny(offset + Number(val))[0], offset];
        }
        if (tag === REF.charCodeAt(0)) {
            return [knownValues[Number(val)], offset];
        }
        throw new SyntaxError(`Unknown parse type ${String.fromCharCode(tag)}`);
    }
}
