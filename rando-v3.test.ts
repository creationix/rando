import { expect, test } from "bun:test";
import { encode, encodeBinary, stringify, continuedFractionApproximation, encodeB64, decodeB64, splitDecimal } from "./rando-v3";

test("splitDecimal", () => {
  expect(splitDecimal(0.1)).toEqual([1n, -1]);
  expect(splitDecimal(-0.1)).toEqual([-1n, -1]);
  expect(splitDecimal(10.1)).toEqual([101n, -1]);
  expect(splitDecimal(-10.1)).toEqual([-101n, -1]);
  expect(splitDecimal(10)).toEqual([1n, 1]);
  expect(splitDecimal(-10)).toEqual([-1n, 1]);
  expect(splitDecimal(5e4)).toEqual([5n, 4]);
  expect(splitDecimal(9e8)).toEqual([9n, 8]);
  expect(splitDecimal(123e56)).toEqual([123n, 56]);
  expect(splitDecimal(-321e54)).toEqual([-321n, 54]);
  expect(splitDecimal(-321e-54)).toEqual([-321n, -54]);
  expect(splitDecimal(3.2900356588766146e-17)).toEqual([
    32900356588766146n,
    -33,
  ]);
  expect(splitDecimal(1.3310393152443792e308)).toEqual([
    13310393152443792n,
    292,
  ]);
  expect(splitDecimal(1.797693134862298e308)).toEqual([
    1797693134862298n,
    293,
  ]);
  expect(splitDecimal(7.291122019556398e-304)).toEqual([
    7291122019556398n,
    -319,
  ]);
});

test("continuedFractionApproximation", () => {
  expect(continuedFractionApproximation(1 / 3)).toEqual([1, 3]);
  expect(continuedFractionApproximation(-1 / 3)).toEqual([-1, 3]);
  expect(continuedFractionApproximation(1 / 7)).toEqual([1, 7]);
  expect(continuedFractionApproximation(-1 / 7)).toEqual([-1, 7]);
  expect(continuedFractionApproximation(6 / 7)).toEqual([6, 7]);
  expect(continuedFractionApproximation(-6 / 7)).toEqual([-6, 7]);
  expect(continuedFractionApproximation(123 / 456)).toEqual([41, 152]);
  expect(continuedFractionApproximation(13 / 17)).toEqual([13, 17]);
  expect(continuedFractionApproximation(17 / 13)).toEqual([17, 13]);
  expect(continuedFractionApproximation(7 / 11)).toEqual([7, 11]);
  expect(continuedFractionApproximation(11 / 7)).toEqual([11, 7]);
  expect(continuedFractionApproximation(13 / 19)).toEqual([13, 19]);
  expect(continuedFractionApproximation(19 / 13)).toEqual([19, 13]);
  expect(continuedFractionApproximation(23 / 29)).toEqual([23, 29]);
  expect(continuedFractionApproximation(29 / 23)).toEqual([29, 23]);
  expect(continuedFractionApproximation(31 / 37)).toEqual([31, 37]);
  expect(continuedFractionApproximation(37 / 31)).toEqual([37, 31]);
  expect(continuedFractionApproximation(41 / 43)).toEqual([41, 43]);
  expect(continuedFractionApproximation(43 / 41)).toEqual([43, 41]);
  expect(continuedFractionApproximation(47 / 53)).toEqual([47, 53]);
  expect(continuedFractionApproximation(53 / 47)).toEqual([53, 47]);
  expect(continuedFractionApproximation(59 / 61)).toEqual([59, 61]);
  expect(continuedFractionApproximation(61 / 59)).toEqual([61, 59]);
  expect(continuedFractionApproximation(67 / 71)).toEqual([67, 71]);
  expect(continuedFractionApproximation(71 / 67)).toEqual([71, 67]);
  expect(continuedFractionApproximation(1 / 12345)).toEqual([1, 12345]);
  expect(continuedFractionApproximation(-1 / 12345)).toEqual([-1, 12345]);
  expect(continuedFractionApproximation(Math.PI, 1)).toEqual([22, 7]);         // 3.1428571428571430
  expect(continuedFractionApproximation(Math.PI, 2)).toEqual([333, 106]);      // 3.1415094339622640
  expect(continuedFractionApproximation(Math.PI, 3)).toEqual([355, 113]);      // 3.1415929203539825
  expect(continuedFractionApproximation(Math.PI, 4)).toEqual([103993, 33102]); // 3.1415926530119025
})

test("encode B64", () => {
  expect(new TextDecoder().decode(new Uint8Array(encodeB64(0)))).toEqual("");
  expect(new TextDecoder().decode(new Uint8Array(encodeB64(1)))).toEqual("1");
  expect(new TextDecoder().decode(new Uint8Array(encodeB64(9)))).toEqual("9");
  expect(new TextDecoder().decode(new Uint8Array(encodeB64(10)))).toEqual("a");
  expect(new TextDecoder().decode(new Uint8Array(encodeB64(35)))).toEqual("z");
  expect(new TextDecoder().decode(new Uint8Array(encodeB64(64)))).toEqual("10");
  expect(new TextDecoder().decode(new Uint8Array(encodeB64(14488732)))).toEqual("This");
  expect(new TextDecoder().decode(new Uint8Array(encodeB64(1180)))).toEqual("is");
  expect(new TextDecoder().decode(new Uint8Array(encodeB64(1955739563022)))).toEqual("strange");
  expect(new TextDecoder().decode(new Uint8Array(encodeB64(778653614416704845n)))).toEqual("HelloWorld");
});

test("decode B64", () => {
  const input = new TextEncoder().encode("+1+9+a+z+A+Z+-+_+10+11");
  expect(decodeB64(input, 0)).toEqual([0, 0]);
  expect(decodeB64(input, 1)).toEqual([1, 2]);
  expect(decodeB64(input, 3)).toEqual([9, 4]);
  expect(decodeB64(input, 5)).toEqual([10, 6]);
  expect(decodeB64(input, 7)).toEqual([35, 8]);
  expect(decodeB64(input, 9)).toEqual([36, 10]);
  expect(decodeB64(input, 11)).toEqual([61, 12]);
  expect(decodeB64(input, 13)).toEqual([62, 14]);
  expect(decodeB64(input, 15)).toEqual([63, 16]);
  expect(decodeB64(input, 17)).toEqual([64, 19]);
  expect(decodeB64(input, 20)).toEqual([65, 22]);
  expect(decodeB64(new TextEncoder().encode("This"))).toEqual([14488732, 4]);
  expect(decodeB64(new TextEncoder().encode("is"))).toEqual([1180, 2]);
  expect(decodeB64(new TextEncoder().encode("strange"))).toEqual([1955739563022, 7]);
  expect(decodeB64(new TextEncoder().encode("HelloWorld"))).toEqual([778653614416704845n, 10]);
});

test("decode B64 fixed-width", () => {
  const input2 = new TextEncoder().encode("00010203102030");
  expect(decodeB64(input2, 0, 2)).toEqual([0, 2]);
  expect(decodeB64(input2, 2, 4)).toEqual([1, 4]);
  expect(decodeB64(input2, 4, 6)).toEqual([2, 6]);
  expect(decodeB64(input2, 6, 8)).toEqual([3, 8]);
  expect(decodeB64(input2, 8, 10)).toEqual([64, 10]);
  expect(decodeB64(input2, 10, 12)).toEqual([128, 12]);
  expect(decodeB64(input2, 12, 14)).toEqual([192, 14]);
  expect(decodeB64(input2, 0, 4)).toEqual([1, 4]);
});

test("encode integers", () => {
  expect(stringify(0)).toEqual("+");
  expect(stringify(1)).toEqual("2+");
  expect(stringify(12)).toEqual("o+");
  expect(stringify(123)).toEqual("3S+");
  expect(stringify(1234)).toEqual("CA+");
  expect(stringify(12345)).toEqual("61O+");
  expect(stringify(123456)).toEqual("Yi0+");
  expect(stringify(1234567)).toEqual("9qQe+");
  expect(stringify(12345678)).toEqual("1ucas+");
  expect(stringify(123456789)).toEqual("eJVEG+");
  expect(stringify(1234567890)).toEqual("2jb0mA+");
  expect(stringify(-1)).toEqual("1+");
  expect(stringify(-12)).toEqual("n+");
  expect(stringify(-123)).toEqual("3R+");
  expect(stringify(-1234)).toEqual("Cz+");
  expect(stringify(-12345)).toEqual("61N+");
  expect(stringify(-123456)).toEqual("Yh_+");
  expect(stringify(-1234567)).toEqual("9qQd+");
  expect(stringify(-12345678)).toEqual("1ucar+");
  expect(stringify(-123456789)).toEqual("eJVEF+");
  expect(stringify(-1234567890)).toEqual("2jb0mz+");
  expect(stringify(1e10 - 1)).toEqual("iE5Yv-+");
  expect(stringify(1e11 - 1)).toEqual("2WgXs_-+");
  expect(stringify(1e12 - 1)).toEqual("t6Fix_-+");
  expect(stringify(1e13 - 1)).toEqual("4z2sVj_-+");
  expect(stringify(64n ** 1n)).toEqual("20+");
  expect(stringify(64n ** 2n)).toEqual("200+");
  expect(stringify(64n ** 3n)).toEqual("2000+");
  expect(stringify(64n ** 4n)).toEqual("20000+");
  expect(stringify(64n ** 5n)).toEqual("200000+");
  expect(stringify(64n ** 6n)).toEqual("2000000+");
  expect(stringify(64n ** 7n)).toEqual("20000000+");
  expect(stringify(64n ** 8n)).toEqual("200000000+");
  expect(stringify(64n ** 9n)).toEqual("2000000000+");
  expect(stringify(64n ** 10n)).toEqual("20000000000+");
  expect(stringify(64n ** 11n)).toEqual("200000000000+");
  expect(stringify(64n ** 12n)).toEqual("2000000000000+");
  expect(stringify(64n ** 13n)).toEqual("20000000000000+");
  expect(stringify(64n ** 14n)).toEqual("200000000000000+");
  expect(stringify(64n ** 15n)).toEqual("2000000000000000+");
  expect(stringify(64n ** 16n)).toEqual("20000000000000000+");
  expect(stringify(64n ** 17n)).toEqual("200000000000000000+");
  expect(stringify(64n ** 18n)).toEqual("2000000000000000000+");
  expect(stringify(64n ** 19n)).toEqual("20000000000000000000+");
  expect(stringify(64n ** 20n)).toEqual("200000000000000000000+");
});

test("encode rationals", () => {
  expect(stringify(1 / 3)).toEqual("2|3/"); // 0.3333333333333333
  expect(stringify(-1 / 3)).toEqual("1|3/"); // -0.3333333333333333
  expect(stringify(1 / 7)).toEqual("2|7/"); // 0.14285714285714285
  expect(stringify(-1 / 7)).toEqual("1|7/"); // -0.14285714285714285
  expect(stringify(6 / 7)).toEqual("c|7/"); // 0.8571428571428571
  expect(stringify(-6 / 7)).toEqual("b|7/"); // -0.8571428571428571
  expect(stringify(22 / 7)).toEqual("I|7/"); // 3.142857142857143
  expect(stringify(12347 / 1234)).toEqual("61S|ji/"); // 10.005672609400325
  expect(stringify(1 / 0)).toEqual("2|/"); // Infinity
  expect(stringify(-1 / 0)).toEqual("1|/"); // -Infinity
  expect(stringify(0 / 0)).toEqual("|/");  // NaN
})

test("encode decimals", () => {
  expect(stringify(0.1)).toEqual("2|1.");
  expect(stringify(-0.1)).toEqual("1|1.");
  expect(stringify(10.1)).toEqual("3a|1.");
  expect(stringify(-10.1)).toEqual("39|1.");
  expect(stringify(1e10)).toEqual("2|k.");
  expect(stringify(-1e10)).toEqual("1|k.");
  expect(stringify(1e-10)).toEqual("2|j.");
  expect(stringify(-1e-10)).toEqual("1|j.");
  expect(stringify(0.123)).toEqual("3S|5.");
  expect(stringify(0.123456)).toEqual("Yi0|b.");
  expect(stringify(0.123456789)).toEqual("eJVEG|h.");
  expect(stringify(123.456789)).toEqual("eJVEG|b.");
  expect(stringify(123456.789)).toEqual("eJVEG|5.");
  expect(stringify(123456789e6)).toEqual("eJVEG|c.");
  expect(stringify(123456789e9)).toEqual("eJVEG|i.");
  expect(stringify(123456789e-20)).toEqual("eJVEG|D.");
  expect(stringify(123456789e20)).toEqual("eJVEG|E.");
  expect(stringify(123456789e-40)).toEqual("eJVEG|1f.");
  expect(stringify(123456789e40)).toEqual("eJVEG|1g.");
  expect(stringify(123456789e-80)).toEqual("eJVEG|2v.");
  expect(stringify(123456789e80)).toEqual("eJVEG|2w.");
  expect(stringify(123456789e-160)).toEqual("eJVEG|4_.");
  expect(stringify(123456789e160)).toEqual("eJVEG|50.");
  expect(stringify(123456789e-320)).toEqual("eJVEG|9_.");
  expect(stringify(Math.PI)).toEqual("mkEokiJF2|t."); // 3.141592653589793
  expect(stringify(-Math.PI)).toEqual("mkEokiJF1|t."); // -3.141592653589793
  expect(stringify(Math.E)).toEqual("jk8qtAsha|t."); // 2.718281828459045
  expect(stringify(-Math.E)).toEqual("jk8qtAsh9|t."); // -2.718281828459045
  expect(stringify(Math.SQRT2)).toEqual("1Av6kkrUUe|v."); // 1.4142135623730951
  expect(stringify(-Math.SQRT2)).toEqual("1Av6kkrUUd|v."); // -1.4142135623730951
})

test("encode primitives", () => {
  expect(stringify(true)).toEqual("!");
  expect(stringify(false)).toEqual("~");
  expect(stringify(null)).toEqual("?");
});

test("encode strings", () => {
  expect(stringify("")).toEqual("$");
  expect(stringify("a")).toEqual("1$a");
  expect(stringify("ab")).toEqual("2$ab");
  expect(stringify("abc")).toEqual("3$abc");
  expect(stringify(" ".repeat(10))).toEqual("a$" + " ".repeat(10));
  expect(stringify(" ".repeat(100))).toEqual("1A$" + " ".repeat(100));
  expect(stringify(" ".repeat(1000))).toEqual("fE$" + " ".repeat(1000));
})

// TODO: this is wrong, the body should base64 encoded instead of raw bytes
test("encode bytes", () => {
  expect(stringify(new Uint8Array([]))).toEqual("=");
  expect(stringify(new Uint8Array([0]))).toEqual("2=AA");
  expect(stringify(new Uint8Array([0, 0]))).toEqual("3=AAA");
  expect(stringify(new Uint8Array([0, 0, 0]))).toEqual("4=AAAA");
  expect(stringify(new Uint8Array([1, 2, 3, 4]))).toEqual("6=AQIDBA");
  expect(stringify(new Uint8Array(10).fill(32))).toEqual("e=ICAgICAgICAgIA");
  expect(stringify(new Uint8Array([0xde, 0xad, 0xbe, 0xef]).fill(32))).toEqual("6=ICAgIA");
});
