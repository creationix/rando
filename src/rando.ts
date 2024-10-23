// Inline values
const NULL = '?'
const FALSE = '~'
const TRUE = '!'
const REF = '&' // Reference to shared known value by offset index
const PTR = '*' // Reference to inline value by byte offset from end of value
const INTEGER = '+' // zigzag(N)
const RATIONAL = '/' // Rational number as zigzag(num)|dem
const DECIMAL = '.' // Decimal (base 10 exponent) number as zigzag(base)|zigzag(exp)
// Separator for multiple parts (used by RATIONAL and DECIMAL)
// For example, 1/3 would be encoded as:
//   B64(zigzag(1)) "|" B64(3) "/"
// And 12.34 as decimal would be encoded as:
//   B64(zigzag(1234)) "|" B64(zigzag(2)) "."
// Separator is one case in the grammar where
// multiple b64 values are required to skip a frame.
const SEP = '|'

// Byte Container Types
const B64_STRING = "'" // base64 digits are the string itself
const STRING = '$' // Contains UTF-8 encoded string bytes
const BYTES = '=' // Contains RAW bytes as BASE64URL encoded string
const CHAIN = ',' // String, bytes, or regexp broken into pieces

// Recursive Container Types
const LIST = ';' // Multiple values in sequence
// If SEP is present, val2 is count of items
const MAP = ':' // Multiple key-value pairs
// if SEP is present, it's keys first format and val2 is count of keys

export const tags = {
  NULL,
  FALSE,
  TRUE,
  REF,
  PTR,
  INTEGER,
  RATIONAL,
  DECIMAL,
  SEP,
  B64_STRING,
  STRING,
  BYTES,
  CHAIN,
  LIST,
  MAP,
}

const binaryTypes = {
  [NULL]: 0,
  [FALSE]: 1,
  [TRUE]: 2,
  [REF]: 3,
  [PTR]: 4,
  [INTEGER]: 5,
  [RATIONAL]: 6,
  [DECIMAL]: 7,
  [B64_STRING]: 8,
  [STRING]: 9,
  [BYTES]: 10,
  [CHAIN]: 11,
  [LIST]: 12,
  [MAP]: 13,
  [SEP]: 15,
}

// URL Safe Base64 ordered similar to decimal and hecadecimal
// Used for digits of variable length integers.
const BASE64_DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_'
// Normal URL Safe Base64 used for encoding of binary data
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function decodeB64(buf: Uint8Array, offset = 0, end = buf.length): [number | bigint, number] {
  let num = 0n
  while (offset < end) {
    const byte = buf[offset]
    const index = BASE64_DIGITS.indexOf(String.fromCharCode(byte))
    if (index < 0) {
      break
    }
    offset++
    num = num * 64n + BigInt(index)
  }
  return [toNumberMaybe(num), offset]
}

// When encoding variable integers using the B64 chars, they are encoded in little endian
// This means that the first character is the least significant digit.
// This is the opposite of the normal big endian encoding of numbers.
export function encodeB64(num: bigint | number): number[] {
  const bytes: number[] = []
  if (typeof num === 'bigint') {
    while (num > 0n) {
      bytes.push(BASE64_DIGITS.charCodeAt(Number(num % 64n)))
      num /= 64n
    }
  } else if (num < 2 ** 32) {
    while (num > 0) {
      bytes.push(BASE64_DIGITS.charCodeAt(num & 63))
      num >>>= 6
    }
  } else {
    while (num > 0) {
      bytes.push(BASE64_DIGITS.charCodeAt(num % 64))
      num = Math.floor(num / 64)
    }
  }
  bytes.reverse()
  return bytes
}

function parseBase64(value: Uint8Array): Uint8Array {
  const output: number[] = []
  for (let i = 0, l = value.length; i < l; ) {
    const byte1 = BASE64_CHARS.indexOf(String.fromCharCode(value[i++]))
    const byte2 = BASE64_CHARS.indexOf(String.fromCharCode(value[i++]))
    output.push((byte1 << 2) | (byte2 >> 4))
    if (i >= l) {
      break
    }
    const byte3 = BASE64_CHARS.indexOf(String.fromCharCode(value[i++]))
    output.push(((byte2 & 0x0f) << 4) | (byte3 >> 2))
    if (i >= l) {
      break
    }
    const byte4 = BASE64_CHARS.indexOf(String.fromCharCode(value[i++]))
    output.push(((byte3 & 0x03) << 6) | byte4)
  }
  return new Uint8Array(output)
}

function encodeZigZag(num: bigint): bigint {
  return num >= 0n ? num * 2n : -1n - num * 2n
}

export function decodeZigZag(num: bigint): bigint {
  return num & 1n ? -(num >> 1n) - 1n : num >> 1n
}

export function toNumberMaybe(num: bigint | number): number | bigint {
  if (Number.isSafeInteger(Number(num))) {
    return Number(num)
  }
  return num
}

const decMatch = /^(?<whole>[+-]?\d+?)(?<zeroes>0*)(?:\.(?<part>\d+))?(?:[eE](?<epow>[+-]?\d+))?$/

// Split a float into signed integer parts of base and exponent base 10
// This uses the built-in string conversion to get the parts
export function splitDecimal(val: number) {
  const str = val.toString()
  // Count decimal or trailing zeroes or e-notation to get exponent
  const m = str.match(decMatch)
  if (!m) {
    throw new Error('Invalid float')
  }
  const { whole, zeroes, part, epow } = m.groups
  let base: bigint
  let exp: number
  if (part) {
    base = BigInt(whole + (zeroes ?? '') + part)
    exp = -part.length
  } else {
    base = BigInt(whole)
    exp = base && zeroes ? zeroes.length : 0
  }
  if (epow) {
    exp += parseInt(epow)
  }
  return [base, exp]
}

export interface EncodeOptions {
  blockSize?: number
  mapCountedLimit?: number // The max count of map keys allowed before a length is encoded and keys are put first
  listCountedLimit?: number // The max count of list items allowed before a length is encoded
  chainMinChars?: number
  chainSplitter?: RegExp
  prettyPrint?: boolean
  knownValues?: unknown[]
  binaryHeaders?: boolean
}

export interface DecodeOptions {
  knownValues?: unknown[]
}

const defaults: Required<EncodeOptions> = {
  blockSize: 64 ** 3,
  mapCountedLimit: 1,
  listCountedLimit: 10,
  // Chain defaults were found by brute forcing all combinations on several datasets
  // But they can be adjusted for specific data for fine tuning.
  chainMinChars: 7,
  chainSplitter: /([^a-zA-Z0-9-_]*[a-zA-Z0-9-_]+)/,
  prettyPrint: false,
  knownValues: [],
  binaryHeaders: false,
}

export function findStringSegments(rootVal: unknown, options: EncodeOptions = {}) {
  const chainMinChars = options.chainMinChars ?? defaults.chainMinChars
  const chainSplitter = options.chainSplitter ?? defaults.chainSplitter
  const counts: { [val: string]: number } = {}
  walk(rootVal)
  return counts
  function walk(val: unknown) {
    if (typeof val === 'string') {
      if (val.length < chainMinChars) {
        counts[val] = (counts[val] ?? 0) + 1
      } else {
        for (const segment of val.split(chainSplitter).filter(Boolean)) {
          counts[segment] = (counts[segment] ?? 0) + 1
        }
      }
    }
    if (Array.isArray(val)) {
      for (const item of val) {
        walk(item)
      }
    } else if (val && typeof val === 'object') {
      if (val instanceof Map) {
        for (const [k, v] of val.entries()) {
          walk(k)
          walk(v)
        }
      } else {
        for (const [k, v] of Object.entries(val)) {
          walk(k)
          walk(v)
        }
      }
    }
  }
}

// Appriximate a number as a continued fraction
// This is used to encode floating point numbers as rational numbers
export function continuedFractionApproximation(num: number, maxIterations = 50, tolerance = 1e-9) {
  const sign = num < 0 ? -1 : 1
  num = Math.abs(num)
  const coefficients: number[] = []
  const integerPart = Math.floor(num)
  let fractionalPart = num - integerPart
  coefficients.push(integerPart)
  let iterations = 0
  while (fractionalPart > tolerance && iterations < maxIterations) {
    const reciprocal = 1 / fractionalPart
    const nextIntPart = Math.floor(reciprocal)
    coefficients.push(nextIntPart)
    fractionalPart = reciprocal - nextIntPart
    iterations++
  }
  let numerator = 1
  let denominator = 0
  for (let i = coefficients.length - 1; i >= 0; i--) {
    const temp = numerator
    numerator = coefficients[i] * numerator + denominator
    denominator = temp
  }
  numerator *= sign
  return [numerator, denominator]
}

function encodeLeb128(num: bigint): number[] {
  const bytes: number[] = []
  while (num >= 0x80n) {
    bytes.push(Number(num & 0x7fn) | 0x80)
    num /= 128n
  }
  bytes.push(Number(num))
  return bytes
}

function injectWhitespace(bytes: number[], depth: number) {
  for (let i = 0; i < depth; i++) {
    bytes.unshift(' '.charCodeAt(0))
  }
  if (depth) {
    bytes.unshift('\n'.charCodeAt(0))
  }
}

export function sameShape(a: unknown, b: unknown) {
  if (a === b) {
    return true
  }
  if (!(a && typeof a === 'object' && b && typeof b === 'object')) {
    return false
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) {
      return false
    }
    if (a.length !== b.length) {
      return false
    }
    for (let i = 0; i < a.length; i++) {
      if (!sameShape(a[i], b[i])) {
        return false
      }
    }
    return true
  }
  if (Array.isArray(b)) {
    return false
  }
  return sameShape(Object.entries(a), Object.entries(b))
}

export function encodeBinary(rootVal: unknown, options: EncodeOptions = {}) {
  return encode(rootVal, {
    ...options,
    binaryHeaders: true,
    prettyPrint: false,
  })
}

export function stringify(rootVal: unknown, options: EncodeOptions = {}) {
  return new TextDecoder().decode(encode(rootVal, { ...options, binaryHeaders: false }))
}

// Strings that are also b64 numbers within Number.MAX_SAFE_INTEGER
const base64Str = /^[a-zA-Z1-9-_][a-zA-Z0-9-_]{0,7}$/

function getBlock(blockSize: number, offset: number): number {
  const block = Math.floor(offset / blockSize)
  return block
}

export function encode(rootVal: unknown, options: EncodeOptions = {}) {
  const blockSize = options.blockSize ?? defaults.blockSize
  const mapCountedLimit = options.mapCountedLimit ?? defaults.mapCountedLimit
  const listCountedLimit = options.listCountedLimit ?? defaults.listCountedLimit
  const chainMinChars = options.chainMinChars ?? defaults.chainMinChars
  const chainSplitter = options.chainSplitter ?? defaults.chainSplitter
  const prettyPrint = options.prettyPrint ?? defaults.prettyPrint
  const knownValues = options.knownValues ?? defaults.knownValues
  const binaryHeaders = options.binaryHeaders ?? defaults.binaryHeaders
  let expectedSegments = findStringSegments(rootVal, options)
  const parts: Uint8Array[] = []
  let offset = 0
  let depth = 0
  const seen = new Map<unknown, { offset: number; written: number }>()
  const known = new Map<unknown, number>()
  const knownObjects = knownValues.filter((v) => v && typeof v === 'object')
  const entries = Object.entries(expectedSegments)
    .filter(([str, count]) => count > 1 && str.length >= chainMinChars)
    .sort((a, b) => a[1] - b[1])
  expectedSegments = Object.fromEntries(entries)
  for (let i = 0; i < knownValues.length; i++) {
    const value = knownValues[i]
    if (typeof value === 'string') {
      expectedSegments[value] = Infinity
    }
    known.set(value, i)
  }
  encodeAny(rootVal)
  const bytes = new Uint8Array(offset)
  offset = 0
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    bytes.set(part, offset)
    offset += part.byteLength
  }

  return bytes

  function pushRaw(value: Uint8Array) {
    parts.push(value)
    offset += value.byteLength
  }

  // Encode a binary value as url-safe base64
  function pushBase64(value: Uint8Array) {
    const output: number[] = []
    for (let i = 0, l = value.length; i < l; ) {
      const byte1 = value[i++]
      output.push(BASE64_CHARS.charCodeAt(byte1 >> 2))
      if (i >= l) {
        output.push(BASE64_CHARS.charCodeAt((byte1 & 0x03) << 4))
      } else {
        const byte2 = value[i++]
        output.push(BASE64_CHARS.charCodeAt(((byte1 & 0x03) << 4) | ((byte2 || 0) >> 4)))
        if (i >= l) {
          output.push(BASE64_CHARS.charCodeAt((byte2 & 0x0f) << 2))
        } else {
          const byte3 = value[i++]
          output.push(BASE64_CHARS.charCodeAt(((byte2 & 0x0f) << 2) | ((byte3 || 0) >> 6)))
          output.push(BASE64_CHARS.charCodeAt(byte3 & 0x3f))
        }
      }
    }
    parts.push(new Uint8Array(output))
    offset += output.length
  }

  function pushHeaderBinary(type: string, value: number | bigint) {
    const num = BigInt(value) * 16n + BigInt(binaryTypes[type])
    return pushRaw(new Uint8Array(encodeLeb128(num)))
  }

  function pushHeader(type: string, value: number | bigint, trim = -1) {
    if (binaryHeaders) {
      return pushHeaderBinary(type, value)
    }
    const bytes = encodeB64(value)
    bytes.push(type.charCodeAt(0))
    if (prettyPrint) {
      if (trim < 0) {
        injectWhitespace(bytes, depth)
      } else {
        while (trim-- > 0) {
          bytes.unshift(' '.charCodeAt(0))
        }
      }
    }
    return pushRaw(new Uint8Array(bytes))
  }

  // Does not support utf-8 encoding of unicode chars for performance reasons
  function pushChars(chars: string, trim = -1) {
    const bytes = Array.prototype.map.call(chars, (b: string) => b.charCodeAt(0))
    if (prettyPrint) {
      if (trim < 0) {
        injectWhitespace(bytes, depth)
      } else {
        while (trim-- > 0) {
          bytes.unshift(' '.charCodeAt(0))
        }
      }
    }
    return pushRaw(new Uint8Array(bytes))
  }

  function pushHeaderPair(type: string, value1: number | bigint, value2: number | bigint, trim = -1) {
    pushHeader(type, value2, 0)
    return pushHeader(SEP, value1, trim)
  }

  function encodeNumber(val: number, trim = -1) {
    if (val === Infinity) {
      return pushHeaderPair(RATIONAL, 2, 0, trim)
    }
    if (val === -Infinity) {
      return pushHeaderPair(RATIONAL, 1, 0, trim)
    }
    if (Number.isNaN(val)) {
      return pushHeaderPair(RATIONAL, 0, 0, trim)
    }

    const [base, exp] = splitDecimal(val)

    // Encode integers as zigzag
    if (exp >= 0 && exp <= 3 && Number.isSafeInteger(val)) {
      return pushHeader(INTEGER, encodeZigZag(BigInt(val)), trim)
    }

    // Try to encode using rational when base is large and exp is negative
    // The goal is to detect repeating decimals that are actually rationals.
    if ((base <= -1000000n || base >= 1000000n) && exp < 0) {
      // Encode rational numbers as two integers
      const [numerator, denominator] = continuedFractionApproximation(val)
      if (
        numerator !== 0 &&
        numerator < 1e9 &&
        numerator > -1e9 &&
        denominator > 0 &&
        denominator < 1e9 &&
        Math.abs(numerator / denominator - val) < 1e-12
      ) {
        return pushHeaderPair(RATIONAL, encodeZigZag(BigInt(numerator)), denominator, trim)
      }
    }

    // Fallthrough that encodes as decimal floating point
    return pushHeaderPair(DECIMAL, encodeZigZag(BigInt(base)), encodeZigZag(BigInt(exp)), trim)
  }

  function encodeString(val: string, trim = -1) {
    if (!binaryHeaders && base64Str.test(val)) {
      return pushChars(val + B64_STRING, trim)
    }
    const body = new TextEncoder().encode(val)
    if (val.length >= chainMinChars) {
      const segments = val.split(chainSplitter).filter(Boolean)
      // combine segments that aren't expected to be reusable
      for (let i = segments.length - 1; i > 0; i--) {
        const exp = expectedSegments[segments[i]]
        const pexp = expectedSegments[segments[i - 1]]
        if (exp === undefined && pexp === undefined) {
          segments.splice(i - 1, 2, segments[i - 1] + segments[i])
        }
      }

      if (segments.length > 1) {
        depth++
        const before = offset
        for (let i = segments.length - 1; i >= 0; i--) {
          const segment = segments[i]
          encodeAny(segment, 0)
        }
        depth--
        return pushHeader(CHAIN, offset - before, trim)
      }
    }
    pushRaw(body)
    return pushHeader(STRING, body.byteLength, trim)
  }

  function encodeBinary(val: Uint8Array, trim = -1) {
    const start = offset
    pushBase64(val)
    return pushHeader(BYTES, offset - start, trim)
  }

  function encodeList(val: unknown[], trim = -1) {
    depth++
    const before = offset
    for (let i = val.length - 1; i >= 0; i--) {
      encodeAny(val[i])
    }
    depth--
    if (val.length <= listCountedLimit) {
      return pushHeader(LIST, offset - before, trim)
    }
    return pushHeaderPair(LIST, offset - before, val.length, trim)
  }

  function encodeObject(val: object, trim = -1) {
    if (val instanceof Map) {
      return encodeEntries([...val.entries()], trim)
    }
    return encodeEntries(Object.entries(val), trim)
  }

  function encodeEntries(entries: [unknown, unknown][], trim = -1) {
    const before = offset
    if (entries.length <= mapCountedLimit) {
      depth++
      for (let i = entries.length - 1; i >= 0; i--) {
        const [key, value] = entries[i]
        encodeAny(value, 1)
        encodeAny(key)
      }
      depth--
      return pushHeader(MAP, offset - before, trim)
    }
    depth++
    for (let i = entries.length - 1; i >= 0; i--) {
      const [_, value] = entries[i]
      encodeAny(value)
    }
    if (prettyPrint) {
      pushRaw(new Uint8Array([10]))
    }
    for (let i = entries.length - 1; i >= 0; i--) {
      const [key] = entries[i]
      encodeAny(key)
    }

    depth--
    return pushHeaderPair(MAP, offset - before, entries.length, trim)
  }

  function encodeAny(val: unknown, trim = -1): void {
    if (known.has(val)) {
      return pushHeader(REF, known.get(val), trim)
    }
    if (val && typeof val === 'object') {
      for (const knownObj of knownObjects) {
        if (sameShape(val, knownObj)) {
          return pushHeader(REF, known.get(knownObj), trim)
        }
      }
    }

    if (seen.has(val)) {
      const s = seen.get(val)
      const dist = offset - s.offset
      const cost = binaryHeaders
        ? Math.max(0, Math.ceil(Math.log2(dist) / Math.log2(128)))
        : Math.max(0, Math.ceil(Math.log2(dist) / Math.log2(64))) + 1
      // Only use pointers when it actually saves space and points within the same block
      if (cost < s.written && getBlock(blockSize, offset + cost) === getBlock(blockSize, s.offset)) {
        return pushHeader(PTR, dist, trim)
      }
    }
    const before = offset
    encodeAnyInner(val, trim)
    const written = offset - before
    if (val && typeof val !== 'object' && written >= 3) {
      seen.set(val, { offset, written })
    }
  }

  function encodeAnyInner(val: unknown, trim = -1): void {
    if (typeof val === 'string') {
      return encodeString(val, trim)
    }
    if (typeof val === 'bigint') {
      return pushHeader(INTEGER, encodeZigZag(val), trim)
    }
    if (typeof val === 'number') {
      return encodeNumber(val, trim)
    }
    if (typeof val === 'boolean') {
      return pushHeader(val ? TRUE : FALSE, 0, trim)
    }
    if (val === null) {
      return pushHeader(NULL, 0, trim)
    }
    if (Array.isArray(val)) {
      return encodeList(val, trim)
    }
    if (val instanceof Uint8Array) {
      return encodeBinary(val, trim)
    }
    if (typeof val === 'object') {
      return encodeObject(val, trim)
    }

    throw new TypeError('Unsupported value')
  }
}

export function parse(rando: string, options: DecodeOptions = {}): unknown {
  const buf = new TextEncoder().encode(rando)
  return decode(buf, options)
}

export function decode(rando: Uint8Array, options: DecodeOptions = {}) {
  const knownValues = options.knownValues ?? []
  return decodeAny(0)[0]
  function decodeAny(offset: number): [unknown, number] {
    // trim leading whitespace
    while (rando[offset] === 32 || rando[offset] === 10 || rando[offset] === 13 || rando[offset] === 9) {
      offset++
    }
    const [val, newOffset] = decodeB64(rando, offset)
    const tag = rando[newOffset]
    if (tag === B64_STRING.charCodeAt(0)) {
      return [new TextDecoder().decode(rando.subarray(offset, newOffset)), newOffset + 1]
    }
    offset = newOffset + 1
    if (tag === NULL.charCodeAt(0)) {
      return [null, offset]
    }
    if (tag === FALSE.charCodeAt(0)) {
      return [false, offset]
    }
    if (tag === TRUE.charCodeAt(0)) {
      return [true, offset]
    }
    if (tag === INTEGER.charCodeAt(0)) {
      return [toNumberMaybe(decodeZigZag(BigInt(val))), offset]
    }
    if (tag === SEP.charCodeAt(0)) {
      const [val2, newOffset] = decodeB64(rando, offset)
      offset = newOffset
      const tag2 = rando[offset++]
      if (tag2 === RATIONAL.charCodeAt(0)) {
        return [Number(decodeZigZag(BigInt(val))) / Number(val2), offset]
      }
      if (tag2 === DECIMAL.charCodeAt(0)) {
        const str = `${decodeZigZag(BigInt(val)).toString(10)}e${decodeZigZag(BigInt(val2)).toString(10)}`
        return [parseFloat(str), offset]
      }
      if (tag2 === MAP.charCodeAt(0)) {
        let allStrings = true
        const entries: [unknown, unknown][] = []
        for (let i = 0; i < val2; i++) {
          const [key, newOffset] = decodeAny(offset)
          if (typeof key !== 'string') {
            allStrings = false
          }
          entries[i] = [key, undefined]
          offset = newOffset
        }
        for (let i = 0; i < val2; i++) {
          const [value, newOffset] = decodeAny(offset)
          entries[i][1] = value
          offset = newOffset
        }
        return [allStrings ? Object.fromEntries(entries) : new Map(entries), offset]
      }
      if (tag2 === LIST.charCodeAt(0)) {
        // TODO: lazy parsed list
        // this is duplicated from below because the counting means nothing to this eager parser
        const end = offset + Number(val)
        const list: unknown[] = []
        while (offset < end) {
          const [item, newOffset] = decodeAny(offset)
          list.push(item)
          offset = newOffset
        }
        return [list, offset]
      }
      throw new Error(`Invalid type following separator: ${String.fromCharCode(tag2)}`)
    }
    if (tag === STRING.charCodeAt(0)) {
      const end = offset + Number(val)
      const str = new TextDecoder().decode(rando.slice(offset, end))
      return [str, end]
    }
    if (tag === BYTES.charCodeAt(0)) {
      const end = offset + Number(val)
      const bytes = parseBase64(rando.slice(offset, end))
      return [bytes, end]
    }
    if (tag === LIST.charCodeAt(0)) {
      // TODO: lazy parsed list
      const end = offset + Number(val)
      const list: unknown[] = []
      while (offset < end) {
        const [item, newOffset] = decodeAny(offset)
        list.push(item)
        offset = newOffset
      }
      return [list, offset]
    }
    if (tag === MAP.charCodeAt(0)) {
      // TODO: lazy parsed map
      const end = offset + Number(val)
      const entries: [unknown, unknown][] = []
      let allStrings = true
      while (offset < end) {
        const [key, newOffset] = decodeAny(offset)
        const [value, newerOffset] = decodeAny(newOffset)
        if (typeof key !== 'string') {
          allStrings = false
        }
        entries.push([key, value])
        offset = newerOffset
      }
      return [allStrings ? Object.fromEntries(entries) : new Map(entries), offset]
    }
    if (tag === CHAIN.charCodeAt(0)) {
      const parts: string[] = []
      const end = offset + Number(val)
      while (offset < end) {
        const [part, newOffset] = decodeAny(offset)
        parts.push(String(part))
        offset = newOffset
      }
      return [parts.join(''), offset]
    }
    if (tag === PTR.charCodeAt(0)) {
      return [decodeAny(offset + Number(val))[0], offset]
    }
    if (tag === REF.charCodeAt(0)) {
      return [knownValues[Number(val)], offset]
    }
    throw new SyntaxError(`Unknown parse type ${String.fromCharCode(tag)}`)
  }
}
