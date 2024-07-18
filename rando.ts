/*
+ positive integer (n)
~ negative integer (-1 - n)

Pointer and Reference Encodings
* pointer (relative byte offset into self)
& reference (0 based index into external dictionary)

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
/ string list (list of string parts)
# binary bytes encoded as base64 payload

Containers
[ list of values
{ map of key/value pairs
: index (can be first entry in list or map)

For example, a list with index has 3 b64 headers for total-byte-length, index-count, and index-pointer-width.
A decoder that doesn't need/want the index can simply skip the index and iterate the payload.
x[x:x:iiiipppp
*/

import { encode as b64Encode } from "./b64.ts";

function zigzagEncode(num: bigint): bigint {
  return num < 0 ? num * -2n - 1n : num * 2n;
}

function encodeBigint(value: bigint): string {
  return value >= 0n ? b64Encode(value) + "+" : b64Encode(-1n - value) + "~";
}

function encodeNumber(value: number): string {
  if (Number.isInteger(value)) {
    return encodeBigint(BigInt(value));
  }
  const percent = Math.round(value * 100);
  if (
    Math.abs(percent) > 0 &&
    Math.abs(percent) < 2 ** 51 &&
    Math.abs(percent - value * 100) < 1e-12
  ) {
    return b64Encode(zigzagEncode(BigInt(percent))) + "%";
  }
  const degree = Math.round(value * 360);
  if (
    Math.abs(degree) > 0 &&
    Math.abs(degree) < 2 ** 51 &&
    Math.abs(degree - value * 360) < 1e-12
  ) {
    return b64Encode(zigzagEncode(BigInt(degree))) + "@";
  }
  const str = Number.isNaN(value)
    ? "nan"
    : value === Infinity
    ? "inf"
    : value === -Infinity
    ? "-inf"
    : String(value);
  return b64Encode(str.length) + "." + str;
}

function encodeString(value: string): string {
  if (/^[0-9a-zA-Z_-]*$/.test(value)) {
    return value + "'";
  }
  return b64Encode(strlen(value)) + "$" + value;
}

function encodePrimitive(value: unknown): string {
  if (value == null) return "?";
  if (typeof value === "number") return encodeNumber(value);
  if (typeof value === "boolean") return value ? "^" : "!";
  if (typeof value === "bigint") return encodeBigint(value);
  throw new TypeError("Not a primitive: " + value);
}

// Get length of a string as utf-8 bytes
function strlen(str: string): number {
  return new TextEncoder().encode(str).length;
}

function findCommonSubstrings(rootVal: unknown): string[] | void {
  const stringCounts = new Map<string, number>();
  function addString(str: string) {
    stringCounts.set(str, (stringCounts.get(str) || 0) + 1);
  }
  const stack: unknown[] = [rootVal];
  while (stack.length) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      for (const entry of value) {
        stack.push(entry);
      }
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        stack.push(k);
        stack.push(v);
      }
    } else if (typeof value === "string") {
      const substrings = new Set<string>();
      // Use various patterns to collect likely good substrings
      for (const match of value.matchAll(/[0-9a-zA-Z_-]{4,}/g)) {
        substrings.add(match[0]);
      }
      for (const match of value.matchAll(/[0-9a-zA-Z]{4`,}[_ /.-]*/g)) {
        substrings.add(match[0]);
      }
      for (const match of value.matchAll(/[0-9a-zA-Z]{4,}/g)) {
        substrings.add(match[0]);
      }
      for (const match of value.matchAll(/[_ /.-]*[0-9a-zA-Z]{4,}/g)) {
        substrings.add(match[0]);
      }
      for (const match of value.matchAll(/[A-Z]?[a-z0-9]{4,}/g)) {
        substrings.add(match[0]);
      }
      // Add the unique substrings to the counts
      for (const substring of substrings) {
        addString(substring);
      }
    }
  }
  // Filter out entries with size 1
  for (const [key, value] of stringCounts) {
    if (value === 1) stringCounts.delete(key);
  }
  // Return sorted by longest first
  if (stringCounts.size > 1) {
    return [...stringCounts.keys()].sort((a, b) => b.length - a.length);
  }
}

function encode(rootValue: unknown): string {
  // Current output parts (in reverse order)
  const parts: string[] = [];
  let size = 0;
  const stringOffsets: [string, number, number][] = [];

  // Current queue of things to process
  const stack: unknown[] = [rootValue];

  const substrings = findCommonSubstrings(rootValue);
  let substringFinder: RegExp | undefined;
  if (substrings && substrings.length > 2) {
    console.log(substrings);
    // make a regexp that matches any string containing any of the substrings
    // Make sure to escape the strings for regex
    substringFinder = new RegExp(
      `(${substrings
        .map((s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"))
        .join("|")})`
    );
  }

  function push(encoded: string): number {
    parts.push(encoded);
    const len = strlen(encoded);
    size += len;
    return len;
  }

  function save() {
    return {
      size,
      partsLength: parts.length,
      stringsLength: stringOffsets.length,
    };
  }

  function restore(state: ReturnType<typeof save>) {
    size = state.size;
    parts.length = state.partsLength;
    stringOffsets.length = state.stringsLength;
  }

  function findString(string: string): [number, number] | undefined {
    for (let i = stringOffsets.length - 1; i >= 0; i--) {
      const [s, o, z] = stringOffsets[i];
      if (s === string) {
        return [o, z];
      }
    }
  }

  function addString(string: string, len: number) {
    const offset = size;
    stringOffsets.push([string, offset, len]);
  }

  while (stack.length) {
    const value = stack.pop();
    if (typeof value === "function") {
      value();
    } else if (Array.isArray(value)) {
      const start = size;
      stack.push(() => {
        const end = size;
        push(b64Encode(end - start) + "[");
      });
      for (const entry of value) {
        stack.push(entry);
      }
    } else if (value && typeof value === "object") {
      const start = size;
      stack.push(() => {
        const end = size;
        push(b64Encode(end - start) + "{");
      });
      for (const [k, v] of Object.entries(value)) {
        stack.push(k);
        stack.push(v);
      }
    } else if (typeof value === "string") {
      const seen = findString(value);
      if (seen) {
        const [offset, len] = seen;
        const pointer = b64Encode(size - offset) + "*";
        if (strlen(pointer) < len) {
          push(pointer);
          continue;
        }
      }

      if (substringFinder) {
        const segments = value.split(substringFinder).filter(Boolean);
        if (segments.length > 1) {
          const s = save();
          addString(value, push(encodeString(value)));
          const s2 = save();
          restore(s);
          const start = size;
          stack.push(() => {
            const end = size;
            const encoded = b64Encode(end - start) + "/";
            addString(value, push(encoded));
            const s3 = save();
            // If the split encoding is not smaller, revert to other timeline
            if (s3.size >= s2.size) {
              restore(s2);
            }
          });
          for (const segment of segments) {
            stack.push(segment);
          }
          continue;
        }
      }

      addString(value, push(encodeString(value)));
    } else {
      push(encodePrimitive(value));
    }
  }

  return parts.reverse().join("");

  // const seenStrings = new Map<string, [number, number]>();
  // let offset = 0;
  // return encodeAny(rootValue);

  // function encodeAny(value: unknown): string {
  //   const start = offset;
  //   const encoded = encodeAnyInner(value);
  //   offset = start + strlen(encoded);
  //   if (typeof value === "string") {
  //     seenStrings.set(value, [offset, strlen(value)]);
  //   }
  //   return encoded;
  // }
  // function encodeAnyInner(value: unknown): string {
  //   if (Array.isArray(value)) return encodeArray(value);
  //   if (value && typeof value === "object") return encodeObject(value);
  //   if (typeof value === "string") return encodeBreakableString(value);
  //   return encodePrimitive(value);
  // }

  // function encodeBreakableString(value: string): string {
  //   const start = offset;
  //   let size = 0;
  //   const basicEncoded = encodeCachableString(value);
  //   if (substringFinder) {
  //     const segments = value.split(substringFinder).filter(Boolean);
  //     const parts: string[] = [];
  //     const start = offset;
  //     for (let i = segments.length - 1; i >= 0; i--) {
  //       const segment = segments[i];
  //       const encoded = encodeCachableString(segment);
  //       parts.push(encoded);
  //       size += strlen(encoded);
  //       offset = start + size;
  //     }
  //     console.log([segments, parts.reverse()]);
  //     if (segments.length === 1) {
  //       return basicEncoded;
  //     }
  //     const splitEncoded =
  //       b64Encode(offset - start) + "/" + parts.reverse().join("");
  //     if (strlen(splitEncoded) < strlen(basicEncoded)) {
  //       return splitEncoded;
  //     }
  //   }
  //   return basicEncoded;
  // }

  // function encodeCachableString(value: string): string {
  //   const seen = seenStrings.get(value);
  //   if (seen) {
  //     const [seenOffset, seenLength] = seen;
  //     const encodedPointer = b64Encode(offset - seenOffset) + "*";
  //     // Only use pointer form if it's actually less bytes.
  //     if (encodedPointer.length < seenLength) {
  //       return encodedPointer;
  //     }
  //   }
  //   const str = encodeString(value);
  //   return str;
  // }

  // function encodeArray(value: unknown[]): string {
  //   const start = offset;
  //   const parts: string[] = [];
  //   for (let i = value.length - 1; i >= 0; i--) {
  //     const entry = value[i];
  //     const encoded = encodeAny(entry);
  //     parts.push(encoded);
  //     offset += strlen(encoded);
  //   }
  //   return b64Encode(offset - start) + "[" + parts.reverse().join("");
  // }
  // function encodeObject(value: object): string {
  //   const start = offset;
  //   const parts: string[] = [];
  //   const entries = Object.entries(value);
  //   for (let i = entries.length - 1; i >= 0; i--) {
  //     const [key, value] = entries[i];
  //     let encoded = encodeAny(value);
  //     parts.push(encoded);
  //     offset += strlen(encoded);
  //     encoded = encodeAny(key);
  //     parts.push(encoded);
  //     offset += strlen(encoded);
  //   }
  //   return b64Encode(offset - start) + "{" + parts.reverse().join("");
  // }
}

const nums = new Set<number | bigint>();
for (let x = -20; x <= 20; x++) {
  for (let y = -20; y <= 20; y++) {
    nums.add(x / y);
    nums.add(x ** y);
    nums.add(x ** y / y ** x);
    nums.add((x / y) * 1e5);
    nums.add(x / y + y / x);
    nums.add(x ** y - 1);
    nums.add(x ** y + 1);
    if (y >= 0) nums.add(BigInt(x) ** BigInt(y));
  }
}
for (const num of [...nums].sort()) {
  console.log([num, encode(num)]);
}
const strings = [
  "",
  "Hello",
  "Content-Type",
  "Content-Type: application/json",
  "underscore_case",
  "camelCase",
  "PascalCase",
  "kebab-case",
  "Hello, World!",
  "Hello, World! How are you?",
  // Unicode tests
  "👋",
  "👋🌍",
  "👋🌍👩‍🚀",
  "👋🌍👩‍🚀🚀",
  // Special characters
  'Hello, "World"!',
  "Hello, 'World'!",
  "Hello, `World`!",
  "Hello, {World}!",
  "Hello, [World]!",
  "Hello, <World>!",
  "whitespace\n\r\tis\n\r\tneat",

  //
];
for (const str of strings) {
  console.log([JSON.stringify(str), encode(str)]);
}

const objs = [
  ["Hello", "Hello", "Goodbye", "Goodbye"],
  ["a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a", "a"],
  ["aa", "aa", "aa", "aa", "aa", "aa", "aa", "aa", "aa", "aa", "aa", "aa"],
  ["aaa", "aaa", "aaa", "aaa", "aaa", "aaa", "aaa", "aaa", "aaa", "aaa"],
  ["aaaa", "aaaa", "aaaa", "aaaa", "aaaa", "aaaa", "aaaa", "aaaa", "aaaa"],
  [
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
    "aa",
  ],
  [
    "a",
    "b",
    "aa",
    "bb",
    "a",
    "b",
    "aa",
    "bb",
    "a",
    "b",
    "aa",
    "bb",
    "a",
    "b",
    "aa",
    "bb",
  ],
  [
    "a",
    "a",
    "b",
    "b",
    "a",
    "a",
    "a",
    "b",
    "b",
    "b",
    "a",
    "a",
    "a",
    "a",
    "b",
    "b",
    "b",
    "b",
  ],
  [".", ".", ".", ".", ".", ".", ".", ".", ".", "."],
  { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 },
  {
    id: "dpl_9cR1KADRPWgh8uu9JQ7jpCHsrFk4",
    name: "howtonode-org",
    alias: [
      "howtonode-org.vercel.app",
      "howtonode-org-creationix-vercelcom.vercel.app",
      "howtonode-org-git-static-creationix-vercelcom.vercel.app",
    ],
    aliasAssigned: 1644436433413,
    buildContainer: {
      dc: "cle1",
      idleSince: 1644436212000,
      jobSince: 1644436427232,
      logGroupName: "/ecs/build-fargate-task",
      logStreamName:
        "ecs/build-fargate-container-main/931bc7652d854b19b729e2a56f1e318b",
      commit: "1e9ab0f in HEAD (fargate)",
      patchToBuildingAt: 1644436429811,
      patchToUploadingAt: 1644436430714,
      patchToReadyAt: 1644436432264,
      timeline: {
        averageCpu: 3.9333333333333322,
        averageMemory: 8.233333333333336,
        peakCpu: 4.1,
        peakMemory: 9.100000000000001,
        peakDiskUsage: 5548,
      },
    },
    builds: [],
    buildStats: {
      buildsCount: 1,
      buildsParallelCount: 0,
      buildsExclusiveCount: 1,
      buildsEndAt: 1644436431914,
      buildsExclusiveEndAt: 1644436431914,
      buildsExclusiveStartAt: 1644436428649,
      buildsParallelStartAt: 1644436428649,
      buildsParallelEndAt: 1644436428649,
      buildsStartAt: 1644436428649,
    },
    createdAt: "Wed, 09 Feb 2022 19:53:46 GMT",
    deletedAt: null,
    deploymentHash: "426y1wrhuakjg0mfixrxev2xk3y4b92w4s27ylin5pybqr844k",
    deploymentHostname: "howtonode-org-59w8rfx95-creationix-vercelcom",
    featHandleMiss: true,
    fileOutputCount: -1,
    fileOutputSizeSum: -1,
    forced: false,
    generateFromSource: true,
    gitSource: {
      ref: "static",
      repoId: 493951,
      sha: "b8d15bf35d904ac63209228d1a84eb947103fd0b",
      type: "github",
    },
    internalFlags: {
      useBuildOutputsIfPossible: false,
      buildOutputsExperimentGroup: false,
      awsLambdaStates: true,
      buildOutputs: true,
    },
    layers: [],
    loopless: true,
    meta: {
      githubCommitAuthorName: "Tim Caswell",
      githubCommitMessage: "Trigger build",
      githubCommitOrg: "creationix",
      githubCommitRef: "static",
      githubCommitRepo: "howtonode.org",
      githubCommitRepoId: "493951",
      githubCommitSha: "b8d15bf35d904ac63209228d1a84eb947103fd0b",
      githubDeployment: "1",
      githubOrg: "creationix",
      githubRepo: "howtonode.org",
      githubRepoId: "493951",
      githubCommitAuthorLogin: "creationix",
    },
    movedFromOwnerId: "BTWlLcBaTK1WioX9sO3pPt0x",
    ownerId: "team_Kjj62Keg5RnDnB50ivsTVn81",
    plan: "hobby",
    projectId: "prj_A5Mmy4V8aX7STWABv6cRqvqdV4Li",
    projectSettings: {
      createdAt: "Tue, 13 Jul 2021 14:04:22 GMT",
      gitForkProtection: true,
      nodeVersion: "14.x",
      publicSource: false,
      sourceFilesOutsideRootDirectory: true,
    },
    queuedForBuildContainerAt: 1644436426594,
    queuedForConcurrencyAt: 1644436426594,
    queuedForNamespaceEnterAt: 1644436424614,
    queuedForNamespaceLeaveAt: 1644436424913,
    readyState: "READY",
    readyStateAt: "Wed, 09 Feb 2022 19:53:52 GMT",
    regions: ["iad1"],
    routes: [
      { handle: "error" },
      { status: 404, src: "^(?!/api).*$", dest: "/404.html" },
    ],
    source: "git",
    target: "production",
    teamId: "team_Kjj62Keg5RnDnB50ivsTVn81",
    traceCarrier: {
      "x-datadog-trace-id": "8574907195233426405",
      "x-datadog-parent-id": "4862328439870572967",
      "x-datadog-sampled": "1",
      "x-datadog-sampling-priority": "1",
      "ot-baggage-webhookAt": "1644436424580",
      "ot-baggage-senderUsername": "gh.creationix",
    },
    type: "LAMBDAS",
    updatedAt: "Wed, 09 Feb 2022 19:53:53 GMT",
    url: "howtonode-org-59w8rfx95-creationix-vercelcom.vercel.app",
    userId: "BTWlLcBaTK1WioX9sO3pPt0x",
    version: 2,
    withCache: false,
    buildEnv: {
      CI: "1",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_AUTHOR_LOGIN: "creationix",
      VERCEL_GIT_COMMIT_AUTHOR_NAME: "Tim Caswell",
      VERCEL_GIT_COMMIT_MESSAGE: "Trigger build",
      VERCEL_GIT_COMMIT_REF: "static",
      VERCEL_GIT_COMMIT_SHA: "b8d15bf35d904ac63209228d1a84eb947103fd0b",
      VERCEL_GIT_PROVIDER: "github",
      VERCEL_GIT_REPO_ID: "493951",
      VERCEL_GIT_REPO_OWNER: "creationix",
      VERCEL_GIT_REPO_SLUG: "howtonode.org",
      VERCEL_URL: "howtonode-org-59w8rfx95-creationix-vercelcom.vercel.app",
      VERCEL: "1",
    },
  },
];
for (const obj of objs) {
  console.log();
  const json = JSON.stringify(obj);
  console.log(strlen(json), json);
  const encoded = encode(obj);
  console.log(strlen(encoded), encoded);
}
