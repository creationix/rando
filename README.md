# Rando - An Exciting Serialization Format

Rando is a new serialization format optimized for fast random access of unstructured data.

## Supported Types

The basic types in JSON are supported at the core with other additions as needed for various use cases.

```
Integer Encodings
+ zigzag integer

Pointer and Reference Encodings
* pointer (relative byte offset into self)
& reference (0 based index into external dictionary)

Primitive Type Encodings
? nil
! true
~ false

Floating Point Encodings
@ frac-360 (val * 360)
% percent (val * 100)
. number as string

String Encodings
' b64-string (use b64 encoding as-is)
$ utf-8 string
/ string list (list of string parts)
# binary bytes encoded as base64 payload

Containers
[ list of values
{ map of key/value pairs
: index (can be first entry in list or map)

For example, a list with index has 3 b64 headers for total-byte-length, index-count, and index-pointer-width.
A decoder that doesn't need/want the index can simply skip the index and iterate the payload.
x[x:x:iiiipppp
```
