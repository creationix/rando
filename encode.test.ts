import { expect, test } from "bun:test";
import { encode, decode, toNumberMaybe } from "./rando";

test("encode/decode integers", () => {
  testRoundTrip([
    0, 1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13,
    1e14, 1e15, -1, -10, -100, -1e3, -1e4, -1e5, -1e6, -1e7, -1e8, -1e9, -1e10,
    -1e11, -1e12, -1e13, -1e14, -1e15,
  ]);
  const nums = new Set<bigint | number>();
  for (const base of [2, 8, 10, 16, 64]) {
    for (let power = 0; power < 12; power++) {
      const num = BigInt(base) ** BigInt(power);
      nums.add(toNumberMaybe(num));
      nums.add(toNumberMaybe(num - 1n));
      nums.add(toNumberMaybe(num + 1n));
      nums.add(toNumberMaybe(-num));
      nums.add(toNumberMaybe(-num - 1n));
      nums.add(toNumberMaybe(-num + 1n));
    }
  }
  testRoundTrip([...nums].sort((a, b) => Number(a) - Number(b)));
});

test("encode/decode floats", () => {
  const nums = new Set<number>();
  nums.add(Math.PI);
  nums.add(Math.E);
  for (let i = 0; i <= 360; i++) {
    nums.add(i / 360);
  }
  for (let i = 0; i <= 100; i++) {
    nums.add(i / 100);
  }
  for (let i = -30; i <= 30; i++) {
    for (let j = -30; j <= 30; j++) {
      const num = i / j;
      if (Number.isInteger(num)) continue;
      nums.add(num);
    }
  }
  testRoundTrip(
    [...nums].filter((n) => !Number.isInteger(n)).sort((a, b) => a - b)
  );
});

test("encode/decode simple types", () => {
  testRoundTrip([true, false, null]);
});

test("encode/decode basic strings", () => {
  testRoundTrip([
    "",
    "Hello",
    "Hello, World!",
    "Hello, World! How are you?",
    'Hello, "World"!',
    "Hello, 'World'!",
    'Hello, "World!" How are you?',
  ]);
});

test("encode/decode binstrings", () => {
  testRoundTrip([
    "0",
    "1",
    "00",
    "01",
    "10",
    "11",
    "000",
    "001",
    "010",
    "011",
    "100",
    "101",
    "110",
    "111",
    "0000",
    "0001",
    "0010",
    "0011",
    "0100",
    "0101",
    "0110",
    "0111",
    "1000",
    "1001",
    "1010",
    "1011",
    "1100",
    "1101",
    "1110",
    "1111",
    "1",
    "10",
    "101",
    "1010",
    "10101",
    "101010",
    "1010101",
    "10101010",
    "101010101",
    "1010101010",
    "10101010101",
    "110010001111011100010000011100111101011000110110001",
  ]);
});

test("encode/decode decimal strings", () => {
  testRoundTrip([
    "123",
    "1234",
    "12345",
    "123456",
    "1234567",
    "12345678",
    "123456789",
    "1234567890",
    "12345678901",
    "123456789012",
    "1234567890123",
    "12345678901234",
    "123456789012345",
    "000000000000001",
  ]);
});

test("encode/decode hexadecimal strings", () => {
  testRoundTrip([
    "dead",
    "beef",
    "00f",
    "a",
    "ab",
    "abc",
    "abcd",
    "abcde",
    "abcdef",
    "abcdef0",
    "abcdef01",
    "deadbeef",
    "123456789abc",
    "123456789abcd",
    "123456789abcde",
    "123456789abcdef",
  ]);
});

test("encode/decode b64 strings", () => {
  testRoundTrip([
    "helloworld",
    "name",
    "id",
    "test",
    "age",
    "fruit",
    "Camel",
    "Home",
    "content-type",
    "Content-Type",
  ]);
});

test("encode/decode large strings with internal repetitions", () => {
  testRoundTrip([
    "/foo/foo/foo",
    "/boo/bar/foo/bar/foo/bar",
    "content-type, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5, content-encoding, content-length, content-disposition, content-language, content-range, content-md5",
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum",
  ]);
});

test("encode/decode arrays", () => {
  testRoundTrip([
    [],
    [100, 200, 300],
    [100, [200], 300],
    [[[[[[]]]]]],
    [[[[[[100]]]]]],
    ["Hello", "World", "How", "Are", "You"],
    [[[[[[100, 200, 300]]]]], [[[[[[100, 200, 300], 400, 500]]]]]],
  ]);
});

test("encode/decode objects", () => {
  testRoundTrip([
    {},
    { a: 100, b: 200, c: 300 },
    { a: 100, b: { c: 200 }, d: 300 },
    {
      a: {
        b: { c: { d: { e: { f: { g: { h: { i: { j: { k: 100 } } } } } } } } },
      },
    },
  ]);
});

test("encode/decode mixed objects", () => {
  testRoundTrip([
    { a: 100, b: "Hello", c: [100, 200, 300] },
    { a: 100, b: { c: 200 }, d: [100, 200, 300] },
    {
      a: {
        b: { c: { d: { e: { f: { g: { h: { i: { j: { k: 100 } } } } } } } } },
      },
    },
    [
      { color: "red", fruits: ["apple", "strawberry"] },
      { color: "green", fruits: ["apple"] },
      { color: "yellow", fruits: ["apple", "banana"] },
    ],
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
  ]);
});

test("encode/decode mixed objects with known references", () => {
  testRoundTrip2([
    ["Hello", ["Hello"]],
    [
      [
        { color: "red", fruits: ["apple", "strawberry"] },
        { color: "green", fruits: ["apple"] },
        { color: "yellow", fruits: ["apple", "banana"] },
      ],
      ["color", "fruits", "red", "orange", "yellow", "green", "blue", "violet"],
    ],
    [
      [
        { one: 100, two: 200, three: 300 },
        { one: 100, two: 200, three: 300 },
      ],
      [100, 200, 300],
    ],
    findRepeats([
      { color: "red", fruits: ["apple", "strawberry"] },
      { color: "green", fruits: ["apple"] },
      { color: "yellow", fruits: ["apple", "banana"] },
    ]),
  ]);
});

function findRepeats(rootValue: unknown): [unknown, unknown[]] {
  const stack: unknown[] = [rootValue];
  const seen = new Map<unknown, number>();
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
    } else {
      seen.set(value, (seen.get(value) || 0) + 1);
    }
  }
  return [rootValue, [...seen.keys()].filter((k) => seen.get(k)! > 1)];
}

function testRoundTrip(inputs: unknown[]) {
  for (const input of inputs) {
    const encoded = encode(input);
    const json =
      typeof input === "bigint" ? input.toString() : JSON.stringify(input);
    if (json.length > 38) {
      console.log(strlen(json), json);
      console.log();
      console.log(strlen(encoded), encoded);
      console.log("\n");
    } else {
      console.log(json.padStart(38, " ") + "  " + encoded);
    }
    const decoded = decode(encoded);
    console.log({ input, decoded });
    JSON.stringify(decoded);
    expect(decoded).toEqual(input);
  }
}

function testRoundTrip2(inputs: [unknown, unknown[]][]) {
  for (const [input, shared] of inputs) {
    const encoded = encode(input, shared);
    const json = JSON.stringify(input);
    console.log(strlen(json), json);
    console.log();
    console.log(JSON.stringify(shared));
    console.log(strlen(encoded), encoded);
    // const decoded = decode(encoded, shared);
    // expect(decoded).toEqual(input);
  }
}

// Get length of a string as utf-8 bytes
function strlen(str: string): number {
  return new TextEncoder().encode(str).length;
}
