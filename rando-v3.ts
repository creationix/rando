// Inline values
const NULL = "?";
const FALSE = "~";
const TRUE = "!";
const REF = "&"; // Reference to shared known value by offset index
const PTR = "*"; // Reference to inline value by byte offset from end of value
const INTEGER = "+"; // zigzag(N)
const RATIONAL = "/"; // Rational number as zigzag(num)|dem
const DECIMAL = "."; // Decimal (base 10 exponent) number as zigzag(base)|zigzag(exp)
// Separator for multiple parts (used by RATIONAL and DECIMAL)
// For example, 1/3 would be encoded as:
//   B64(zigzag(1)) "|" B64(3) "/"
// And 12.34 as decimal would be encoded as:
//   B64(zigzag(1234)) "|" B64(zigzag(2)) "."
// Separator is one case in the grammar where
// multiple b64 values are required to skip a frame.
const SEP = "|";

// Byte Container Types
const STRING = "$"; // Contains UTF-8 encoded string bytes
const BYTES = "="; // Contains RAW bytes as BASE64URL encoded string
const CHAIN = ","; // String, bytes, or regexp broken into pieces

// Recursive Container Types
const LIST = ";"; // Multiple values in sequence
const MAP = ":"; // Multiple key-value pairs
// Indexed containers:
//   O(n) LIST become O(1) ARRAY
//   O(n) MAP becomes O(log n) TRIE
// For example an indexed LIST (aka an ARRAY) would be encoded as:
//   B64(size) "#" B64(count) "|" B64(width) ";" index ...values
// The `size` would include everything after the `#`, thus
// this is not an exception to the grammar, but a normal frame.
const INDEXED = "#";
const LINK = "@"; // Symlink to another document
// Tagged value, the next value is part of the tag
// For example a string can be tagged
//     B64(tag) "%" B64(size) "$" data
// Tag is the other place in the grammar where multiple
// b64 values are required to skip a frame.
const TAG = "%";

// URL Safe Base64
const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// When encoding variable integers using the B64 chars, they are encoded in little endian
// This means that the first character is the least significant digit.
// This is the opposite of the normal big endian encoding of numbers.
function encodeB64(num: bigint | number): number[] {
  const bytes: number[] = [];
  if (typeof num === "bigint") {
    while (num > 0n) {
      bytes.push(BASE64_CHARS.charCodeAt(Number(num % 64n)));
      num /= 64n;
    }
  } else if (num < 2 ** 32) {
    while (num > 0) {
      bytes.push(BASE64_CHARS.charCodeAt(num & 0x3f));
      num = num >>> 6;
    }
  } else {
    while (num > 0) {
      bytes.push(BASE64_CHARS.charCodeAt(num % 64));
      num = Math.floor(num / 64);
    }
  }
  return bytes;
}

function encodeZigZag(num: bigint): bigint {
  return num >= 0n ? num * 2n : -1n - num * 2n;
}

// Split a float into signed integer parts of base and exponent base 10
// This uses the built-in string conversion to get the parts
function splitDecimal(val: number) {
  const str = val.toString();
  // Count decimal or trailing zeroes or e-notation to get exponent
  const m = str.match(
    /^(?<whole>[+-]?\d+?)(?<zeroes>0*)(?:\.(?<part>\d+))?(?:[eE](?<epow>[+-]?\d+))?$/
  );
  if (!m) {
    console.log({ val, str });
    throw new Error("Invalid float");
  }
  const { whole, zeroes, part, epow } = m.groups!;
  const power = part ? part.length : zeroes ? -zeroes.length : 0;
  let base: bigint;
  let exp: number;
  if (part) {
    base = BigInt(whole + (zeroes ?? "") + part);
    exp = -part.length;
  } else if (zeroes) {
    base = BigInt(whole);
    exp = zeroes.length;
  } else {
    base = BigInt(whole);
    exp = 0;
  }
  if (epow) {
    exp += parseInt(epow);
  }
  return { base, exp };
}

interface EncodeOptions {
  chainMinChars?: number;
  chainSplitter?: RegExp;
  prettyPrint?: boolean;
  knownValues?: any[];
}

const defaults = {
  // Chain defaults were found by brute forcing all combinations on several datasets
  // But they can be adjusted for specific data for fine tuning.
  chainMinChars: 8,
  chainSplitter: /([^a-zA-Z0-9 _-]*[a-zA-Z0-9 _-]+)/,
  prettyPrint: false,
  knownValues: [],
};

export function findStringSegments(rootVal: any, options: EncodeOptions = {}) {
  const chainMinChars = options.chainMinChars ?? defaults.chainMinChars;
  const chainSplitter = options.chainSplitter ?? defaults.chainSplitter;
  const counts: { [val: string]: number } = {};
  walk(rootVal);
  return counts;
  function walk(val: any) {
    if (typeof val === "string") {
      if (val.length < chainMinChars) {
        counts[val] = (counts[val] ?? 0) + 1;
      } else {
        for (const segment of val.split(chainSplitter).filter(Boolean)) {
          counts[segment] = (counts[segment] ?? 0) + 1;
        }
      }
    } else if (Array.isArray(val)) {
      for (const item of val) {
        walk(item);
      }
    } else if (val && typeof val === "object") {
      for (const [k, v] of Object.entries(val)) {
        walk(k);
        walk(v);
      }
    }
  }
}

// Appriximate a number as a continued fraction
// This is used to encode floating point numbers as rational numbers
function continuedFractionApproximation(
  num: number,
  maxIterations = 50,
  tolerance = 1e-9
) {
  const sign = num < 0 ? -1 : 1;
  num = Math.abs(num);
  let coefficients: number[] = [];
  let integerPart = Math.floor(num);
  let fractionalPart = num - integerPart;
  coefficients.push(integerPart);
  let iterations = 0;
  while (fractionalPart > tolerance && iterations < maxIterations) {
    let reciprocal = 1 / fractionalPart;
    let nextIntPart = Math.floor(reciprocal);
    coefficients.push(nextIntPart);
    fractionalPart = reciprocal - nextIntPart;
    iterations++;
  }
  let numerator = 1;
  let denominator = 0;
  for (let i = coefficients.length - 1; i >= 0; i--) {
    let temp = numerator;
    numerator = coefficients[i] * numerator + denominator;
    denominator = temp;
  }
  numerator *= sign;
  return { numerator, denominator, coefficients };
}

// Number of base64 digits needed to encode number
function b64SizeNeeded(num: number): number {
  return Math.ceil(Math.log2(num) / Math.log2(64));
}
function sizeNeeded(option: { tag: string; a: bigint; b: bigint }) {
  return b64SizeNeeded(Number(option.a)) + b64SizeNeeded(Number(option.b)) + 2;
}

function injectWhitespace(bytes: number[], depth: number) {
  for (let i = 0; i < depth; i++) {
    bytes.unshift(" ".charCodeAt(0));
  }
  if (depth) bytes.unshift("\n".charCodeAt(0));
}

export function encode(rootVal: any, options: EncodeOptions = {}) {
  const chainMinChars = options.chainMinChars ?? defaults.chainMinChars;
  const chainSplitter = options.chainSplitter ?? defaults.chainSplitter;
  const prettyPrint = options.prettyPrint ?? defaults.prettyPrint;
  const knownValues = options.knownValues ?? defaults.knownValues;
  let expectedSegments = findStringSegments(rootVal, options);
  const parts: Uint8Array[] = [];
  let offset = 0;
  let depth = 0;
  const seen = new Map<any, { offset: number; written: number }>();
  const known = new Map<any, number>();
  const entries = Object.entries(expectedSegments)
    .filter((a) => a[1] > 1 && a[0].length > chainMinChars)
    .sort((a, b) => a[1] - b[1]);
  expectedSegments = Object.fromEntries(entries);
  for (let i = 0; i < knownValues.length; i++) {
    const value = knownValues[i];
    if (typeof value === "string") {
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

  function pushRaw(value: Uint8Array) {
    parts.push(value);
    offset += value.byteLength;
  }

  function pushHeader(type: string, value: number | bigint) {
    const bytes = encodeB64(value);
    bytes.push(type.charCodeAt(0));
    if (prettyPrint) {
      injectWhitespace(bytes, depth);
    }
    return pushRaw(new Uint8Array(bytes));
  }

  function pushHeaderPair(
    type: string,
    value1: number | bigint,
    value2: number | bigint
  ) {
    const b1 = encodeB64(value1);
    const b2 = encodeB64(value2);
    const bytes = [...b1, SEP.charCodeAt(0), ...b2, type.charCodeAt(0)];
    if (prettyPrint) {
      injectWhitespace(bytes, depth);
    }
    return pushRaw(new Uint8Array(bytes));
  }

  function encodeNumber(val: number) {
    if (val === Infinity) {
      return pushHeaderPair(RATIONAL, 2, 0);
    } else if (val === -Infinity) {
      return pushHeaderPair(RATIONAL, 1, 0);
    } else if (Number.isNaN(val)) {
      return pushHeaderPair(RATIONAL, 0, 0);
    }

    const parts = splitDecimal(val);
    // console.log({ val, parts });

    // Encode integers as zigzag
    if (parts.exp >= 0 && parts.exp <= 3 && Number.isSafeInteger(val)) {
      return pushHeader(INTEGER, encodeZigZag(BigInt(val)));
    }

    // Try to encode using rational when base is large and exp is negative
    // The goal is to detect repeating decimals that are actually rationals.
    if ((parts.base <= -1000000n || parts.base >= 1000000n) && parts.exp < 0) {
      // Encode rational numbers as two integers
      const { numerator, denominator } = continuedFractionApproximation(val);
      if (
        numerator != 0 &&
        numerator < 1e9 &&
        numerator > -1e9 &&
        denominator > 0 &&
        denominator < 1e9
      ) {
        // console.log({ numerator, denominator });
        const mul = numerator / denominator;
        if (Math.abs(mul - val) < 1e-12) {
          return pushHeaderPair(
            RATIONAL,
            encodeZigZag(BigInt(numerator)),
            denominator
          );
        }
      }
    }

    // Fallthrough that encodes as decimal floating point
    return pushHeaderPair(
      DECIMAL,
      encodeZigZag(BigInt(parts.base)),
      encodeZigZag(BigInt(parts.exp))
    );
  }

  function encodeString(val: string) {
    const body = new TextEncoder().encode(val);
    if (val.length >= chainMinChars) {
      const segments = val.split(chainSplitter).filter(Boolean);
      // combine segments that aren't expected to be reusable
      for (let i = segments.length - 1; i > 0; i--) {
        let exp = expectedSegments[segments[i]];
        let pexp = expectedSegments[segments[i - 1]];
        if (exp == undefined && pexp == undefined) {
          segments.splice(i - 1, 2, segments[i - 1] + segments[i]);
        }
      }

      if (segments.length > 1) {
        depth++;
        const before = offset;
        for (let i = segments.length - 1; i >= 0; i--) {
          const segment = segments[i];
          encodeAny(segment);
        }
        depth--;
        return pushHeader(CHAIN, offset - before);
      }
    }
    pushRaw(body);
    return pushHeader(STRING, body.byteLength);
  }

  function encodeList(val: any[]) {
    depth++;
    const before = offset;
    for (let i = val.length - 1; i >= 0; i--) {
      encodeAny(val[i]);
    }
    depth--;
    return pushHeader(LIST, offset - before);
  }

  function encodeMap(val: Record<string, any>) {
    depth++;
    const before = offset;
    const entries = Object.entries(val);
    for (let i = entries.length - 1; i >= 0; i--) {
      const [key, value] = entries[i];
      encodeAny(value);
      encodeAny(key);
    }
    depth--;
    return pushHeader(MAP, offset - before);
  }

  function encodeAny(val: unknown): void {
    if (known.has(val)) {
      return pushHeader(REF, known.get(val)!);
    }
    if (seen.has(val)) {
      // console.log("SEEN", val, seen.get(val));
      const s = seen.get(val)!;
      const dist = offset - s.offset;
      const cost = b64SizeNeeded(dist) + 1;
      if (cost < s.written) {
        return pushHeader(PTR, dist);
      }
    }
    const before = offset;
    encodeAnyInner(val);
    const written = offset - before;
    if (val && typeof val !== "object" && written >= 3) {
      // console.log("STORE", val, written);
      seen.set(val, { offset, written });
    }
  }

  function encodeAnyInner(val: unknown): void {
    if (typeof val === "string") {
      return encodeString(val);
    }
    if (typeof val === "bigint") {
      return pushHeader(INTEGER, encodeZigZag(val));
    }
    if (typeof val === "number") {
      return encodeNumber(val);
    }
    if (typeof val === "boolean") {
      return pushHeader(val ? TRUE : FALSE, 0);
    }
    if (val === null) {
      return pushHeader(NULL, 0);
    }
    if (Array.isArray(val)) {
      return encodeList(val);
    }
    if (val instanceof Uint8Array) {
      pushRaw(val);
      return pushHeader(BYTES, val.byteLength);
    }
    if (val instanceof RegExp) {
      throw new Error("TODO: Implement regexp encoding");
    }
    if (val instanceof Date) {
      throw new Error("TODO: Implement date encoding");
    }
    if (typeof val === "object") {
      return encodeMap(val);
    }

    console.log({ val });
    throw new TypeError("Unsupported value");
  }
}

// Returns true if the value is nearly a whole number
// This is used to encode floating point numbers as integers
function isNearlyWhole(val: number) {
  return Math.abs(val - Math.round(val)) < 1e-9;
}
