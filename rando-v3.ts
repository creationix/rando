// Primary types (4-bits)
const INTEGER = "+"; // zigzag(N)
const DEGREE = "@"; // zigzag(N * 360)
const FLOAT = "."; // *(*uint64_t)(&N) (cast to integer)
const TRUE = "!";
const FALSE = "~";
const NULL = "?";
const REF = "&"; // Reference to shared known value by offset index
const PTR = "*"; // Reference to inline value by byte offset from end of value
const TIME = ","; // Unix timestamp in ms
const B64STR = "'"; // base64 number as string
const STRING = "$"; // Contains UTF-8 encoded string bytes
const BYTES = "="; // Contains RAW bytes as BASE64URL encoded string
const REGEXP = "^"; // regexp pattern as string
const CHAIN = "/"; // String, bytes, or regexp broken into pieces
const LIST = ";"; // Multiple values in sequence
const MAP = ":"; // Multiple key-value pairs
const INDEX = "#"; // ARRAY or TRIE with inline index
const LINK = "("; // link to external resource
const TAG = ")"; // Tagged value

// URL Safe Base64
const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encodeZigZag(num: bigint): bigint {
  return num >= 0n ? num * 2n : -1n - num * 2n;
}

// Used to convert between f64 and u64
const converter = new DataView(new ArrayBuffer(8));
function encodeFloat(num: number): bigint {
  converter.setFloat64(0, num);
  return converter.getBigUint64(0);
}

function encode(rootVal: any, options = {}) {
  const parts: Uint8Array[] = [];
  let size = 0;
  const seen = new Map<any, number>();
  encodeAny(rootVal);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;

  function pushRaw(value: Uint8Array) {
    parts.push(value);
    return (size += value.byteLength);
  }

  function pushHeader(type: string, value: number | bigint) {
    const bytes: number[] = [];
    if (typeof value === "bigint") {
      while (value > 0n) {
        bytes.push(BASE64_CHARS.charCodeAt(Number(value % 64n)));
        value /= 64n;
      }
    } else if (value < 2 ** 32) {
      while (value > 0) {
        bytes.push(BASE64_CHARS.charCodeAt(value & 0x3f));
        value = value >>> 6;
      }
    } else {
      while (value > 0) {
        bytes.push(BASE64_CHARS.charCodeAt(value % 64));
        value = Math.floor(value / 64);
      }
    }
    bytes.push(type.charCodeAt(0));
    return pushRaw(new Uint8Array(bytes));
  }

  function encodeNumber(val: number) {
    if (Number.isSafeInteger(val)) {
      return pushHeader(INTEGER, encodeZigZag(BigInt(val)));
    }
    if (isNearlyWhole(val * 360)) {
      const degree = Math.round(val * 360);
      if (Number.isSafeInteger(degree)) {
        return pushHeader(DEGREE, encodeZigZag(BigInt(degree)));
      }
    }
    return pushHeader(FLOAT, encodeFloat(val));
  }

  function encodeString(val: string) {
    const body = new TextEncoder().encode(val);
    if (/^[a-zA-Z0-9-_]*$/.test(val)) {
      pushRaw(new Uint8Array([B64STR.charCodeAt(0)]));
      return pushRaw(body) + 1;
    }
    if (val.length > 20) {
      const segments = val
        .split(/([^a-zA-Z0-9]*[a-zA-Z0-9-_]+)/)
        .filter(Boolean);
      if (segments.length > 3) {
        console.log(segments);
        let length = 0;
        for (let i = segments.length - 1; i >= 0; i--) {
          length += encodeAny(segments[i]);
        }
        return pushHeader(CHAIN, length) + length;
      }
    }
    pushRaw(body);
    return pushHeader(STRING, body.byteLength);
  }

  function encodeList(val: any[]) {
    let size = 0;
    for (let i = val.length - 1; i >= 0; i--) {
      size += encodeAny(val[i]);
    }
    return pushHeader(LIST, size) + size;
  }

  function encodeMap(val: Record<string, any>) {
    let size = 0;
    const entries = Object.entries(val);
    for (let i = entries.length - 1; i >= 0; i--) {
      const [key, value] = entries[i];
      size += encodeAny(value);
      size += encodeAny(key);
    }
    return pushHeader(MAP, size) + size;
  }

  function encodeAny(val: unknown): number {
    if (seen.has(val)) {
      return pushHeader(PTR, size - seen.get(val)!);
    }
    const written = encodeAnyInner(val);
    if (written > 4) {
      seen.set(val, size);
    }
    return written;
  }

  function encodeAnyInner(val: unknown): number {
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
      return pushHeader(BYTES, val.byteLength) + val.byteLength;
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

const data = await Bun.file("data.json").json();
const bytes = encode(data);
const output = new TextDecoder().decode(bytes);
console.log(output.length);

// for (let i = 0; i < 1024; i++) {
//   console.log(i, String.fromCharCode(...encodeAnyValue(i)));
//   console.log(-1 - i, String.fromCharCode(...encodeAnyValue(-1 - i)));
//   console.log(
//     (i + 1) / 360,
//     String.fromCharCode(...encodeAnyValue((i + 1) / 360))
//   );
//   console.log(
//     (i + 1) / 100,
//     String.fromCharCode(...encodeAnyValue((i + 1) / 100))
//   );
//   let n = Math.floor(Math.random() * 3600 * 2 - 3600) / 3600;
//   console.log(n, String.fromCharCode(...encodeAnyValue(n)));
// }
