import { encode, findStringSegments } from "./rando-v3.ts";

const data = await Promise.all([
  // Bun.file("data.json").json(),
  Bun.file("data2.json").json(),
  // Bun.file("data3.json").json(),
  // Bun.file("data4.json").json(),
  // Bun.file("data5.json").json(),
  // Bun.file("data6.json").json(),
]);

for (let i = 0; i < 1024; i++) {
  let n: number;
  console.log(i, String.fromCharCode(...encode(i)));
  console.log(-1 - i, String.fromCharCode(...encode(-1 - i)));
  console.log((i + 1) / 360, String.fromCharCode(...encode((i + 1) / 360)));
  console.log((i + 1) / 100, String.fromCharCode(...encode((i + 1) / 100)));

  // Test rational, these should generally look like xx|yy/
  n =
    Math.floor(Math.random() * 4096 - 2048) /
    Math.floor(Math.random() * 2048 + 1);
  console.log(n, String.fromCharCode(...encode(n)));

  // Test small decimals, these should generally look like xx|y.
  n = parseFloat(
    `${Math.floor(Math.random() * 2e3 - 1e3)}e${Math.floor(
      Math.random() * 20 - 10
    )}`
  );
  console.log(n, String.fromCharCode(...encode(n)));

  // Medium Decimals, these should generally look like xxx|yy.
  n = parseFloat(
    `${Math.floor(Math.random() * 2e5 - 1e5)}e${Math.floor(
      Math.random() * 200 - 100
    )}`
  );
  console.log(n, String.fromCharCode(...encode(n)));

  // Tiny Decimals, these will often be integers, but should render as decimal
  n = parseFloat(
    `${Math.floor(Math.random() * 20 - 10)}e${Math.floor(
      Math.random() * 30 - 15
    )}`
  );
  console.log(n, String.fromCharCode(...encode(n)));

  // Fully Random, these generally should not be rationals
  n = Math.pow(10, Math.random() * 200 - 100);
  console.log(n, String.fromCharCode(...encode(n)));
}

// const splitters = [
//   /([^a-zA-Z0-9-_ ]*[a-zA-Z0-9-_ ]+)/,
//   /([^a-zA-Z0-9]*[a-zA-Z0-9-_ ]+)/,
//   /([^a-zA-Z0-9-_]*[a-zA-Z0-9-_]+)/,
//   /([^a-zA-Z0-9]*[a-zA-Z0-9-_]+)/,
//   /([^a-zA-Z]*[a-zA-Z]*)/,
//   /([^a-zA-Z0-9_$]*[a-zA-Z0-9_$]+)/,
//   /([^a-zA-Z0-9]*[a-zA-Z0-9]+)/,
// ];

// const summary: [number, {}][] = [];
// for (const chainSplitter of splitters) {
//   const tried = {};
//   let smallest = Infinity;
//   let smallestConfig = {
//     chainMinChars: 5,
//     chainSplitter: /([^a-zA-Z0-9]*[a-zA-Z0-9-_]+)/,
//   };
//   while (true) {
//     let changed = false;
//     for (let x = -5; x <= 10; x++) {
//       for (let y = -2; y <= 2; y++) {
//         for (let z = -2; z <= 2; z++) {
//           const config = {
//             chainMinChars: Math.max(4, smallestConfig.chainMinChars + x),
//             chainSplitter,
//           };
//           const key = JSON.stringify(config);
//           if (tried[key]) {
//             continue;
//           }
//           const bytes = encode(data, config);
//           tried[key] = bytes.byteLength;
//           if (bytes.byteLength < smallest) {
//             smallest = bytes.byteLength;
//             smallestConfig = config;
//             console.log(smallest, smallestConfig);
//             changed = true;
//           }
//           if (bytes.byteLength === smallest) {
//             smallestConfig = {
//               ...config,
//               chainMinChars: Math.max(
//                 smallestConfig.chainMinChars,
//                 config.chainMinChars
//               ),
//             };
//             console.log(smallest, smallestConfig);
//             changed = true;
//           }
//         }
//       }
//     }
//     if (!changed) break;
//   }
//   summary.push([smallest, smallestConfig]);
//   console.log(tried);
//   console.log();
// }

// summary.sort((a, b) => a[0] - b[0]);
// console.log(summary);

const json = new TextEncoder().encode(JSON.stringify(data));
Bun.write("output.json", json);
console.log("JSON", json.length);

// const chainMinChars = 40;
// const chainSplitter = /(\/+[^/]+)/;

const options = {
  prettyPrint: false,
  // chainMinChars: 10,
};
// Generate a good set of known strings for testing
let segments = findStringSegments(data, options);
const knownValues = Object.entries(segments)
  .filter(([k]) => k.length > 2)
  .sort((a, b) => b[1] - a[1])
  .map(([k]) => k)
  .slice(0, 63);
console.log(knownValues);
options.knownValues = knownValues;

const bytes = encode(data, options);
Bun.write("output.rando-v3", bytes);
const output = new TextDecoder().decode(bytes);
console.log("Rando-V3", output.length);
