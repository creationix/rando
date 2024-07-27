const POSINT = 0
const NEGINT = 1
const PERCENT = 2
const DEGREE = 3
const POINTER = 4
const REFERENCE = 5
const SIMPLE = 6

const STRING = 8
const BYTES = 9
const FLOAT = 10
const LIST = 11
const MAP = 12

// Like rando, but binary using nibs headers
const FALSE = nibsEncode(SIMPLE, 0)
const TRUE = nibsEncode(SIMPLE, 1)
const NULL = nibsEncode(SIMPLE, 2)

/**
 * Given a value and optional list of known values shared between encoder and decoder,
 * return a binary representation of the value.
 */
export function encode(
  rootValue: unknown,
  knownValues: unknown[] = []
): Uint8Array {
  // Array of byte arrays to be combined into a single byte array
  const parts: Uint8Array[] = [];

  // A running total of the bytes in parts
  let size = 0;

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
  const written = encodeAny(rootValue);
  if (written !== size) throw new Error("Size mismatch");
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (let i = parts.length - 1; i >= 0; --i) {
    const part = parts[i];
    buffer.set(part, offset);
    offset += part.byteLength;
  }
  return buffer;

  function push(value: Uint8Array): number {
    parts.push(value);
    const len = value.byteLength;
    size += len;
    return len;
  }

  function pushStr(value: string) {
    return push(new TextEncoder().encode(value));
  }

  function pushNibs(num: number, tag: number) {
    return push(nibsEncode(tag, num));
  }

  function pushContainer(written: number, tag: number) {
    return written + pushNibs(tag, written);
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
    if (typeof known === "number") return pushNibs(known, REFERENCE);

    // If the value has been seen before and a pointer is
    // cheaper than encoding it again, encode it as a pointer
    let seen = seenPrimitives.get(value);
    if (seen) {
      const [seenOffset, cost] = seen;
      const dist = size - seenOffset;
      const pointerCost = sizeNeeded(dist);
      if (pointerCost < cost) return pushNibs(dist, POINTER);
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
    if (Array.isArray(value)) return encodeArray(value);
    if (ArrayBuffer.isView(value)) return encodeBytes(value);
    if (typeof value === "object") return encodeObject(value);
    if (typeof value === "string") return encodeString(value);
    if (typeof value === "number") return encodeNumber(value);
    console.warn("Unsupported value", value);
    return push(NULL);
  }

  function encodeBytes(value: ArrayBufferView): number {
    const buf = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return pushContainer(push(buf), BYTES);
  }

  function encodeString(value: string): number {
    if (/^[1-9a-zA-Z_-][0-9a-zA-Z_-]*$/.test(value)) {
      return pushStr(value + "'");
    }
    return pushContainer(pushStr(value), STRING);
  }

  function encodeNumber(value: number): number {
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
    return pushContainer(pushStr(value.toString()), FLOAT);
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
    return pushContainer(written, MAP);
  }

  function encodeArray(value: unknown[]): number {
    const start = size;
    let written = 0;
    for (let i = value.length - 1; i >= 0; --i) {
      const valueSize = encodeAny(value[i]);
      written += valueSize;
    }
    const end = size;
    if (written !== end - start) throw new Error("Size mismatch");
    return pushContainer(written, LIST);
  }
}

function nibsEncode(tag: number, num: number): Uint8Array {
  if (num < 12) {
    return new Uint8Array([tag << 4 | num]);
  }
  if (num < 0x100) {
    return new Uint8Array([tag << 4 | 12, num]);
  }
  if (num < 0x10000) {
    const buf = new Uint8Array(3);
    const view = new DataView(buf.buffer);
    buf[0] = tag << 4 | 13;
    view.setUint16(1, num, true);
    return buf;
  }
  if (num < 0x100000000) {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);
    buf[0] = tag << 4 | 14;
    view.setUint32(1, num, true);
    return buf;
  }
  const buf = new Uint8Array(9);
  const view = new DataView(buf.buffer);
  buf[0] = tag << 4 | 15;
  view.setBigUint64(1, BigInt(num), true);
  return buf;
}

function sizeNeeded(num: number): number {
  if (num < 12) return 1;
  if (num < 0x100) return 2;
  if (num < 0x10000) return 3;
  if (num < 0x100000000) return 5;
  return 9;
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
