/**
 * Given a value and optional list of known values shared between encoder and decoder,
 * return a binary representation of the value.
 */
export declare function encode(rootValue: unknown, knownValues?: unknown[]): Uint8Array;
/**
 * Given an encoded buffer and known values shared between encoder and decoder,
 * return the value that was encoded.
 * Objects and Arrays will be lazilly decoded,
 * so only the root value is decoded eagerly.
 */
export declare function decode(encoded: Uint8Array, knownValues?: unknown[]): any;
