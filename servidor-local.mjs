// Servidor para probar Sintonizados con celulares reales en la misma red Wi-Fi, sin Ably ni Netlify.
//   node servidor-local.mjs
// Sirve el juego y hace de "puente" en tiempo real entre la tele y los celulares:
//   GET  /relay/sub?canal=X[&rewind=1]  -> flujo de eventos (Server-Sent Events)
//   POST /relay/pub?canal=X             -> {ev, data} se reenvía a todos los suscritos a X
import http from "node:http";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUERTO = Number(process.env.PORT) || 8771;
const RAIZ = path.dirname(fileURLToPath(import.meta.url));

// Solo se sirven los archivos del juego (carpeta public/)
const PERMITIDOS = {
  "/": "index.html",
  "/index.html": "index.html",
  "/jugar.html": "jugar.html",
  "/jugar": "jugar.html",
  "/sala.js": "sala.js",
  "/motor.js": "motor.js",
  "/mazos.js": "mazos.js",
  "/client.js": "client.js",
  "/dial.js": "dial.js",
  "/style.css": "style.css",
  "/sobremesa-marca.js": "sobremesa-marca.js",
};
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

const suscritos = new Map();   // canal -> Set(res)
const ultimo = new Map();      // canal -> último mensaje (para rewind)

function enviar(res, msg) { res.write(`data: ${JSON.stringify(msg)}\n\n`); }
// IPs de esta computadora en la red local; primero las típicas de Wi-Fi de casa (192.168.x.x)
function ipsRed() {
  const orden = ip => ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : 2;
  return Object.values(networkInterfaces()).flat().filter(i => i && i.family === "IPv4" && !i.internal).map(i => i.address).sort((a, b) => orden(a) - orden(b));
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/relay/ping") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }
  // la tele pregunta la dirección de red para armar el QR aunque se haya abierto con "localhost"
  if (url.pathname === "/relay/info") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ ips: ipsRed(), puerto: PUERTO })); }

  // un mismo flujo puede escuchar varios canales (?canal=A&canal=B&rw=A): cada mensaje dice de qué canal es
  if (url.pathname === "/relay/sub") {
    const canales = url.searchParams.getAll("canal");
    const rewind = new Set(url.searchParams.getAll("rw"));
    if (url.searchParams.get("rewind") === "1") canales.forEach(c => rewind.add(c));
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    res.write(": conectado\n\n");
    for (const canal of canales) {
      if (!suscritos.has(canal)) suscritos.set(canal, new Set());
      suscritos.get(canal).add(res);
      if (rewind.has(canal) && ultimo.has(canal)) enviar(res, ultimo.get(canal));
    }
    const latido = setInterval(() => res.write(": latido\n\n"), 20000);   // mantiene viva la conexión
    req.on("close", () => { clearInterval(latido); canales.forEach(c => suscritos.get(c)?.delete(res)); });
    return;
  }

  if (url.pathname === "/relay/pub" && req.method === "POST") {
    const canal = url.searchParams.get("canal") || "";
    let cuerpo = "";
    req.on("data", c => { cuerpo += c; if (cuerpo.length > 400000) req.destroy(); });
    req.on("end", () => {
      try {
        const msg = { ...JSON.parse(cuerpo), canal };
        ultimo.set(canal, msg);
        suscritos.get(canal)?.forEach(r => enviar(r, msg));
        res.writeHead(204); res.end();
      } catch { res.writeHead(400); res.end(); }
    });
    return;
  }

  const archivo = PERMITIDOS[url.pathname];
  if (!archivo) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end("No encontrado"); }
  try {
    const datos = await readFile(path.join(RAIZ, "public", archivo));
    res.writeHead(200, { "content-type": TIPOS[path.extname(archivo)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(datos);
  } catch { res.writeHead(404); res.end(); }
});

servidor.listen(PUERTO, "0.0.0.0", () => {
  console.log(`\nSintonizados · servidor local en el puerto ${PUERTO}`);
  console.log(`  Abre en esta computadora:  http://localhost:${PUERTO}`);
  ipsRed().forEach(ip => console.log(`  Dirección en tu red:       http://${ip}:${PUERTO}`));
  console.log("  Los celulares deben estar en la misma Wi-Fi y entrar con el QR.\n");
});
