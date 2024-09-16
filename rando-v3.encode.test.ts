import { expect, test } from "bun:test";
import { encode, splitDecimal } from "./rando-v3";

test("splitDecimal", () => {
  expect(splitDecimal(0.1)).toEqual({ base: 1n, exp: -1 });
  expect(splitDecimal(-0.1)).toEqual({ base: -1n, exp: -1 });
  expect(splitDecimal(10.1)).toEqual({ base: 101n, exp: -1 });
  expect(splitDecimal(-10.1)).toEqual({ base: -101n, exp: -1 });
  expect(splitDecimal(10)).toEqual({ base: 1n, exp: 1 });
  expect(splitDecimal(-10)).toEqual({ base: -1n, exp: 1 });
  expect(splitDecimal(5e4)).toEqual({ base: 5n, exp: 4 });
  expect(splitDecimal(9e8)).toEqual({ base: 9n, exp: 8 });
  expect(splitDecimal(123e56)).toEqual({ base: 123n, exp: 56 });
  expect(splitDecimal(-321e54)).toEqual({ base: -321n, exp: 54 });
  expect(splitDecimal(-321e-54)).toEqual({ base: -321n, exp: -54 });
  expect(splitDecimal(3.2900356588766146e-17)).toEqual({
    base: 32900356588766146n,
    exp: -33,
  });
  expect(splitDecimal(1.3310393152443792e308)).toEqual({
    base: 13310393152443792n,
    exp: 292,
  });
  expect(splitDecimal(1.797693134862298e308)).toEqual({
    base: 1797693134862298n,
    exp: 293,
  });
  expect(splitDecimal(7.291122019556398e-304)).toEqual({
    base: 7291122019556398n,
    exp: -319,
  });
});
