const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function stringify(val: unknown): string {
  const seenStrings: Record<string, number> = {};
  const seenObjects = new Map<unknown[] | object, number>();
  const parts: string[] = [];
  let offset = 0;

  encodeUnknown(val);
  return parts.reverse().join("");

  function append(value: string): void {
    parts.push(value);
    const len = strlen(value);
    offset += len;
  }

  function header(len: number, type: string): void {
    let str = "";
    while (len > 0) {
      str = chars[len % chars.length] + str;
      len = Math.floor(len / chars.length);
    }
    append(str + type);
  }

  function encodeString(str: string): void {
    const seen = seenStrings[str];
    if (seen !== undefined) {
      return header(offset - seen, "*");
    }
    const start = offset;
    append(str);
    header(offset - start, "$");
    seenStrings[str] = offset;
  }

  function encodeArray(arr: unknown[]): void {
    for (const seen of seenObjects.keys()) {
      if (sameShape(seen, arr)) {
        return header(offset - seenObjects.get(seen)!, "*");
      }
    }
    const start = offset;
    for (let i = arr.length - 1; i >= 0; i--) {
      encodeUnknown(arr[i]);
    }
    header(offset - start, "[");
    seenObjects.set(arr, offset);
  }

  function encodeObject(obj: object): void {
    for (const seen of seenObjects.keys()) {
      if (sameShape(seen, obj)) {
        return header(offset - seenObjects.get(seen)!, "*");
      }
    }
    const start = offset;
    const entries = Object.entries(obj);
    for (let i = entries.length - 1; i >= 0; i--) {
      const [key, value] = entries[i];
      encodeUnknown(value);
      encodeString(key);
    }
    header(offset - start, "{");
    seenObjects.set(obj, offset);
  }

  function encodeUnknown(val: unknown): void {
    if (typeof val === "string") {
      encodeString(val);
    } else if (typeof val === "number") {
      if (Number.isInteger(val)) {
        if (val >= 0) {
          header(val, "+");
        } else {
          header(-val, "-");
        }
      } else if (isNearlyInteger(val * 100) && val > 0) {
        header(Math.round(val * 100), "%");
      } else {
        throw new Error("TODO: encode float: " + val);
      }
    } else if (Array.isArray(val)) {
      encodeArray(val);
    } else if (typeof val === "object" && val !== null) {
      encodeObject(val);
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

console.log(stringify([["Hello"], ["Hello"], ["Hello"]]));
console.log(stringify([1, 2, 3]));
console.log(stringify({ a: 1, b: 2, c: 3 }));
console.log(
  stringify({
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
  })
);
