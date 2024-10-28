export declare const tags: {
    NULL: string;
    FALSE: string;
    TRUE: string;
    REF: string;
    PTR: string;
    INTEGER: string;
    RATIONAL: string;
    DECIMAL: string;
    SEP: string;
    B64_STRING: string;
    STRING: string;
    BYTES: string;
    CHAIN: string;
    LIST: string;
    MAP: string;
};
export declare const binaryTypes: {
    "?": number;
    "~": number;
    "!": number;
    "&": number;
    "*": number;
    "+": number;
    "/": number;
    ".": number;
    $: number;
    "=": number;
    ",": number;
    ";": number;
    ":": number;
    "|": number;
};
export declare function decodeB64(buf: Uint8Array, offset?: number, end?: number): [number | bigint, number];
export declare function encodeB64(num: bigint | number): number[];
export declare function decodeZigZag(num: bigint): bigint;
export declare function toNumberMaybe(num: bigint | number): number | bigint;
export declare function splitDecimal(val: number): (number | bigint)[];
export interface EncodeOptions {
    blockSize?: number;
    mapCountedLimit?: number;
    listCountedLimit?: number;
    chainMinChars?: number;
    chainSplitter?: RegExp;
    prettyPrint?: boolean;
    knownValues?: unknown[];
    binaryHeaders?: boolean;
}
export interface DecodeOptions {
    knownValues?: unknown[];
}
export declare const defaults: Required<EncodeOptions>;
export declare function findStringSegments(rootVal: unknown, options?: EncodeOptions): {
    [val: string]: number;
};
export declare function continuedFractionApproximation(num: number, maxIterations?: number, tolerance?: number): number[];
export declare function encodeLeb128(num: bigint): number[];
export declare function sameShape(a: unknown, b: unknown): any;
export declare function encodeBinary(rootVal: unknown, options?: EncodeOptions): Uint8Array;
export declare function stringify(rootVal: unknown, options?: EncodeOptions): string;
export declare function encode(rootVal: unknown, options?: EncodeOptions): Uint8Array;
export declare function parse(rando: string, options?: DecodeOptions): unknown;
export declare function decode(rando: Uint8Array, options?: DecodeOptions): unknown;
