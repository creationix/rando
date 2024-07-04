const chars =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";

export function sizeNeeded(num: number): number {
  if (num === 0) return 0;
  return Math.floor(Math.log(num) / Math.log(chars.length) + 1);
}

interface Tags {
  string?: string | number;
  decstring?: string | number;
  hexstring?: string | number;
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
  decstring: "|",
  hexstring: "#",
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
    let str = "";
    while (len > 0) {
      str = chars[len % chars.length] + str;
      len = Math.floor(len / chars.length);
    }
    append(str + type);
  }

  function encodeStringInner(str: string): void {
    // Encode small decimal looking strings as a number to save space
    if (tags.decstring && str.length <= 15 && /^[1-9][0-9]*$/.test(str)) {
      return header(parseInt(str, 10), tags.decstring);
    }
    // Encode small hexadecimal looking strings as a number to save space
    if (tags.hexstring && str.length <= 13 && /^[1-9a-f][0-9a-f]*$/.test(str)) {
      return header(parseInt(str, 16), tags.hexstring);
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

    if (num > 0 && num < 1e7) {
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

console.log(encode([["Hello"], ["Hello"], ["Hello"]]));
console.log(encode([1, 2, 3]));
console.log(encode({ a: 1, b: 2, c: 3 }));

for (let i = 0; i < 10; i++) {
  console.log(i, encode([2 ** i, 10 ** i, 64 ** i, 64 ** i - 1]));
  console.log(i, encode([i / 360, i / 100, -(i ** 5)]));
  console.log(i, encode([i, -i]));
}
const bigdoc = {
  id: "0001",
  type: "donut",
  name: "Cake",
  ppu: 0.55,
  batters: {
    batter: [
      { id: "1001", type: "Regular" },
      { id: "1002", type: "Chocolate" },
      { id: "1003", type: "Blueberry" },
      { id: "1004", type: "Devil's Food" },
    ],
  },
  topping: [
    { id: "5001", type: "None" },
    { id: "5002", type: "Glazed" },
    { id: "5005", type: "Sugar" },
    { id: "5007", type: "Powdered Sugar" },
    { id: "5006", type: "Chocolate with Sprinkles" },
    { id: "5003", type: "Chocolate" },
    { id: "5004", type: "Maple" },
  ],
};
console.log(encode(bigdoc));
console.log(encode(bigdoc, ["id", "type"]));

console.log(encode([Math.PI, Math.E]));

console.log(encode([3 + 123 / 360, 2 + 1 / 360, 15 + 90 / 360]));
console.log(encode("😊"));

const dict = [
  "content-length",
  "content-type",
  ["content-type", "application/json"],
  ["content-type", "text/plain"],
];

const doc = {
  status: 200,
  headers: [
    ["content-length", 120],
    ["content-type", "text/plain"],
    ["content-type", "application/json"],
  ],
};

console.log(encode(doc));
console.log(encode(doc, dict));
