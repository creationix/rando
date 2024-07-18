/*
+ positive integer (n)
~ negative integer (-1 - n)

Pointer and Reference Encodings
* pointer (relative byte offset into self)
& reference (0 based index into external dictionary)

Primitive Type Encodings
? nil
^ true
! false

Floating Point Encodings
@ frac-360 (val * 360)
% percent (val * 100)
. number as string

String Encodings
' b64-string (use b64 encoding as-is)
$ utf-8 string
/ string list (list of string parts)
# binary bytes encoded as base64 payload

Containers
[ list of values
{ map of key/value pairs
: index (can be first entry in list or map)

For example, a list with index has 3 b64 headers for total-byte-length, index-count, and index-pointer-width.
A decoder that doesn't need/want the index can simply skip the index and iterate the payload.
x[x:x:iiiipppp
*/

import { sha } from "bun";
import { encode as b64Encode, decode as b64Decode } from "./b64.ts";

function zigzagEncode(num: bigint): bigint {
  return num < 0 ? num * -2n - 1n : num * 2n;
}
function zigzagDecode(num: bigint): bigint {
  return num % 2n ? (num + 1n) / -2n : num / 2n;
}

function encodeBigint(value: bigint): string {
  return value >= 0n ? b64Encode(value) + "+" : b64Encode(-1n - value) + "~";
}

function encodeNumber(value: number): string {
  if (Number.isInteger(value)) {
    return encodeBigint(BigInt(value));
  }
  const percent = Math.round(value * 100);
  if (
    Math.abs(percent) > 0 &&
    Math.abs(percent) < 2 ** 51 &&
    Math.abs(percent - value * 100) < 1e-12
  ) {
    return b64Encode(zigzagEncode(BigInt(percent))) + "%";
  }
  const degree = Math.round(value * 360);
  if (
    Math.abs(degree) > 0 &&
    Math.abs(degree) < 2 ** 51 &&
    Math.abs(degree - value * 360) < 1e-12
  ) {
    return b64Encode(zigzagEncode(BigInt(degree))) + "@";
  }
  const str = Number.isNaN(value)
    ? "nan"
    : value === Infinity
    ? "inf"
    : value === -Infinity
    ? "-inf"
    : String(value);
  return b64Encode(str.length) + "." + str;
}

function encodeString(value: string): string {
  if (/^[0-9a-zA-Z_-]*$/.test(value)) {
    return value + "'";
  }
  return b64Encode(strlen(value)) + "$" + value;
}

function encodePrimitive(value: unknown): string {
  if (value == null) return "?";
  if (typeof value === "number") return encodeNumber(value);
  if (typeof value === "boolean") return value ? "^" : "!";
  if (typeof value === "bigint") return encodeBigint(value);
  throw new TypeError("Not a primitive: " + value);
}

// Get length of a string as utf-8 bytes
function strlen(str: string): number {
  return new TextEncoder().encode(str).length;
}

function findCommonSubstrings(rootVal: unknown): string[] | void {
  const stringCounts = new Map<string, number>();
  function addString(str: string) {
    stringCounts.set(str, (stringCounts.get(str) || 0) + 1);
  }
  const stack: unknown[] = [rootVal];
  const strings: string[] = [];
  while (stack.length) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      for (const entry of value) {
        stack.push(entry);
      }
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        stack.push(k);
        stack.push(v);
      }
    } else if (typeof value === "string") {
      strings.push(value);
      const substrings = new Map<string, number>();
      // Use various patterns to collect likely good substrings
      const patterns = [
        // /[0-9a-zA-Z_-]{4,}/g,
        // /[0-9a-zA-Z]{4`,}[_ /.-]*/g,
        // /[0-9a-zA-Z]{4,}/g,
        // /[0-9a-zA-Z]{3,} /g,
        // /[_ /.-]*[0-9a-zA-Z]{4,}/g,
        // /[A-Z]?[a-z0-9]{4,}/g,
      ];
      for (const pattern of patterns) {
        const counts = new Map<string, number>();
        for (const match of value.matchAll(pattern)) {
          const m = match[0];
          counts.set(m, (counts.get(m) || 0) + 1);
        }
        for (const [key, value] of counts) {
          substrings.set(key, Math.max(substrings.get(key) || 0, value));
        }
      }
      for (const [key, value] of substrings) {
        stringCounts.set(key, (stringCounts.get(key) || 0) + value);
      }
    }
  }

  const megaString = strings.sort().join("\0");
  // Search for substrings in the mega string
  let prev: string | undefined;
  let prevCount = 0;
  for (let i = 0, l = megaString.length; i < l; i++) {
    for (let j = 0; j < l; j++) {
      let o = 0;
      // if (i > 0 && j > 0 && megaString[i - 1] === megaString[j - 1]) continue;
      while (
        i + o < l &&
        j + o < l && // Stay in bounds
        o < Math.abs(i - j) && // We don't want overlapping strings
        megaString[i + o] === megaString[j + o] &&
        megaString[i + o] !== "\0" // null types are separators in the mega string
      ) {
        o++;
      }
      if (o > 1) {
        addString(megaString.slice(i, i + o));
      }
    }
  }

  // Filter out entries with size 1
  for (const [key, value] of stringCounts) {
    if (value === 1) stringCounts.delete(key);
  }

  const toPrune = new Set<string>();
  const sortedStrings = [...stringCounts.keys()]
    .filter((s, i, o) => {
      const count = stringCounts.get(s)!;
      // Prune non-repeated strings
      if (count <= 1) return false;
      // Prune short strings
      if (s.length < 2) return false;
      // Prune substrings of previous string with same count
      const sub = s.substring(1);
      let nextCount = stringCounts.get(sub);
      if (nextCount && nextCount === count) {
        toPrune.add(sub);
      }
      if (i > 0) {
        // Prune rotations of previous string with same count
        for (let h = i + 1; h < o.length; h++) {
          const next = o[h];
          nextCount = stringCounts.get(next);
          if (
            next.length === s.length &&
            nextCount === count &&
            (next.substring(1) === s.substring(0, s.length - 1) ||
              s.substring(1) === next.substring(0, s.length - 1))
          ) {
            toPrune.add(next);
          }
        }
      }
      return !toPrune.has(s);
    })
    // Sort by length (longest first)
    // and then by frequency
    // and finally by name
    .sort((a, b) => {
      let delta = b.length - a.length;
      if (delta !== 0) return delta;
      delta = stringCounts.get(b)! - stringCounts.get(a)!;
      if (delta !== 0) return delta;
      return a.localeCompare(b, "ascii");
    });

  if (stringCounts.size > 1) {
    return sortedStrings;
  }
}

export function encode(rootValue: unknown, shared?: unknown[]): string {
  // Current output parts (in reverse order)
  const parts: string[] = [];
  let size = 0;
  const stringOffsets: [string, number, number][] = [];

  const sharedValues = new Map<unknown, number>();
  if (shared) {
    for (let i = 0, l = shared.length; i < l; i++) {
      sharedValues.set(shared[i], i);
    }
  }

  // Current queue of things to process
  const stack: unknown[] = [rootValue];

  const substrings = findCommonSubstrings(rootValue);
  let substringFinder: RegExp | undefined;
  if (substrings && substrings.length > 2) {
    // console.log(substrings);
    // make a regexp that matches any string containing any of the substrings
    // Make sure to escape the strings for regex
    substringFinder = new RegExp(
      `(${substrings
        .map((s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"))
        .join("|")})`
    );
  }

  function push(encoded: string): number {
    parts.push(encoded);
    const len = strlen(encoded);
    size += len;
    return len;
  }

  function save() {
    return {
      size,
      partsLength: parts.length,
      stringsLength: stringOffsets.length,
    };
  }

  function restore(state: ReturnType<typeof save>) {
    size = state.size;
    parts.length = state.partsLength;
    stringOffsets.length = state.stringsLength;
  }

  function findString(string: string): [number, number] | undefined {
    for (let i = stringOffsets.length - 1; i >= 0; i--) {
      const [s, o, z] = stringOffsets[i];
      if (s === string) {
        return [o, z];
      }
    }
  }

  function addString(string: string, len: number) {
    const offset = size;
    stringOffsets.push([string, offset, len]);
  }

  while (stack.length) {
    const value = stack.pop();
    const sharedValue = sharedValues.get(value);
    if (sharedValue != null) {
      push(b64Encode(sharedValue) + "&");
      continue;
    }
    if (typeof value === "function") {
      value();
    } else if (Array.isArray(value)) {
      const start = size;
      stack.push(() => {
        const end = size;
        push(b64Encode(end - start) + "[");
      });
      for (const entry of value) {
        stack.push(entry);
      }
    } else if (value && typeof value === "object") {
      const start = size;
      stack.push(() => {
        const end = size;
        push(b64Encode(end - start) + "{");
      });
      for (const [k, v] of Object.entries(value)) {
        stack.push(k);
        stack.push(v);
      }
    } else if (typeof value === "string") {
      const seen = findString(value);
      if (seen) {
        const [offset, len] = seen;
        const pointer = b64Encode(size - offset) + "*";
        if (strlen(pointer) < len) {
          push(pointer);
          continue;
        }
      }

      if (substringFinder) {
        const segments = value.split(substringFinder).filter(Boolean);
        if (segments.length > 1) {
          const s = save();
          addString(value, push(encodeString(value)));
          const s2 = save();
          restore(s);
          const start = size;
          stack.push(() => {
            const end = size;
            const encoded = b64Encode(end - start) + "/";
            addString(value, push(encoded));
            const s3 = save();
            // If the split encoding is not smaller, revert to other timeline
            if (s3.size >= s2.size) {
              restore(s2);
            }
          });
          for (const segment of segments) {
            stack.push(segment);
          }
          continue;
        }
      }
      addString(value, push(encodeString(value)));
    } else {
      push(encodePrimitive(value));
    }
  }

  return parts.reverse().join("");
}

export function toNumberMaybe(num: bigint): bigint | number {
  return num >= -(2n ** 53n) && num <= 2n ** 53n ? Number(num) : num;
}

const re = /([0-9a-zA-Z_-]*)([^0-9a-zA-Z_-])/g;
const inlineTags = {
  "'": true,
  "*": true,
  "+": true,
  "~": true,
  "%": true,
  "@": true,
  "^": true,
  "!": true,
  "?": true,
};

export function decode(encoded: string): unknown {
  let offset = 0;
  return decodeAny();

  function lazyStub(
    object: unknown[] | object,
    index: number | string,
    savedOffset: number
  ) {
    Object.defineProperty(object, index, {
      get() {
        const save = offset;
        offset = savedOffset;
        const value = decodeAny();
        offset = save;
        Object.defineProperty(object, index, {
          value,
          enumerable: true,
          writable: false,
          configurable: false,
        });
        return value;
      },
      enumerable: true,
      configurable: true,
    });
  }

  function skipAny() {
    console.log("skipAny", {
      encoded,
      offset,
      tail: encoded.substring(offset),
    });
    // Math base64 characters at offset
    re.lastIndex = offset;
    const [all, header, tag] = re.exec(encoded)!;
    offset += all.length;
    if (!inlineTags[tag]) {
      const n = Number(b64Decode(header));
      const start = offset;
      offset += n;
      if (offset > encoded.length) {
        console.log({ offset, header, tag, start, n, encoded });
        throw new Error(`Invalid length (${offset}/${encoded.length})`);
      }
    }
  }

  function decodeAny(): unknown {
    // Math base64 characters at offset
    re.lastIndex = offset;
    const [all, header, tag] = re.exec(encoded)!;
    offset += all.length;
    if (tag === "'") return header;
    const n = b64Decode(header);
    if (tag === "*") {
      const save = offset;
      offset += Number(n);
      const val = decodeAny();
      offset = save;
      return val;
    }
    if (tag === "+") return n;
    if (tag === "~") return toNumberMaybe(-1n - BigInt(n));
    if (tag === "%") return Number(zigzagDecode(BigInt(n))) / 100;
    if (tag === "@") return Number(zigzagDecode(BigInt(n))) / 360;
    if (tag === "^") return true;
    if (tag === "!") return false;
    if (tag === "?") return null;
    const end = offset + Number(n);
    if (end > encoded.length) {
      console.log({ offset, header, tag, n, end, encoded });
      throw new Error(`Invalid length (${end}/${encoded.length})`);
    }
    if (tag === "/") {
      const parts: string[] = [];
      while (offset < end) {
        const part = decodeAny() as string;
        parts.push(part);
      }
      if (offset !== end) throw new Error("Invalid string list");
      return parts.join("");
    }
    if (tag === "[") {
      const arr: unknown[] = [];
      let length = 0;
      while (offset < end) {
        lazyStub(arr, length, offset);
        console.log({ offset, end });
        skipAny();
        length++;
      }
      if (offset !== end) throw new Error("Invalid list");
      return arr;
    }
    if (tag === "{") {
      const obj: Record<string, unknown> = {};
      while (offset < end) {
        const key = decodeAny() as string;
        lazyStub(obj, key, offset);
        skipAny();
      }
      if (offset !== end) throw new Error("Invalid map");
      return obj;
    }
    const body = encoded.substring(offset, end);
    offset = end;
    if (tag === "$") return body;
    if (tag === ".") {
      if (body === "-inf") return -Infinity;
      if (body === "inf") return Infinity;
      if (body === "nan") return NaN;
      return Number(body);
    }
    console.log({ header, tag, n, encoded, offset, body });
    // if (tag === ".")
    throw new Error("TODO: decoder");
  }
}
