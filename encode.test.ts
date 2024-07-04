import { expect, test } from "bun:test";
import { encode, b64Decode, b64Encode } from "./rando";

test("b64Encode", () => {
  const inputs = [
    0, 1, 63, 64, 65, 4095, 4096, 4097, 262143, 262144, 262145, 16777215,
  ];
  for (const input of inputs) {
    const encoded = b64Encode(input);
    console.log(input, encoded);
    expect(b64Decode(encoded)).toBe(input);
  }
});

test("encode", () => {
  const inputs = [
    0,
    -1,
    1,
    -10,
    10,
    -100,
    100,
    -1000,
    1000,
    -10000,
    10000,
    -100000,
    100000,
    1 / 2,
    1 / 3,
    1 / 4,
    1 / 5,
    1 / 6,
    1 / 7,
    1 / 8,
    1 / 9,
    1 / 10,
    true,
    false,
    null,
    // Some basic string tests
    "",
    "Hello",
    "Hello, World!",
    "Hello, World! How are you?",
    // string tests with escapes and quotes
    'Hello, "World"!',
    "Hello, 'World'!",
    'Hello, "World!" How are you?',
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
    // Strings that have decimal digits only
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
    // Strings that have hexadecimals only
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
  ];

  for (const input of inputs) {
    const encoded = encode(input);
    console.log(JSON.stringify(input).padStart(38, " ") + "  " + encoded);
  }
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
// console.log(encode(bigdoc, ["id", "type"]));

// console.log(encode([Math.PI, Math.E]));

// console.log(encode([3 + 123 / 360, 2 + 1 / 360, 15 + 90 / 360]));
// console.log(encode("😊"));

// const dict = [
//   "content-length",
//   "content-type",
//   ["content-type", "application/json"],
//   ["content-type", "text/plain"],
// ];

// const doc = {
//   status: 200,
//   headers: [
//     ["content-length", 120],
//     ["content-type", "text/plain"],
//     ["content-type", "application/json"],
//   ],
// };

// console.log(encode(doc));
// console.log(encode(doc, dict));
