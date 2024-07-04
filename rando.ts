const chars =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";

export function sizeNeeded(num: number): number {
  if (num === 0) return 0;
  return Math.floor(Math.log(num) / Math.log(chars.length) + 1);
}

interface Tags {
  string?: string | number;
  binstring?: string | number;
  b64string?: string | number;
  splitstring?: string | number;
  posint?: string | number;
  negint?: string | number;
  percent?: string | number;
  degree?: string | number;
  float?: string | number;
  list?: string | number;
  map?: string | number;
  ref?: string | number;
  ptr?: string | number;
  simple?: string | number;
}

const defaultTags: Tags = {
  string: "$",
  binstring: "'",
  b64string: ":",
  splitstring: "/",
  posint: "+",
  negint: "~",
  percent: "%",
  degree: "@",
  float: ".",
  list: "[",
  map: "{",
  ref: "&",
  ptr: "*",
  simple: "!",
};

let arrays = 0;
let objects = 0;

const pointerLimit = 64 ** 2;

export function b64Encode(num: number | bigint): string {
  let str = "";
  let n = BigInt(num);
  const l = BigInt(chars.length);
  while (n > 0n) {
    str = chars[Number(n % l)] + str;
    n /= l;
  }
  return str;
}

export function b64Decode(str: string): number | bigint {
  let num = 0n;
  const l = BigInt(chars.length);
  for (let i = 0, len = str.length; i < len; i++) {
    num = l * num + BigInt(chars.indexOf(str[i]));
  }
  // convert back to number if within 53 bit mantissa range
  if (num < 2n ** 53n) {
    return Number(num);
  }
  return num;
}

export function encode(
  val: unknown,
  dict: unknown[] = [],
  tags: Tags = defaultTags
): string {
  const seenPrimitives = new Map<number | string, [number, number]>();
  const seenObjects = new Map<unknown[] | object, [number, number]>();
  const knownPrimitives = new Map<number | string, number>();
  const knownObjects = new Map<unknown[] | object, number>();
  for (let i = 0, l = dict.length; i < l; i++) {
    const d = dict[i];
    if (typeof d === "string" || typeof d === "number") {
      knownPrimitives.set(d, i);
    } else if (d && typeof d === "object") {
      knownObjects.set(d, i);
    } else {
      throw new TypeError("Invalid dictionary entry: " + d);
    }
  }

  const parts: string[] = [];
  let offset = 0;

  encodeUnknown(val);
  return parts.reverse().join("");

  function append(value: string): void {
    parts.push(value);
    const len = strlen(value);
    offset += len;
  }

  function header(len: number, type: string | number): void {
    append(b64Encode(len) + type);
  }

  function encodeStringInner(str: string): void {
    if (tags.binstring && str.length <= 53 && /^1[01]*$/.test(str)) {
      return header(parseInt(str, 2), tags.binstring);
    }
    if (
      tags.b64string &&
      str.length < 10 &&
      /^[a-z1-9_-][a-z0-9_-]*$/i.test(str)
    ) {
      return append(str + tags.b64string);
    }
    if (tags.string) {
      const start = offset;
      append(str);
      return header(offset - start, tags.string);
    }
    throw new TypeError("No string tags provided");
  }

  function encodeString(str: string): void {
    // Break up large strings so parts can be reused
    if (tags.splitstring && str.length > 13) {
      const parts = str.match(
        /(?:[^a-zA-Z0-9_ .-]*[a-zA-Z0-9_ .-]+|[^a-zA-Z0-9_ .-]+)/g
      )!;
      if (parts.length > 1 && parts[parts.length - 1].length <= 2) {
        parts[parts.length - 2] += parts.pop();
      }
      if (parts && parts.length > 1 && parts.join("").length === str.length) {
        const start = offset;
        for (let i = 0, l = parts.length; i < l; i++) {
          checkPrimitive<string>(encodeStringInner, parts[i]);
        }
        return header(offset - start, tags.splitstring);
      }
    }
    return encodeStringInner(str);
  }

  function encodeNumber(num: number): void {
    if (isNearlyInteger(num)) {
      // Encode integers as numbers
      if (tags.posint && num >= 0) {
        return header(num, tags.posint);
      }
      if (tags.negint && num < 0) {
        return header(-1 - num, tags.negint);
      }
    }

    if (num > 0 && num < 1e8) {
      // Fractions that are percentages encode as percentages
      if (tags.percent && isNearlyInteger(num * 100)) {
        return header(Math.round(num * 100), tags.percent);
      }

      // Fractions that are factors of 360 encode as degrees
      if (tags.degree && isNearlyInteger(num * 360)) {
        return header(Math.round(num * 360), tags.degree);
      }
    }

    // Encode as decimal string for everything else
    if (tags.float) {
      const start = offset;
      append((Math.round(num * 1e10) / 1e10).toString());
      return header(offset - start, tags.float);
    }

    throw new TypeError("No number/float tags provided for: " + num);
  }

  function encodeArray(arr: unknown[]): void {
    if (tags.list) {
      const start = offset;
      for (let i = arr.length - 1; i >= 0; i--) {
        encodeUnknown(arr[i]);
      }
      return header(offset - start, tags.list);
    }

    throw new TypeError("Missing list tag");
  }

  function encodeObject(obj: object): void {
    if (tags.map) {
      const start = offset;
      const entries = Object.entries(obj);
      for (let i = entries.length - 1; i >= 0; i--) {
        const [key, value] = entries[i];
        encodeUnknown(value);
        encodeUnknown(key);
      }
      return header(offset - start, tags.map);
    }

    throw new TypeError("Missing map tag");
  }

  function checkPrimitive<T extends string | number>(
    encodeVal: (v: T) => void,
    val: T
  ): void {
    if (tags.ref && knownPrimitives.has(val)) {
      return header(knownPrimitives.get(val)!, tags.ref);
    }

    if (tags.ptr) {
      const seen = seenPrimitives.get(val)!;
      if (seen) {
        const [seenOffset, seenLen] = seen;
        const dist = offset - seenOffset;
        if (dist >= pointerLimit) {
          seenPrimitives.delete(val);
        } else if (sizeNeeded(dist) + 1 < seenLen) {
          return header(dist, tags.ptr);
        }
      }
    }

    const start = offset;
    encodeVal(val);
    if (tags.ptr && offset - start > 3) {
      seenPrimitives.set(val, [offset, offset - start]);
    }
  }

  function checkObject<T extends unknown[] | object>(
    encodeVal: (v: T) => void,
    val: T
  ): void {
    if (tags.ref) {
      for (const known of knownObjects.keys()) {
        if (sameShape(known, val)) {
          return header(knownObjects.get(known)!, tags.ref);
        }
      }
    }
    if (tags.ptr) {
      for (const [seen, [seenOffset, seenLen]] of seenObjects.entries()) {
        const dist = offset - seenOffset;
        if (dist >= pointerLimit) {
          seenObjects.delete(seen);
        } else if (sizeNeeded(dist) + 1 < seenLen && sameShape(seen, val)) {
          return header(dist, tags.ptr);
        }
      }
    }
    const start = offset;
    encodeVal(val);
    if (tags.ptr) {
      if (Array.isArray(val)) {
        arrays++;
      } else {
        objects++;
      }
      seenObjects.set(val, [offset, offset - start]);
    }
  }

  function encodeUnknown(val: unknown): void {
    if (tags.simple) {
      if (val === true) {
        return header(0, tags.simple);
      }
      if (val === false) {
        return header(1, tags.simple);
      }
      if (val === null) {
        return header(2, tags.simple);
      }
    }
    if (typeof val === "string") {
      checkPrimitive<string>(encodeString, val);
    } else if (typeof val === "number") {
      checkPrimitive<number>(encodeNumber, val);
    } else if (Array.isArray(val)) {
      checkObject(encodeArray, val);
    } else if (typeof val === "object" && val !== null) {
      checkObject(encodeObject, val);
    } else {
      throw new Error("Unsupported value: " + val);
    }
  }
}

function isNearlyInteger(val: number): boolean {
  return Math.abs(val - Math.round(val)) < 1e-10;
}

function sameShape(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!sameShape(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (!sameShape(aKeys, bKeys)) return false;
    for (const key of aKeys) {
      if (!sameShape(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

function strlen(str: string): number {
  return new TextEncoder().encode(str).length;
}
