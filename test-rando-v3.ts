import { encode, findStringSegments } from "./rando-v3.ts";

const data = await Promise.all([
  Bun.file("data.json").json(),
  Bun.file("data2.json").json(),
  Bun.file("data3.json").json(),
  Bun.file("data4.json").json(),
  Bun.file("data5.json").json(),
  Bun.file("data6.json").json(),
]);
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

// Generate a good set of known strings for testing
let segments = findStringSegments(data);
const knownValues = Object.entries(segments)
  .filter(([k]) => k.length > 2)
  .sort((a, b) => b[1] - a[1])
  .map(([k]) => k)
  .slice(0, 63);
console.log(knownValues);

const bytes = encode(data, { knownValues });
Bun.write("output.rando-v3", bytes);
const output = new TextDecoder().decode(bytes);
console.log("Rando-V3", output.length);

// for (let i = 0; i < 1024; i++) {
//   let n;
//   // console.log(i, String.fromCharCode(...encode(i)));
//   // console.log(-1 - i, String.fromCharCode(...encode(-1 - i)));
//   console.log((i + 1) / 360, String.fromCharCode(...encode((i + 1) / 360)));
//   console.log((i + 1) / 100, String.fromCharCode(...encode((i + 1) / 100)));
//   // n = -Math.floor(Math.random() * 3600) / 3600;
//   // console.log(n, String.fromCharCode(...encode(n)));
//   // n = Math.floor(Math.random() * 3600) / 3600;
//   // console.log(n, String.fromCharCode(...encode(n)));
//   // n = Math.floor(Math.random() * 2e10 - 1e10) / 1e7;
//   // console.log(n, String.fromCharCode(...encode(n)));
//   n = Math.floor(Math.random() * 1e8) / Math.floor(Math.random() * 1e2);
//   n = NaN;
//   console.log(n, String.fromCharCode(...encode(n)));
//   n =
//     Math.floor(Math.random() * 2e10 - 1e10) *
//     Math.pow(10, Math.random() * 200 - 200);
//   console.log(n, String.fromCharCode(...encode(n)));
// }

// console.log(breakFloat(1000));
// console.log(breakFloat(0.000001));
// console.log(breakFloat(Math.PI));
// console.log(breakFloat(-Math.PI));
// console.log(breakFloat(1e100));
// console.log(breakFloat(1e-100));
// console.log(breakFloat(1.23456789e-10));
// console.log(breakFloat(1.23456789e10));
// console.log(breakFloat(1.23456789e-100));
// console.log(breakFloat(1.23456789e100));

// console.log(continuedFractionApproximation(Math.PI, 4));
// console.log(continuedFractionApproximation(-Math.PI, 4));
// console.log(continuedFractionApproximation(1 / 2));
// console.log(continuedFractionApproximation(3 / 2));
// console.log(continuedFractionApproximation(1 / 3));
// console.log(continuedFractionApproximation(5 / 3));

// for (let j = 1; j < 3600; j++) {
//   const i = Math.floor(Math.random() * 10000);
//   const n = i / j;
//   const { numerator, denominator } = continuedFractionApproximation(n);
//   if (Math.abs(n - numerator / denominator) > 1e-9) {
//     console.log("FAIL", [i, j], [numerator, denominator], n);
//   }
//   console.log([i, j], [numerator, denominator], n);
// }
// console.log(continuedFractionApproximation(123 / 456));
