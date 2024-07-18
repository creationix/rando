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

import { encode as b64Encode } from "./b64.ts";

function zigzagEncode(num: bigint): bigint {
  return num < 0 ? num * -2n - 1n : num * 2n;
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
      const substrings = new Set<string>();
      // Use various patterns to collect likely good substrings
      for (const match of value.matchAll(/[0-9a-zA-Z_-]{4,}/g)) {
        substrings.add(match[0]);
      }
      for (const match of value.matchAll(/[0-9a-zA-Z]{4`,}[_ /.-]*/g)) {
        substrings.add(match[0]);
      }
      for (const match of value.matchAll(/[0-9a-zA-Z]{4,}/g)) {
        substrings.add(match[0]);
      }
      for (const match of value.matchAll(/[_ /.-]*[0-9a-zA-Z]{4,}/g)) {
        substrings.add(match[0]);
      }
      for (const match of value.matchAll(/[A-Z]?[a-z0-9]{4,}/g)) {
        substrings.add(match[0]);
      }
      // Add the unique substrings to the counts
      for (const substring of substrings) {
        addString(substring);
      }
    }
  }
  // Filter out entries with size 1
  for (const [key, value] of stringCounts) {
    if (value === 1) stringCounts.delete(key);
  }
  // Return sorted by longest first
  if (stringCounts.size > 1) {
    return [...stringCounts.keys()].sort((a, b) => b.length - a.length);
  }
}

export function encode(rootValue: unknown): string {
  // Current output parts (in reverse order)
  const parts: string[] = [];
  let size = 0;
  const stringOffsets: [string, number, number][] = [];

  // Current queue of things to process
  const stack: unknown[] = [rootValue];

  const substrings = findCommonSubstrings(rootValue);
  let substringFinder: RegExp | undefined;
  if (substrings && substrings.length > 2) {
    console.log(substrings);
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

export function decode(encoded: string): unknown {
  throw new Error("TODO: decoder");
}
