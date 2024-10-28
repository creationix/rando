# Rando - An Exciting Serialization Format

[![Bun Tests](https://github.com/creationix/rando/actions/workflows/test.yaml/badge.svg?event=push)](https://github.com/creationix/rando/actions/workflows/test.yaml)

| Light Mode                                  | Dark Mode                                 |
| ------------------------------------------- | ----------------------------------------- |
| ![Rando Logo for Light](img/logo-light.svg) | ![Rando Logo for Dark](img/logo-dark.svg) |

- [Rando - An Exciting Serialization Format](#rando---an-exciting-serialization-format)
  - [Basic Usage](#basic-usage)
  - [Supported Types](#supported-types)
    - [Boolean and Null](#boolean-and-null)
    - [Numbers](#numbers)
    - [Strings and Binary](#strings-and-binary)
    - [Lists (aka Arrays)](#lists-aka-arrays)
    - [Maps (aka Objects)](#maps-aka-objects)
    - [Pointers and References](#pointers-and-references)
  - [Lazy Block Fetches](#lazy-block-fetches)

Rando is a new serialization format optimized for fast random access of unstructured data.

|                                       JS |                                JSON | Rando                        | Comment             |
| ---------------------------------------: | ----------------------------------: | :--------------------------- | ------------------- |
|                                      `0` |                                 `0` | `+`                          | Integers            |
|                                     `-1` |                                `-1` | `1+`                         |                     |
|                                      `1` |                                 `1` | `2+`                         |                     |
|                                    `-25` |                               `-25` | `N+`                         |                     |
|                                   `2000` |                              `2000` | `-w+`                        |                     |
|                                `-125000` |                           `-125000` | `Z2f+`                       |                     |
|                                `8654321` |                           `8654321` | `121Ly+`                     |                     |
|                                    `1/3` |                `0.3333333333333333` | `2\|3/`                      | Rational            |
|                                  `-13/7` |               `-1.8571428571428572` | `p\|7/`                      |                     |
|                                    `1/0` |                                 N/A | `2\|/`                       | Infinity            |
|                                   `-1/0` |                                 N/A | `1\|/`                       | -Infinity           |
|                                    `0/0` |                                 N/A | `\|/`                        | NaN                 |
|                                  `20.24` |                             `20.24` | `_g\|3.`                     | Decimal             |
|                                  `1e100` |                             `1e100` | `2\|38.`                     |                     |
|                                `-1e-200` |                           `-1e-200` | `1\|6f.`                     |                     |
|                                `Math.PI` |                 `3.141592653589793` | `mkEokiJF2\|t.`              |                     |
|                           `Math.sqrt(3)` |                `1.7320508075688772` | `1X4t8mn8q8\|v.`             |                     |
|                                   `true` |                              `true` | `!`                          | True                |
|                                  `false` |                             `false` | `~`                          | False               |
|                                   `null` |                              `null` | `?`                          | Null                |
|                                     `''` |                                `""` | `$`                          | Empty String        |
|                               `'Banana'` |                          `"Banana"` | `Banana@`                    | B64 String          |
|                            `'Hi, World'` |                       `"Hi, World"` | `9$Hi, World`                | String              |
|                                    `'🍌'` |                               `"🍌"` | `4$🍌`                        | UTF-8 String        |
|                            `[ 1, 2, 3] ` |                       `[ 1, 2, 3] ` | `6;2+4+6+`                   | Lists               |
|                      `[ 100, 100, 100 ]` |                 `[ 100, 100, 100 ]` | `6;1**38+`                   | Lists with Pointers |
|                            `[ 1, 2, 3 ]` |                       `[ 1, 2, 3 ]` | `6\|3;2+4+6+`                | Counted Lists       |
|                   `{ a: 1, b: 2, c: 3 }` |               `{"a":1,"b":2,"c":3}` | `c:a@2+b@4+c@6+`             | Maps                |
|                   `{ a: 1, b: 2, c: 3 }` |               `{"a":1,"b":2,"c":3}` | `c\|3:a@b@c@2+4+6+`          | Counted Maps        |
| `[ { name: 'Alice' }, { name: 'Bob' } ]` | `[{"name":"Alice"},{"name":"Bob"}]` | `l\|2;8:8*Alice@9:name@Bob@` | Repeated Keys       |
|                 `new Map([[1,2],[3,4]])` |                                 N/A | `8\|2:2+6+4+8+`              | Non-string Keys     |
|          `new Uint8Array([213,231,187])` |                                 N/A | `4=1ee7`                     | Bytes               |

Use Rando anywhere you might use JSON if the following are true:

- You don't want to always parse everything when reading documents
- You don't like encoding repeat values (like object keys) over and over.
- You don't need a human-readable or human-editable format.
- You might be able to share a list of known values between encoder and decoder.
- You still need to be able to serilize to text, maybe embed inside JSON as a string.

## Basic Usage

First add rando as a dependency to your project:

```sh
npm i -S @creationix/rando
```

Then import it as any module. The npm package also includes a `.d.ts` package for conveinence.

```js
import { stringify, parse } from "@creationix/rando"

const sampleDoc = {
  person: {
    name: 'John Doe',
    age: 30,
    id: 12345,
    'ai-generated': true,
  },
  list: [1, 2, 3, 4, 5],
  nested: {
    key: 'value',
    nested: {
      key: 'value',
    },
  },
}

const encoded = stringify(sampleDoc)
console.log(encoded)
// 1B|3:person@list@11*H|4:name@age@id@c$ai-generated8$John DoeY+61O+!a;2+4+6+8+a+n|2:b*nested@6*a:key@value@

const decoded = parse(encoded)
console.log(decoded)
// {
//   person: [Getter],
//   list: [Getter],
//   nested: [Getter],
// }
```

The string output is generally smaller than the JSON equivalent, especially if you have a lot of repeated values. Some documents in the wild end up being 30% their original size!

The decoded value in JavaScript is lazy parsed so it should be very fast even for large documents as only the top-level keys in an object are eagerly decoded. All object values and array values are lazilly decoded on first access and then cached for future access.

## Supported Types

Rando can encode anything that JSON can encode:

- null
- boolean
- number
- string
- list
- map

It can also encode:

- binary (base64 encoded when rando is in text mode)
- rational numbers (including `Infinity`, `-Infinity` and `NaN`)
- maps can contain any values, not just strings.

### Boolean and Null

These three primitives have a dedicated symbol each.

```
        true:  `!`
       false:  `~`
        null:  `?`
```

### Numbers

Numbers are encoded using three different types to optimize for common values.

```
     integer:  zigzag(number) `+`
    rational:  zigzag(numerator) `|` denominator `/`
     decimal:  zigzag(base) `|` zigzag(exponent) `.`
```

Integer uses zigzag encoding so small negative values are short, but we can encode arbitrary precision using any number of digits.

Rational works great for values like `0.33333333333333333` that encode as `1/3`.  Also rational allows encoding `Infinity`, `-Infinity`, and `NaN` as `1/0`, `-1/0` and `0/0`.

Decimal powers of 10 as typically written in scientific notation.  `10000000000` is `1e10`, not powers of 2 like `double` or `float`.

### Strings and Binary

Rando can encode unicode strings using UTF-8 as well as arbitrary binary data using base64.

Since strings are so common in most data sets a few special types exist to shave the bytes.

```
  b64-string:  b64String `@`
 utf8-string:  len `$` utf-8-data
       bytes:  len `=` base64-data
       chain:  len `,` ( b64-string | string | bytes | pointer | reference | chain )*
```

### Lists (aka Arrays)

Lists are zero or more arbitrary values that can be encoded in three levels of verboseness.

```
        list:  len                     `;`             value*
counted-list:  len `|` count           `;`             value*
indexed-list:  len `|` count `|` width `;` array-index value*
```

The first has `O(n)` costs to find an item and `O(n)` costs to count the items.

By adding a count we reduce the cost of counting to `O(1)`

By also adding the array index we reduce the cost of indexing an item to `O(1)`

### Maps (aka Objects)

Maps are zero or more pairs of arbitrary values that can also be encoded in three levels of verboseness.

Note that keys are not limited to strings.

```
        map:   len                     `:`            (key value)*
counted-map:   len `|` count           `:`            key* value*
indexed-map:   len `|` count `|` width `:` trie-index key* value*
```

The first has `O(n)` costs to find a key, and if the value is huge, this may require fetching multiple blocks.

By adding a count, we're able to move the keys up-front where they are more likely to be contained in the same block.

Then by adding an index, we reduce lookup costs to `O(log n)` time.

### Pointers and References

One method rando can use to speed up decoding and reduce serialized size is to de-duplicate seen or known values.

```
     pointer:  offset `*`
   reference:  index `&`
```

A `pointer` points to a value `seen` later in the document. Since Rando encodes back to front, these are values that have already been `seen` while encoding.

To decode a pointer, add `offset` bytes after the `*` and decode again.

A `reference` is a zero based index into an external array of `known` values provided by the caller of both the encoder and decoder.

It's up to the user of the library to ensure that the same list is used for both sides.

## Lazy Block Fetches

Rando is designed on the principle that it might be used for cases where the document is so large that the client doesn't want to download the entire thing before starting to read it.

This is why the various optimizations take into account the `blockSize` encoding option.

- Pointers ensure that they never point to data in another block
- Lists automatically add count if the number of items exceeds the `listCountThreshold` encoding option.
- Lists automatically add indices if the encoded values are larger than one block.
- Maps automatically add count if the encoded key/value pairs are larger than one block.
- Maps automatically add indices if either the number of keys exceeds the `mapCountThreshold` encoding option or the encoded keys alone are larger than one block.

With this in mind, rando is designed to be used with a system that has a block-level caching proxy.

- The decoder will read arbitrary byte slices our of the document as needed
- The block system will translate these reads to block aligned reads (possibly spanning more than one block in a single read)
- The block system will cache fetched blocks so that future reads that expand to the same block don't fetch it again.

One common method for hosting these files is a normal HTTP server that supports range requests.
