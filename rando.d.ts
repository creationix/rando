/**
 * Given a value and optional list of known values shared between encoder and decoder,
 * return a string representation of the value.
 */
export declare function encode(rootValue: unknown, knownValues?: unknown[]): string;
/**
 * Given an encoded string and known values shared between encoder and decoder,
 * return the value that was encoded.
 * Objects and Arrays will be lazilly decoded,
 * so only the root value is decoded eagerly.
 */
export declare function decode(encoded: string, knownValues?: unknown[]): any;
