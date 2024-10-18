export declare function decodeB64(buf: Uint8Array, offset?: number, end?: number): [number | bigint, number];
export declare function encodeB64(num: bigint | number): number[];
export declare function splitDecimal(val: number): (number | bigint)[];
export interface EncodeOptions {
    chainMinChars?: number;
    chainSplitter?: RegExp;
    prettyPrint?: boolean;
    knownValues?: unknown[];
    binaryHeaders?: boolean;
    streamContainers?: boolean;
}
export declare function findStringSegments(rootVal: unknown, options?: EncodeOptions): {
    [val: string]: number;
};
export declare function continuedFractionApproximation(num: number, maxIterations?: number, tolerance?: number): number[];
export declare function encodeBinary(rootVal: unknown, options?: EncodeOptions): Uint8Array;
export declare function stringify(rootVal: unknown, options?: EncodeOptions): string;
export declare function encode(rootVal: unknown, options?: EncodeOptions): Uint8Array;
export declare function parse(rando: string): string | number | bigint | boolean;
export declare function decode(rando: Uint8Array, offset?: number): (string | number)[] | (number | bigint)[] | (number | boolean)[];
