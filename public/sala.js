// Conexión en tiempo real entre la pantalla principal y los celulares de Sintonizados.
// Elige sola cómo conectarse:
//   · "red":     con servidor-local.mjs (celulares en la misma Wi-Fi, para probar sin cuentas)
//   · "pestañas": en localhost sin ese servidor, las pestañas del mismo navegador se hablan con BroadcastChannel
//   · "ably":    en el sitio publicado (permiso temporal desde /api/ably-token)
window.Sala = (() => {
  const esLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || new URLSearchParams(location.search).has("local");
  let ably = null;
  const avisos = new Set();          // quién quiere enterarse del estado de la conexión
  let estadoConexion = "conectando";
  const avisar = (e) => { estadoConexion = e; avisos.forEach(fn => { try { fn(e); } catch (x) {} }); };

  // ¿Hay servidor local de red? (responde /relay/ping)
  const modo = fetch("/relay/ping", { cache: "no-store" })
    .then(r => r.ok ? "red" : Promise.reject())
    .catch(() => esLocal ? "pestañas" : "ably");

  function cargarAbly() {
    if (window.Ably) return Promise.resolve();
    return new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/ably@2/build/ably.min.js";
      s.onload = ok; s.onerror = () => mal(new Error("No se pudo cargar Ably"));
      document.head.appendChild(s);
    });
  }
  async function clienteAbly() {
    if (ably) return ably;
    await cargarAbly();
    ably = new window.Ably.Realtime({ authUrl: "/api/ably-token" });
    const mapa = { connected: "conectado", connecting: "conectando", disconnected: "reconectando", suspended: "reconectando", failed: "sin conexión", closed: "sin conexión" };
    ably.connection.on(ch => avisar(mapa[ch.current] || ch.current));
    return ably;
  }

  // En la red local todas las suscripciones comparten UN solo flujo de eventos: el navegador solo abre
  // ~6 conexiones por dirección (entre todas las pestañas) y cada flujo abierto ocupa una para siempre.
  const red = {
    subs: new Map(),   // canal -> { rewind, fns: [] }
    es: null, timer: null,
    agregar(canal, rewind, fn) {
      if (!this.subs.has(canal)) this.subs.set(canal, { rewind, fns: [] });
      this.subs.get(canal).fns.push(fn);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.abrir(), 30);   // junta las suscripciones que llegan seguidas
    },
    abrir() {
      if (this.es) this.es.close();
      const p = new URLSearchParams();
      this.subs.forEach((s, c) => { p.append("canal", c); if (s.rewind) p.append("rw", c); });
      const es = this.es = new EventSource("/relay/sub?" + p);
      es.onopen = () => avisar("conectado");
      es.onerror = () => avisar("reconectando");   // EventSource se reconecta solo
      es.onmessage = (e) => {
        try { const msg = JSON.parse(e.data), s = this.subs.get(msg.canal); if (s) s.fns.forEach(fn => fn(msg.ev, msg.data)); } catch (x) {}
      };
    },
  };

  // canal("KX4P:estado", { rewind:true }) -> { publicar(evento, datos), suscribir(fn(evento, datos)) }
  // rewind: al suscribirse se recibe el último mensaje publicado (para quien entra o se reconecta)
  async function canal(nombre, { rewind = false } = {}) {
    const m = await modo;

    if (m === "red") {
      const q = "canal=" + encodeURIComponent(nombre);
      let cola = Promise.resolve();   // en orden: que un estado viejo no llegue después de uno nuevo
      return {
        publicar(ev, data) {
          // con tiempo límite: un envío atorado no debe frenar a los siguientes
          cola = cola.then(() => fetch("/relay/pub?" + q, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ev, data }), signal: AbortSignal.timeout(6000) })).catch(() => {});
        },
        suscribir(fn) { red.agregar(nombre, rewind, fn); },
      };
    }

    if (m === "pestañas") {
      avisar("conectado");
      const bc = new BroadcastChannel("sin-" + nombre);
      const ult = "sin-ultimo-" + nombre;
      return {
        publicar(ev, data) {
          const msg = { ev, data };
          bc.postMessage(msg);
          if (rewind) { try { localStorage.setItem(ult, JSON.stringify(msg)); } catch (e) {} }
        },
        suscribir(fn) {
          bc.onmessage = (e) => fn(e.data.ev, e.data.data);
          if (rewind) { try { const msg = JSON.parse(localStorage.getItem(ult)); if (msg) setTimeout(() => fn(msg.ev, msg.data), 0); } catch (e) {} }
        },
      };
    }

    const cli = await clienteAbly();
    const ch = cli.channels.get("sin:" + nombre, rewind ? { params: { rewind: "1" } } : undefined);
    return {
      publicar(ev, data) { ch.publish(ev, data).catch(e => console.warn("Ably", e)); },
      suscribir(fn) { ch.subscribe(msg => fn(msg.name, msg.data)); },
    };
  }

  function codigoNuevo() {
    const L = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // sin 0/O ni 1/I para que no se confundan
    let c = ""; const r = crypto.getRandomValues(new Uint32Array(4));
    r.forEach(x => { c += L[x % L.length]; });
    return c;
  }

  return {
    modo,   // promesa: "red" | "pestañas" | "ably"
    canal,
    codigoNuevo,
    alCambiarConexion(fn) { avisos.add(fn); fn(estadoConexion); },
  };
})();
