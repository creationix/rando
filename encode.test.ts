import { expect, test } from "bun:test";
import { encode, decode } from "./rando";

test("encode/decode integers", () => {
  testRoundTrip([
    0, 1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13,
    1e14, 1e15, -1, -10, -100, -1e3, -1e4, -1e5, -1e6, -1e7, -1e8, -1e9, -1e10,
    -1e11, -1e12, -1e13, -1e14, -1e15,
  ]);
  const nums = new Set<number>();
  for (const base of [2, 8, 10, 16, 64]) {
    for (let power = 0; power < 12; power++) {
      const num = base ** power;
      nums.add(num);
      nums.add(num - 1);
      nums.add(num + 1);
      nums.add(-num);
      nums.add(-num - 1);
      nums.add(-num + 1);
    }
  }
  testRoundTrip([...nums].sort((a, b) => Number(a) - Number(b)));
});

test("encode/decode floats", () => {
  const nums = new Set<number>();
  nums.add(Math.PI);
  nums.add(Math.E);
  for (let i = 0; i <= 360; i++) {
    nums.add(i / 360);
  }
  for (let i = 0; i <= 100; i++) {
    nums.add(i / 100);
  }
  for (let i = -30; i <= 30; i++) {
    for (let j = -30; j <= 30; j++) {
      const num = i / j;
      if (Number.isInteger(num)) continue;
      nums.add(num);
    }
  }
  testRoundTrip(
    [...nums].filter((n) => !Number.isInteger(n)).sort((a, b) => a - b)
  );
});

test("encode/decode simple types", () => {
  testRoundTrip([true, false, null]);
});

test("encode/decode basic strings", () => {
  testRoundTrip([
    "",
    "Hello",
    "Hello, World!",
    "Hello, World! How are you?",
    'Hello, "World"!',
    "Hello, 'World'!",
    'Hello, "World!" How are you?',
  ]);
});

test("encode/decode b64 strings", () => {
  testRoundTrip([
    "helloworld",
    "name",
    "id",
    "test",
    "age",
    "fruit",
    "Camel",
    "Home",
    "content-type",
    "Content-Type",
  ]);
});

test("encode/decode arrays", () => {
  testRoundTrip([
    [],
    [100, 200, 300],
    [100, [200], 300],
    [[[[[[]]]]]],
    [[[[[[100]]]]]],
    ["Hello", "World", "How", "Are", "You"],
    [[[[[[100, 200, 300]]]]], [[[[[[100, 200, 300], 400, 500]]]]]],
  ]);
});

test("encode/decode objects", () => {
  testRoundTrip([
    {},
    { a: 100, b: 200, c: 300 },
    { a: 100, b: { c: 200 }, d: 300 },
    {
      a: {
        b: { c: { d: { e: { f: { g: { h: { i: { j: { k: 100 } } } } } } } } },
      },
    },
  ]);
});

test("encode/decode mixed objects", () => {
  testRoundTrip([
    { a: 100, b: "Hello", c: [100, 200, 300] },
    { a: 100, b: { c: 200 }, d: [100, 200, 300] },
    {
      a: {
        b: { c: { d: { e: { f: { g: { h: { i: { j: { k: 100 } } } } } } } } },
      },
    },
    [
      { color: "red", fruits: ["apple", "strawberry"] },
      { color: "green", fruits: ["apple"] },
      { color: "yellow", fruits: ["apple", "banana"] },
    ],
  ]);
});

test("encode/decode mixed objects with known references", () => {
  testRoundTrip2([
    ["Hello", ["Hello"]],
    [
      [
        { color: "red", fruits: ["apple", "strawberry"] },
        { color: "green", fruits: ["apple"] },
        { color: "yellow", fruits: ["apple", "banana"] },
      ],
      ["color", "fruits", "red", "orange", "yellow", "green", "blue", "violet"],
    ],
    [
      [
        { one: 100, two: 200, three: 300 },
        { one: 100, two: 200, three: 300 },
      ],
      [100, 200, 300],
    ],
    findRepeats([
      { color: "red", fruits: ["apple", "strawberry"] },
      { color: "green", fruits: ["apple"] },
      { color: "yellow", fruits: ["apple", "banana"] },
    ]),
  ]);
});

function findRepeats(rootValue: unknown): [unknown, unknown[]] {
  const stack: unknown[] = [rootValue];
  const seen = new Map<unknown, number>();
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
    } else {
      seen.set(value, (seen.get(value) || 0) + 1);
    }
  }
  return [rootValue, [...seen.keys()].filter((k) => seen.get(k)! > 1)];
}

function testRoundTrip(inputs: unknown[]) {
  for (const input of inputs) {
    const encoded = encode(input);
    const json =
      typeof input === "bigint" ? input.toString() : JSON.stringify(input);
    if (json.length > 38) {
      console.log(strlen(json), json);
      console.log();
      console.log(strlen(encoded), encoded);
      console.log("\n");
    } else {
      console.log(json.padStart(38, " ") + "  " + encoded);
    }
    const decoded = decode(encoded);
    console.log({ input, decoded });
    JSON.stringify(decoded);
    expect(decoded).toEqual(input);
  }
}

function testRoundTrip2(inputs: [unknown, unknown[]][]) {
  for (const [input, shared] of inputs) {
    console.log();
    const encoded = encode(input, shared);
    const json = JSON.stringify(input);
    console.log(strlen(json), json);
    console.log(strlen(encoded), encoded);
    console.log("Shared known values", shared);
    const decoded = decode(encoded, shared);
    JSON.stringify(decoded);
    expect(decoded).toEqual(input);
  }
}

// Get length of a string as utf-8 bytes
function strlen(str: string): number {
  return new TextEncoder().encode(str).length;
}
