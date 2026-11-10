// Arma public/mazos.js con todos los mazos de mazos/*.json (la tele los lee de ahí, sin servidor).
//   node armar-mazos.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const mazos = readdirSync("mazos").filter(f => f.endsWith(".json")).sort().map(f => {
  const r = JSON.parse(readFileSync("mazos/" + f, "utf8"));
  return { id: f.replace(/\.json$/, ""), nombre: r.nombre || f, descripcion: r.descripcion || "", tarjetas: r.tarjetas };
});
writeFileSync("public/mazos.js", "// Mazos de Sintonizados, generados desde mazos/*.json con:  node armar-mazos.mjs\n// (si cambias un .json de mazos/, vuelve a correrlo)\nwindow.MAZOS = " + JSON.stringify(mazos) + ";\n");
console.log("public/mazos.js listo:", mazos.map(m => `${m.nombre} (${m.tarjetas.length})`).join(", "));
