import { expect, test } from "bun:test";
import { encode, decode } from "./b64.ts";

test("encode/decode numbers", () => {
  const nums = new Set<number>();
  for (const base of [2, 10]) {
    for (let power = 0; power <= Math.log(1e16) / Math.log(base); power++) {
      const num = base ** power;
      nums.add(num - 1);
      nums.add(num);
      nums.add(num + 1);
    }
  }
  for (const num of [...nums].sort((a, b) => a - b)) {
    if (num < 0 || num > 2n ** 53n) continue;
    const encoded = encode(num);
    console.log(num, encoded);
    expect(decode(encoded)).toBe(num);
  }
});

test("encode/decode bigint numbers", () => {
  const nums = new Set<bigint>();

  for (const base of [2n, 10n]) {
    for (
      let power = 0n;
      power <= Math.log(1e32) / Math.log(Number(base));
      power++
    ) {
      const num = base ** power;
      nums.add(num - 1n);
      nums.add(num);
      nums.add(num + 1n);
    }
  }
  for (const num of [...nums].sort((a, b) => Number(a - b))) {
    if (num <= 2n ** 53n) continue;
    const encoded = encode(num);
    console.log(num, encoded);
    expect(decode(encoded)).toBe(num);
  }
});
