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
