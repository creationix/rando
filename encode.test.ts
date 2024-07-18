import { expect, test } from "bun:test";
import { encode, decode } from "./rando";

function testRoundTrip(inputs: any[]) {
  for (const input of inputs) {
    const encoded = encode(input);
    const json = JSON.stringify(input);
    if (json.length > 38) {
      console.log(`${json}\n\n${encoded}\n`);
    } else {
      console.log(json.padStart(38, " ") + "  " + encoded);
    }
    // const decoded = decode(encoded);
    // expect(decoded).toEqual(input);
  }
}

test("encode/decode integers", () => {
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
  testRoundTrip([...nums].sort((a, b) => a - b));
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

test("encode/decode binstrings", () => {
  testRoundTrip([
    "0",
    "1",
    "00",
    "01",
    "10",
    "11",
    "000",
    "001",
    "010",
    "011",
    "100",
    "101",
    "110",
    "111",
    "0000",
    "0001",
    "0010",
    "0011",
    "0100",
    "0101",
    "0110",
    "0111",
    "1000",
    "1001",
    "1010",
    "1011",
    "1100",
    "1101",
    "1110",
    "1111",
    "1",
    "10",
    "101",
    "1010",
    "10101",
    "101010",
    "1010101",
    "10101010",
    "101010101",
    "1010101010",
    "10101010101",
    "110010001111011100010000011100111101011000110110001",
  ]);
});

test("encode/decode decimal strings", () => {
  testRoundTrip([
    "123",
    "1234",
    "12345",
    "123456",
    "1234567",
    "12345678",
    "123456789",
    "1234567890",
    "12345678901",
    "123456789012",
    "1234567890123",
    "12345678901234",
    "123456789012345",
    "000000000000001",
  ]);
});

test("encode/decode hexadecimal strings", () => {
  testRoundTrip([
    "dead",
    "beef",
    "00f",
    "a",
    "ab",
    "abc",
    "abcd",
    "abcde",
    "abcdef",
    "abcdef0",
    "abcdef01",
    "deadbeef",
    "123456789abc",
    "123456789abcd",
    "123456789abcde",
    "123456789abcdef",
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

test("encode/decode large strings with internal repetitions", () => {
  testRoundTrip([
    "/foo/foo/foo",
    "/boo/bar/foo/bar/foo/bar",
    "content-type, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5",
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum",
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

// console.log(encode([["Hello"], ["Hello"], ["Hello"]]));
// console.log(encode([1, 2, 3]));
// console.log(encode({ a: 1, b: 2, c: 3 }));

// for (let i = 0; i < 10; i++) {
//   console.log(i, encode([2 ** i, 10 ** i, 64 ** i, 64 ** i - 1]));
//   console.log(i, encode([i / 360, i / 100, -(i ** 5)]));
//   console.log(i, encode([i, -i]));
// }
// const bigdoc = {
//   id: "0001",
//   type: "donut",
//   name: "Cake",
//   ppu: 0.55,
//   batters: {
//     batter: [
//       { id: "1001", type: "Regular" },
//       { id: "1002", type: "Chocolate" },
//       { id: "1003", type: "Blueberry" },
//       { id: "1004", type: "Devil's Food" },
//     ],
//   },
//   topping: [
//     { id: "5001", type: "None" },
//     { id: "5002", type: "Glazed" },
//     { id: "5005", type: "Sugar" },
//     { id: "5007", type: "Powdered Sugar" },
//     { id: "5006", type: "Chocolate with Sprinkles" },
//     { id: "5003", type: "Chocolate" },
//     { id: "5004", type: "Maple" },
//   ],
// };
// console.log(encode(bigdoc));
// // console.log(encode(bigdoc, ["id", "type"]));

// // console.log(encode([Math.PI, Math.E]));

// // console.log(encode([3 + 123 / 360, 2 + 1 / 360, 15 + 90 / 360]));
// // console.log(encode("😊"));

// // const dict = [
// //   "content-length",
// //   "content-type",
// //   ["content-type", "application/json"],
// //   ["content-type", "text/plain"],
// // ];

// // const doc = {
// //   status: 200,
// //   headers: [
// //     ["content-length", 120],
// //     ["content-type", "text/plain"],
// //     ["content-type", "application/json"],
// //   ],
// // };

// // console.log(encode(doc));
// // console.log(encode(doc, dict));
