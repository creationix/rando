import { encode as bandoEncode, decode as bandoDecode } from "../bando";
import { encode as randoEncode, decode as randoDecode } from "../rando";

import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const root = "/Users/tim/Documents/UniversalMC/assetFiles/PE/behavior_packs/1.4.0/vanilla"
const obj = scan()
console.log(obj)

const json = JSON.stringify(obj)
const rando = randoEncode(obj)
const bando = bandoEncode(obj)
console.log("JSON", new TextEncoder().encode(json).byteLength)
console.log("Rando", new TextEncoder().encode(rando).byteLength)
console.log("Bando", bando.byteLength)
writeFileSync("vanilla.json", json)
writeFileSync("vanilla.rando", rando)
writeFileSync("vanilla.bando", bando)

console.time("JSON")
console.time("JSON parse")
const jsonParsed = JSON.parse(json)
console.timeEnd("JSON parse")
console.time("JSON access")
console.log(jsonParsed.entities
    .cave_spider["minecraft:entity"]
    .component_groups["minecraft:spider_hostile"]["minecraft:environment_sensor"]
    .on_environment.filters.value)
console.timeEnd("JSON access")
console.timeEnd("JSON")
console.time("Rando")
const randoParsed = randoDecode(rando)
console.timeEnd("Rando")
console.time("Rando access")
console.log(randoParsed.entities
    .cave_spider["minecraft:entity"]
    .component_groups["minecraft:spider_hostile"]["minecraft:environment_sensor"]
    .on_environment.filters.value)
console.timeEnd("Rando access")
// console.time("Bando")
// const bandoParsed = bandoDecode(bando)
// console.timeEnd("Bando")

function scan(...path) {
    const fullPath = root + "/" + path.join("/")
    const dir = {}
    for (const ent of readdirSync(fullPath, { withFileTypes: true })) {
        if (ent.isDirectory()) {
            dir[ent.name] = scan(...path, ent.name)
        } else if (ent.isFile() && ent.name.endsWith(".json")) {
            const filename = fullPath + "/" + ent.name
            const json = readFileSync(filename, "utf8").replace(/\/\/.*/g, "").trim()
            if (json.length === 0) return null
            const name = ent.name.substring(0, ent.name.length - 5)
            // console.log({filename, json})
            try {
                dir[name] = eval(`(${json})`)
            } catch (err) {
                console.log(filename, json)
                throw err
            }
        }
    }
    return dir
}
