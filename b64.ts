const chars =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";

export function encode(num: number | bigint): string {
  let str = "";
  let n = BigInt(num);
  while (n > 0n) {
    str = chars[Number(n % 64n)] + str;
    n /= 64n;
  }
  return str;
}

export function decode(str: string): number | bigint {
  let num = 0n;
  for (let i = 0, len = str.length; i < len; i++) {
    num = 64n * num + BigInt(chars.indexOf(str[i]));
  }
  // convert back to number if within 53 bit mantissa range
  if (num <= 2n ** 53n) {
    return Number(num);
  }
  return num;
}

function log10(num: bigint): number {
  if (num < 0) return NaN;
  const s = num.toString(10);
  return s.length + Math.log10(parseInt("0." + s.substring(0, 15)));
}

export function sizeNeeded(num: number | bigint): number {
  if (num === 0) return 0;
  if (typeof num === "bigint") {
    return Math.floor((num.toString(8).length - 1) / 2 + 1);
  }
  return Math.floor(Math.log(num) / Math.log(64) + 1);
}
