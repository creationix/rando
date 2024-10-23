# Rando - An Exciting Serialization Format

[![Bun Tests](https://github.com/creationix/rando/actions/workflows/test.yaml/badge.svg?event=push)](https://github.com/creationix/rando/actions/workflows/test.yaml)

| Light Mode                                  | Dark Mode                                 |
| ------------------------------------------- | ----------------------------------------- |
| ![Rando Logo for Light](img/logo-light.svg) | ![Rando Logo for Dark](img/logo-dark.svg) |

Rando is a new serialization format optimized for fast random access of unstructured data.

|                                JSON | Rando                        | Comment                                   |
| ----------------------------------: | :--------------------------- | ----------------------------------------- |
|                                 `0` | `+`                          | Zigzag Integers (val)                     |
|                                 `1` | `2+`                         |                                           |
|                                `10` | `k+`                         |                                           |
|                               `100` | `38+`                        |                                           |
|                              `1000` | `vg+`                        |                                           |
|                                `-1` | `1+`                         |                                           |
|                               `-10` | `j+`                         |                                           |
|                              `-100` | `37+`                        |                                           |
|                             `-1000` | `vf+`                        |                                           |
|               `0.03333333333333333` | `2\|u/`                      | Rational ( zigzag(num) dem )              |
|                           `3.14159` | `2ppu\|9.`                   | Decimal ( zigzag(base) zigzag(exponent) ) |
|                              `true` | `!`                          | True                                      |
|                             `false` | `~`                          | False                                     |
|                              `null` | `?`                          | Null                                      |
|                                `""` | `$`                          | Empty String                              |
|                          `"Banana"` | `Banana'`                    | B64 String                                |
|                       `"Hi, World"` | `9$Hi, World`                | String                                    |
|                               `"🍌"` | `4$🍌`                        | UTF-8 String                              |
|                           `[1,2,3]` | `6;2+4+6+`                   | Lists                                     |
|                     `[100,100,100]` | `6;1**38+`                   | Lists with Pointers (repeats)             |
|                           `[1,2,3]` | `6\|3;2+4+6+`                | Counted Lists                             |
|               `{"a":1,"b":2,"c":3}` | `c:a'2+b'4+c'6+`             | Maps                                      |
|               `{"a":1,"b":2,"c":3}` | `c\|3:a'b'c'2+4+6+`          | Counted Maps                              |
| `[{"name":"Alice"},{"name":"Bob"}]` | `l\|2;8:8*Alice'9:name'Bob'` | Maps and Lists with Pointers              |

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
// 1B|3:person'list'11*H|4:name'age'id'c$ai-generated8$John DoeY+61O+!a;2+4+6+8+a+n|2:b*nested'6*a:key'value'

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

The basic types in JSON are supported along with automatically base64 encoded binary data.

```
integer:      zigzag(number) `+`
rational:     zigzag(numerator) `|` denominator `/`
decimal:      zigzag(base) `|` zigzag(exponent) `.`
pointer:      offset `*`
reference:    index `&`
true:         `!`
false:        `~`
null:         `?`
string:       len `$` utf-8-data
bytes:        len `=` base64-data
chain:        len `,` string-like-value*
list:         len `;` value*
counted-list: len `|` count `;` value*
map:          len `:` key/value*
counted-map:  len `|` count `:` key* value*
array:        len `|` count `#` width `;` array-index value*
trie:         len `|` count `#` width `;` trie-index key* value*
```

### Pointers

Rando does automatic de-duplication of strings and numbers within a value. For example the JS value `[100,100,100]` can be encoded as `6;1**38+` which means:

```
6[    -- List with 6 bytes of body
  1*  -- Pointer to value at 1 byte offset from end of this value
  *   -- Pointer to value at 0 byte offset from end of this value
  38+ -- Positive integer 100
```

It's up to encoders to discover duplicates and decide when to use pointers and when to encode the values again. The algorithm in this implementation is simple. It deduplicates numbers and strings if the size of the encoded pointer would be less bytes than encoding the value itself.

A more expensive algorithm could do deep comparisions against other objects and deduplicate any that have identical structures.

### References

In addition to pointers, rando can point to an index into an external shared list of values. These are much more compact since the value never needs to be stored in the document once and the numerical offsets are indices instead of byte offsets and so tend to be much smaller.

For example, consider encoding this object:

```js
{
  method: 'GET',
  scheme: 'https',
  host: 'example.com',
  port: 443,
  path: '/',
  headers: [
    ['accept', 'application/json'],
    ['user-agent', 'Mozilla/5.0'],
  ],
}
```

With this shared set of known values:

```js
[
  'method',
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'scheme',
  'http',
  'https',
  'host',
  'port',
  'path',
  '/',
  80,
  443,
  'headers',
  'accept',
  'user-agent',
  ['accept', 'application/json'],
]
```

This yields the following rando encoding which is about 1/3 the size JSON would be.

```
R|6:&5&8&9&a&e&1&7&b$example.comd&b&j;h&f;g&b$Mozilla/5.0
```

### Pretty Printed Mode

Technically rando allows whitespace before any b64 digit.  The offsets need to take this into account, but it does make for an easier to read version when learning the format or trying to see how it encodes things.  For example, the fruit example from the tests.

```js
import * as Rando from "@creationix/rando"

const fruit = [
  { color: 'red', fruits: ['apple', 'strawberry'] },
  { color: 'green', fruits: ['apple'] },
  { color: 'yellow', fruits: ['apple', 'banana'] },
]

// Pretty Printed JSON
console.log(JSON.stringify(fruit, null, 1))
// [
//  {
//   "color": "red",
//   "fruits": [
//    "apple",
//    "strawberry"
//   ]
//  },
//  {
//   "color": "green",
//   "fruits": [
//    "apple"
//   ]
//  },
//  {
//   "color": "yellow",
//   "fruits": [
//    "apple",
//    "banana"
//   ]
//  }
// ]

// Compact JSON
console.log(JSON.stringify(fruit))
// [{"color":"red","fruits":["apple","strawberry"]},{"color":"green","fruits":["apple"]},{"color":"yellow","fruits":["apple","banana"]}]

// Compact Rando
console.log(Rando.stringify(fruit))
// 1l;o|2:I*M*red'e;U*a$strawberrye|2:g*k*green'2;q*z|2:color'fruits'yellow'd;apple'banana'

// Pretty Rando
// 2p;
//  M|2:
//   1l*
//   1o*
//
//   red'
//   n;
//    1u*
//    a$strawberry
//  v|2:
//   w*
//   A*
//
//   green'
//   6;
//    F*
//  U|2:
//   color'
//   fruits'
//
//   yellow'
//   l;
//    apple'
//    banana'
```
