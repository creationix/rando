# Rando - An Exciting Serialization Format

Rando is a new serialization format optimized for fast random access of unstructured data.

## Supported Types

The basic types in JSON are supported at the core with other additions as needed for various use cases.

```
+ 0000 positive integer (val)              integers 0 to 11
~ 0001 negative integer (-1 - val)         integers -1 to -12
* 0010 pointer (byte offset into self)
& 0011 reference (0 based index into external dictionary)
! 0100 simple (0 - false, 1 = true, 2 - nil)
/ 0101 frac-30 (val * 30)                  fractions like 1/3, 9/20
^ 0110 pow2 (divide next value by power of 2)
? 0111 tag (tag next value with type)

containers

$ 1000 utf-8 string
. 1001 number as string
# 1010 bytes
  1011
] 1100 list
} 1101 map
> 1110 tag (wrap value with tag)
: 1111 index (wrap list or map with quick access index)
```

## Supported Header Formats

Headers can be encoded as either binary or textual.

The binary format has a 4-bit type field and a variable length field for the associated integer value.

```
                                    yyyy xxxx
                           yyyyyyyy 1100 xxxx
                  yyyyyyyy yyyyyyyy 1101 xxxx
yyyyyyyy yyyyyyyy yyyyyyyy yyyyyyyy 1110 xxxx
yyyyyyyy yyyyyyyy yyyyyyyy yyyyyyyy 1111 xxxx
yyyyyyyy yyyyyyyy yyyyyyyy yyyyyyyy
```

Here `xxxx` is the type. For example `0000` is `int`, `1100` is `list`.

`yyyy` is the inline integer value when it's less than 12. Otherwise a larger representation is needed. All integers are unsigned and multi-byte variants use native machine little-endian for faster processing on most modern machines.
