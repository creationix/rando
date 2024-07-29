import { encode as bandoEncode, decode as bandoDecode } from "../bando";
import { encode as randoEncode, decode as randoDecode } from "../rando";

import { readdirSync, readFileSync, writeFileSync } from "node:fs";

let name: string;
name = "vanilla";
const json = readFileSync(`${name}.json`, "utf8");
const obj = JSON.parse(json);

// const json = JSON.stringify(obj)
const rando = randoEncode(obj);
const bando = bandoEncode(obj);
console.log("JSON", new TextEncoder().encode(json).byteLength);
console.log("Rando", new TextEncoder().encode(rando).byteLength);
console.log("Bando", bando.byteLength);
writeFileSync(`${name}.rando`, rando);
writeFileSync(`${name}.bando`, bando);

function accessTest(doc) {
  if (name === "vanilla") {
    return (
      doc.entities.cave_spider["minecraft:entity"].component_groups[
        "minecraft:spider_hostile"
      ]["minecraft:environment_sensor"].on_environment.filters.value === 0.49
    );
  }
}

const rep = 100;
console.time("JSON");
console.time("JSON parse");
let jsonParsed;
for (let i = 0; i < rep; i++) {
  jsonParsed = JSON.parse(json);
}
console.timeEnd("JSON parse");
console.time("JSON access");
for (let i = 0; i < rep; i++) {
  accessTest(jsonParsed);
}
console.timeEnd("JSON access");
console.timeEnd("JSON");
console.time("Rando");
console.time("Rando parse");
let randoParsed;
for (let i = 0; i < rep; i++) {
  randoParsed = randoDecode(rando);
}
console.timeEnd("Rando parse");
console.time("Rando access");
for (let i = 0; i < rep; i++) {
  accessTest(randoParsed);
}
console.timeEnd("Rando access");
console.timeEnd("Rando");

console.time("Bando");
console.time("Bando parse");
let bandoParsed;
for (let i = 0; i < rep; i++) {
  bandoParsed = bandoDecode(bando);
}
console.timeEnd("Bando parse");
console.time("Bando access");
for (let i = 0; i < rep; i++) {
  accessTest(randoParsed);
}
console.timeEnd("Bando access");
console.timeEnd("Bando");

function scan(...path) {
  const fullPath = root + "/" + path.join("/");
  const dir = {};
  for (const ent of readdirSync(fullPath, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      dir[ent.name] = scan(...path, ent.name);
    } else if (ent.isFile() && ent.name.endsWith(".json")) {
      const filename = fullPath + "/" + ent.name;
      const json = readFileSync(filename, "utf8")
        .replace(/\/\/.*/g, "")
        .trim();
      if (json.length === 0) return null;
      const name = ent.name.substring(0, ent.name.length - 5);
      // console.log({filename, json})
      try {
        dir[name] = eval(`(${json})`);
      } catch (err) {
        console.log(filename, json);
        throw err;
      }
    }
  }
  return dir;
}
