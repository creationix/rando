let utf8decoder = new TextDecoder();
let utf8Encoder = new TextEncoder();

const POSINT = "+".charCodeAt(0);
const NEGINT = "~".charCodeAt(0);
const STRING = "$".charCodeAt(0);
const BYTES = "=".charCodeAt(0); // Consider https://github.com/qntm/base32768
const MAP = ";".charCodeAt(0);
const LIST = ":".charCodeAt(0);
const ARRAY = "#".charCodeAt(0);
const FLOAT = ".".charCodeAt(0);
const PERCENT = "%".charCodeAt(0);
const DEGREE = "@".charCodeAt(0);
const SEEN = "*".charCodeAt(0);
const KNOWN = "&".charCodeAt(0);
const NULL = new Uint8Array(["?".charCodeAt(0)]);
const TRUE = new Uint8Array(["^".charCodeAt(0)]);
const FALSE = new Uint8Array(["!".charCodeAt(0)]);

const converter = new DataView(new ArrayBuffer(4));

// Encode a binary value to base64 text, but stored in a Uint8Array
function base64EncodeBuffer(buffer: Uint8Array): Uint8Array {
  const length = buffer.length;
  const b64Length = Math.ceil((length * 8) / 6);
  const b64Buffer = new Uint8Array(b64Length);
  let b64Offset = 0;
  let bufferOffset = 0;
  let bits = 0;
  let bitsLength = 0;
  while (bufferOffset < length) {
    bits |= buffer[bufferOffset++] << bitsLength;
    bitsLength += 8;
    while (bitsLength >= 6) {
      b64Buffer[b64Offset++] = (bits & 63) + 65;
      bits >>= 6;
      bitsLength -= 6;
    }
  }
  if (bitsLength > 0) {
    b64Buffer[b64Offset++] = bits + 65;
  }
  return b64Buffer;
}

function castFloatToInt(num: number): number {
  converter.setFloat32(0, num, true);
  return converter.getUint32(0, true);
}

function castIntToFloat(num: number): number {
  converter.setUint32(0, num, true);
  return converter.getFloat32(0, true);
}

function decodeB64Byte(byte: number): number {
  if (byte >= 65 && byte <= 90) return byte - 65; // A-Z
  if (byte >= 97 && byte <= 122) return byte - 71; // a-z
  if (byte >= 48 && byte <= 57) return byte + 4; // 0-9
  if (byte === 45) return 62; // -
  if (byte === 95) return 63; // _
  return -1;
}

function encodeB64Byte(num: number): number {
  if (num >= 0 && num < 26) return num + 65; // A-Z
  if (num >= 26 && num < 52) return num + 71; // a-z
  if (num >= 52 && num < 62) return num - 4; // 0-9
  if (num === 62) return 45; // -
  if (num === 63) return 95; // _
  return -1;
}

/**
 * Given a value and optional list of known values shared between encoder and decoder,
 * return a string representation of the value.
 */
export function encode(
  rootValue: unknown,
  knownValues: unknown[] = []
): string {
  // Values that have been seen before, and the offset and cost of encoding them.
  const seenPrimitives = new Map<unknown, [number, number]>();
  // Strings and Numbers from `knownValues` and their offset index.
  const knownPrimitives = new Map<unknown, number>();
  // Objects and Arrays from `knownValues` and their offset index.
  const knownObjects = new Map<unknown, number>();
  // Create quick lookup maps for known values
  for (let i = 0, l = knownValues.length; i < l; i++) {
    const value = knownValues[i];
    if (typeof value === "string" || typeof value === "number") {
      knownPrimitives.set(value, i);
    } else if (value && typeof value === "object") {
      knownObjects.set(value, i);
    } else {
      console.warn("Unsupported known value", value);
    }
  }

  // Array of byte arrays to be combined into a single byte array
  const parts: Uint8Array[] = [];
  // A running total of the bytes in parts
  let size = 0;
  // Do the actual encoding

  const written = encodeAny(rootValue);
  // Merge all the parts into a single byte array
  if (written !== size) throw new Error("Size mismatch");
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (let i = parts.length - 1; i >= 0; --i) {
    const part = parts[i];
    buffer.set(part, offset);
    offset += part.byteLength;
  }
  // Return as a JavaScript string
  return utf8decoder.decode(buffer);

  /////////////////////////////////////////////////////////////////////////////

  function push(value: Uint8Array): number {
    parts.push(value);
    const len = value.byteLength;
    size += len;
    return len;
  }

  function pushStr(value: string) {
    return push(utf8Encoder.encode(value));
  }

  function pushHeader(tag: number, num: number) {
    const b64Bytes: number[] = [];
    while (num > 0) {
      b64Bytes.unshift(encodeB64Byte(num & 63));
      num = Math.floor(num / 64);
    }
    b64Bytes.push(tag);
    return push(new Uint8Array(b64Bytes));
  }

  function pushContainerHeader(tag: number, written: number) {
    return written + pushHeader(tag, written);
  }

  function encodeAny(value: unknown): number {
    // If the value is a known primitive or object, encode it as a pointer
    let known = knownPrimitives.get(value) ?? knownObjects.get(value);
    if (known === undefined && value && typeof value === "object") {
      for (const k of knownObjects.keys()) {
        if (sameShape(value, k)) {
          known = knownObjects.get(k)!;
          break;
        }
      }
    }
    if (typeof known === "number") return pushHeader(KNOWN, known);

    // If the value has been seen before and a pointer is
    // cheaper than encoding it again, encode it as a pointer
    let seen = seenPrimitives.get(value);
    if (seen) {
      const [seenOffset, cost] = seen;
      const dist = size - seenOffset;
      const pointerCost = sizeNeeded(dist) + 1;
      if (pointerCost < cost) return pushHeader(SEEN, dist);
    }

    // Encode the value and record how expensive it was to write
    const written = encodeAnyInner(value);

    // Record in the seen values map if it's a string or number
    if (typeof value === "string" || typeof value === "number") {
      seenPrimitives.set(value, [size, written]);
    }

    return written;
  }

  function encodeAnyInner(value: unknown): number {
    if (value == null) return push(NULL);
    if (value === true) return push(TRUE);
    if (value === false) return push(FALSE);
    if (Array.isArray(value)) return encodeList(value);
    if (typeof value === "object") return encodeObject(value);
    if (typeof value === "string") return encodeString(value);
    if (typeof value === "number") return encodeNumber(value);
    console.warn("Unsupported value", value);
    return push(NULL);
  }

  function encodeString(value: string): number {
    return pushContainerHeader(STRING, pushStr(value));
  }

  function encodeNumber(value: number): number {
    if (Number.isInteger(value)) {
      if (value >= 0) {
        return pushHeader(POSINT, value);
      }
      return pushHeader(NEGINT, -1 - value);
    }
    if (value > 0 && value < 2.3e13) {
      const percent = Math.round(value * 100);
      if (Math.abs(percent - value * 100) < 1e-15) {
        return pushHeader(PERCENT, percent);
      }
      const degree = Math.round(value * 360);
      if (Math.abs(degree - value * 360) < 1e-15) {
        return pushHeader(DEGREE, degree);
      }
    }
    return pushHeader(FLOAT, castFloatToInt(value));
  }

  function encodeObject(value: object): number {
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
    if (written !== end - start) throw new Error("Size mismatch");
    return pushContainerHeader(MAP, written);
  }

  function encodeList(value: unknown[]): number {
    const start = size;
    let written = 0;
    const indexed = value.length > 100;
    const offsets: number[] = [];
    for (let i = value.length - 1; i >= 0; --i) {
      const valueSize = encodeAny(value[i]);
      offsets[i] = size;
      written += valueSize;
    }
    const end = size;
    if (written !== end - start) throw new Error("Size mismatch");
    if (indexed) {
      const count = offsets.length;
      const width = sizeNeeded(end - offsets[count - 1]);
      for (let i = count - 1; i >= 0; i--) {
        pushStr(b64Encode(end - offsets[i]).padStart(width, "A"));
      }
      pushStr(`${b64Encode(width)}:${b64Encode(count)}:`);
      return pushContainerHeader(ARRAY, size - start);
    }
    return pushContainerHeader(LIST, written);
  }
}

const primitiveTags = new Set<number>([
  POSINT,
  NEGINT,
  DEGREE,
  PERCENT,
  FLOAT,
  FALSE[0],
  TRUE[0],
  NULL[0],
  KNOWN,
  SEEN,
]);

/**
 * Given an encoded string and known values shared between encoder and decoder,
 * return the value that was encoded.
 * Objects and Arrays will be lazilly decoded,
 * so only the root value is decoded eagerly.
 */
export function decode(encoded: string, knownValues: unknown[] = []): any {
  // Convert to UTF-8 form so the byte offsets make sense
  const buffer = utf8Encoder.encode(encoded);
  // Record offset as we go through the buffer
  let offset = 0;
  // Start decoding at the root
  return decodePart();

  function parseHeader(): [number, number] {
    let num = 0;
    let b: number;
    while ((b = decodeB64Byte(buffer[offset])) >= 0) {
      num = num * 64 + b;
      offset++;
    }
    const tag = buffer[offset++];
    return [tag, num];
  }

  /**
   * Consume one value as cheaply as possible by only moving offset.
   */
  function skip() {
    const [tag, num] = parseHeader();
    if (!primitiveTags.has(tag)) {
      offset += num;
    }
  }

  /**
   * Return the next value in the stream.
   * Note: offset is implicitly modified.
   */
  function decodePart(): unknown {
    const [tag, num] = parseHeader();

    // Decode the value based on the tag
    if (tag === SEEN) return decodePointer(num);
    if (tag === KNOWN) return knownValues[num];
    if (tag === POSINT) return num;
    if (tag === NEGINT) return -1 - num;
    if (tag === PERCENT) return num / 100;
    if (tag === DEGREE) return num / 360;
    if (tag === FLOAT) return castIntToFloat(num);
    if (tag === TRUE[0]) return true;
    if (tag === FALSE[0]) return false;
    if (tag === NULL[0]) return null;

    // All other types are length-prefixed containers of some kind
    const start = offset;
    const end = offset + num;
    let val: unknown;
    if (tag === MAP) val = wrapObject(start, end);
    else if (tag === LIST) val = wrapList(start, end);
    else if (tag === ARRAY) val = wrapArray(start, end);
    else if (tag === STRING) val = stringSlice(start, end);
    else throw new Error("Unknown or invalid tag: " + tag);
    offset = end;
    return val;
  }

  function stringSlice(start: number, end: number): string {
    return utf8decoder.decode(buffer.subarray(start, end));
  }

  function decodePointer(dist: number): unknown {
    const saved = offset;
    offset += dist;
    const seen = decodePart();
    offset = saved;
    return seen;
  }

  /**
   * Lazy object wrapper that decodes keys eagerly but values lazily.
   */
  function wrapObject(start: number, end: number): object {
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
  function wrapList(start: number, end: number): unknown[] {
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
  function wrapArray(start: number, end: number): unknown[] {
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

    const arr: unknown[] = [];
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
  function magicGetter(
    obj: object | unknown[],
    key: PropertyKey,
    valueOffset: number
  ): void {
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

const chars =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function b64Encode(num: number): string {
  let str = "";
  while (num > 0) {
    str = chars[num % 64] + str;
    num = Math.floor(num / 64);
  }
  return str;
}

function sizeNeeded(num: number): number {
  if (num === 0) return 0;
  return Math.floor(Math.log(num) / Math.log(64) + 1);
}

function sameShape(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!sameShape(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object") {
    if (typeof b !== "object") return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    if (!sameShape(aKeys, bKeys)) return false;
    if (!sameShape(Object.values(a), Object.values(b))) return false;
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
  console.log(
    `| ${("`" + JSON.stringify(v) + "`").padStart(20, " ")} | ${(
      "`" +
      encode(v) +
      "`"
    ).padEnd(20, " ")} |`
  );
}
