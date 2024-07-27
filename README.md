# Rando - An Exciting Serialization Format

![Bun Tests](https://github.com/creationix/rando/actions/workflows/test.yaml/badge.svg)

| Light Mode                                  | Dark Mode                                 |
| ------------------------------------------- | ----------------------------------------- |
| ![Rando Logo for Light](img/logo-light.svg) | ![Rando Logo for Dark](img/logo-dark.svg) |

Rando is a new serialization format optimized for fast random access of unstructured data.

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
import { encode, decode } from "@creationix/rando";

const sampleDoc = {
  person: {
    name: "John Doe",
    age: 30,
    id: 12345,
    "ai-generated": true,
  },
  list: [1, 2, 3, 4, 5],
  nested: {
    key: "value",
    nested: {
      key: "value",
    },
  },
};

const encoded = encode(sampleDoc);
console.log(encoded);
// 1v{person'G{name'8$John Doeage'u+id'30V+ai-generated'^list'a[1+2+3+4+5+6*n{b*d*nested'a{key'value'

const decoded = decode(encoded);
console.log(decoded);
// {
//   person: [Getter],
//   list: [Getter],
//   nested: [Getter],
// }
```

The string output is generally smaller than the JSON equivalent, especially if you have a lot of repeated values. Some documents in the wild end up being 30% their original size!

The decoded value in JavaScript is lazy parsed so it should be very fast even for large documents as only the top-level keys in an object are eagerly decoded. All object values and array values are lazilly decoded on first access and then cached for future access.

## Supported Types

The basic types in JSON are supported.

```
Integer Encodings
+ positive integer (n)
~ negative integer (-1 - n)

Pointer and Reference Encodings
* pointer (relative byte offset into self)
& reference (0 based index into shared list of know values)

Primitive Type Encodings
? nil
^ true
! false

Floating Point Encodings
@ frac-360 (val * 360)
% percent (val * 100)
. number as string

String Encodings
' b64-string (use b64 encoding as-is)
$ utf-8 string

Containers
[ list of values
{ map of key/value pairs
```

### Pointers

Rando does automatic de-duplication of strings and numbers within a value. For example the JS value `[100,100,100]` can be encoded as `6[1**1A+` which means:

```
6[    -- List with 6 bytes of body
  1*  -- Pointer to value at 1 byte offset from end of this value
  *   -- Pointer to value at 0 btye offset from end of this value
  1A+ -- Positive integer 100
```

It's up to encoders to discover duplicates and decide when to use pointers and when to encode the values again. The algorithm in this implementation is simple. It deduplicates numbers and strings if the size of the encoded pointer would be less bytes than encoding the value itself.

A more expensive algorithm could do deep comparisions against other objects and deduplicate any that have identical structures.

### References

In addition to pointers, rando can point to an index into an external shared list of values. These are much more compact since the value never needs to be stored in the document once and the numerical offsets are indices instead of byte offsets and so tend to be much smaller.

For example, consider encoding this object:

```js
{
  method: "GET",
  scheme: "https",
  host: "example.com",
  port: 443,
  path: "/",
  headers: [
    ["accept", "application/json"],
    ["user-agent", "Mozilla/5.0"],
  ],
},
```

With this shared set of known values:

```js
[
  "method",
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "scheme",
  "http",
  "https",
  "host",
  "port",
  "path",
  "/",
  80,
  443,
  "headers",
  "accept",
  "user-agent",
  ["accept", "application/json"],
];
```

This yields the following rando encoding which is about 1/3 the size JSON would be.

```
R{&1&5&7&8&b$example.com9&d&a&b&e&j[h&f[g&b$Mozilla/5.0
```

## Advanced Usage

If it works for your use case, a second optional `knownValues` parameter can be used on both `encode` and `decode`. This allows an encoder and decoder to have a known set of shared values. These can be integers, strings, or even objects or arrays. Any time the encoder finds these, it replaces them with references which are just a few bytes each!

But make sure both the encoder and decoder have the exact same list in the same order.

```js
import { encode, decode } from "./rando";

// Some common values in an http response that
// both sides know about (similar to HTTP2 HPACK)
const sharedValued = [
  "headers",
  "body",
  "Content-Length",
  ["Content-Type", "application/json"],
  ["Content-Type", "application/json; charset=utf-8"],
  // Common status codes
  "status",
  200,
  404,
  308,
];

const body = JSON.stringify({ hello: "world" });
const httpResponse = {
  status: 200,
  headers: [
    ["Content-Type", "application/json"],
    ["Content-Length", body.length],
  ],
  body,
};

const encoded = encode(httpResponse, sharedValued);
console.log(encoded);
// A{5&6&&8[3&4[2&h+1&h${"hello":"world"}

const decoded = decode(encoded, sharedValued);
console.log(decoded);
// {
//   status: [Getter],
//   headers: [Getter],
//   body: [Getter],
// }
```
