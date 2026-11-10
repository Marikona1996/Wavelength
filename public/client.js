// Conexión WebSocket compartida + logo, fondo y efectos de radio
(function () {
  // Sala: va en la dirección (?sala=ABCD). La pantalla que no trae una crea la suya.
  const limpia = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  window.salaDeUrl = () => limpia(new URLSearchParams(location.search).get('sala'));
  window.limpiaSala = limpia;
  function salaNueva() {
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I para que no se confundan
    let c = '';
    for (let i = 0; i < 4; i++) c += letras[Math.floor(Math.random() * letras.length)];
    return c;
  }

  const leer = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const guardar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };

  // Dirección para los celulares. Con servidor-local.mjs abierto como "localhost", se usa la IP de la red.
  let baseRed = null;
  fetch('/relay/info', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => {
    if (j && j.ips && j.ips.length && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) baseRed = `http://${j.ips[0]}:${j.puerto}/`;
  }).catch(() => {});
  window.urlJugar = sala => new URL('jugar.html?sala=' + sala, baseRed || location.href).href;

  // Ya no hay servidor propio: la TELE lleva el juego (motor.js) y los celulares se conectan con sala.js
  // (como los demás juegos de Sobremesa). Canales de cada sala:
  //   <sala>:acciones   celular -> tele   {type, conn, playerId, ...}
  //   <sala>:yo:<conn>  tele -> un celular  (estado, joined, kicked)   con rewind
  //   <sala>:estado     tele -> todos  (aguja mientras se mueve y latido de la tele)
  // La interfaz es la misma que con WebSocket: send(obj), onState, onNeedle, onOpen, onClose…
  window.connectGame = function (role, handlers) {
    let sala = window.salaDeUrl();
    if (!sala && role === 'host') {
      // La tele sin código en la dirección retoma su última sala (si es reciente) o abre una nueva
      try { const g = JSON.parse(leer('sin_tele')); if (g && g.code && Date.now() - g.touched < 12 * 3600e3) sala = g.code; } catch (e) {}
      sala = sala || salaNueva();
      history.replaceState(null, '', '?sala=' + sala);
    }
    const recibir = msg => {
      if (!msg || !msg.type) return;
      if (msg.type === 'state') handlers.onState(msg.state);
      else if (msg.type === 'needle') handlers.onNeedle && handlers.onNeedle(msg.angle);
      else if (msg.type === 'joined') { guardar(PID, msg.playerId); handlers.onJoined && handlers.onJoined(msg.playerId); }
      else if (msg.type === 'kicked') { api.forget(); if (msg.message) alert(msg.message); handlers.onKicked && handlers.onKicked(); }
    };

    // ---- la tele ----
    if (role === 'host') {
      let motor = null;
      const api = { send(obj) { motor && motor.host(obj); }, connected: false, sala, pid: () => null, forget() {} };
      (async () => {
        try {
          const estado = await Sala.canal(sala + ':estado');
          const acciones = await Sala.canal(sala + ':acciones');
          const yo = new Map();
          const canalYo = conn => { if (!yo.has(conn)) yo.set(conn, Sala.canal(sala + ':yo:' + conn, { rewind: true })); return yo.get(conn); };
          motor = MotorSintonizados.crear({
            sala,
            joinUrl: () => window.urlJugar(sala),
            alHost: recibir,
            enviarA: (conn, m) => canalYo(conn).then(ch => ch.publicar('m', m)),
            difundir: m => estado.publicar('m', m),
          });
          acciones.suscribir((ev, d) => { if (d && d.conn) motor.celular(d.conn, d); });
          const latido = () => { motor.revisarSenal(); estado.publicar('latido', { t: Date.now() }); };
          setInterval(latido, 5000); latido();
          api.connected = true;
          handlers.onOpen && handlers.onOpen();
        } catch (e) {
          console.error(e);
          handlers.onClose && handlers.onClose();
        }
      })();
      return api;
    }

    // ---- un celular ----
    // ?yo=2, ?yo=3… para abrir varios "celulares" en el mismo navegador al probar
    const yoN = (new URLSearchParams(location.search).get('yo') || '').replace(/[^0-9a-z]/gi, '').slice(0, 4);
    const sufijo = sala + (yoN ? '_' + yoN : '');
    // El jugador se recuerda por sala: si entra a otra, no se mezcla.
    var PID = 'wl_pid_' + sufijo;
    const CONN = 'sin_conn_' + sufijo;
    let conn = leer(CONN);
    if (!conn) { conn = 'c' + Math.random().toString(36).slice(2, 12); guardar(CONN, conn); }
    let acciones = null, ultimoTele = 0, abierto = false;
    const api = {
      send(obj) { if (acciones) acciones.publicar('m', { ...obj, conn, playerId: obj.playerId || api.pid() || null }); },
      connected: false,
      sala,
      pid: () => leer(PID),
      forget: () => guardar(PID, null),
    };
    const vivo = () => {
      ultimoTele = Date.now();
      if (abierto) return;
      abierto = true; api.connected = true;
      handlers.onOpen && handlers.onOpen();
      api.send({ type: 'hello' });   // la tele (o una tele recargada) nos manda el estado completo
    };
    (async () => {
      try {
        const estado = await Sala.canal(sala + ':estado');
        const yo = await Sala.canal(sala + ':yo:' + conn, { rewind: true });
        acciones = await Sala.canal(sala + ':acciones');
        yo.suscribir((ev, m) => { vivo(); recibir(m); });
        estado.suscribir((ev, m) => { vivo(); if (ev === 'm') recibir(m); });
        api.send({ type: 'hello' });
        setInterval(() => {
          api.send({ type: 'latido' });
          // la tele avisa cada 5 s: si se calla, se muestra "Reconectando…"
          if (abierto && Date.now() - ultimoTele > 12000) { abierto = false; api.connected = false; handlers.onClose && handlers.onClose(); }
        }, 4000);
      } catch (e) {
        console.error(e);
        handlers.onClose && handlers.onClose();
      }
    })();
    return api;
  };

  // ---------- Logo: la primera "o" es la perilla de radio y las letras van sobre una onda ----------
  const PERILLA = (() => {
    let m = '';
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2;
      m += `<line x1="${(56 + Math.cos(a) * 46).toFixed(1)}" y1="${(56 + Math.sin(a) * 46).toFixed(1)}" x2="${(56 + Math.cos(a) * 53).toFixed(1)}" y2="${(56 + Math.sin(a) * 53).toFixed(1)}"/>`;
    }
    return `<svg class="perilla-o" viewBox="0 0 112 112" aria-hidden="true"><circle cx="56" cy="56" r="53" fill="#d9483b"/>` +
      `<g stroke="#2b211b" stroke-width="3.2" stroke-linecap="round">${m}</g>` +
      `<circle cx="56" cy="56" r="53" fill="none" stroke="#2b211b" stroke-width="3.5"/>` +
      `<circle cx="56" cy="56" r="33" fill="#f1e6cf" stroke="#2b211b" stroke-width="3.5"/>` +
      `<g class="aguja-o"><line x1="56" y1="56" x2="56" y2="30" stroke="#2b211b" stroke-width="8" stroke-linecap="round"/></g>` +
      `<circle cx="56" cy="56" r="6.5" fill="#2b211b"/></svg>`;
  })();
  // Cada letra sube o baja siguiendo una onda (por eso cada una va en su propio span)
  const letras = (txt, desde) => [...txt].map((c, i) => `<span style="--i:${desde + i}">${c}</span>`).join('');
  window.marca = (extra = '') => `<span class="marca ${extra}" role="img" aria-label="Sintonizados">` +
    `<span class="fq">${letras('Sint', 0)}</span>${PERILLA}<span class="fq">${letras('nizados', 5)}</span></span>`;

  // ---------- Estática de radio: una imagen chica de ruido que se reutiliza ----------
  let estaticaURL = '';
  window.ruidoRadio = function () {
    if (estaticaURL) return estaticaURL;
    try {
      const n = 160, g = document.createElement('canvas');
      g.width = g.height = n;
      const gx = g.getContext('2d'), img = gx.createImageData(n, n);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = v; img.data[i + 1] = v * .92; img.data[i + 2] = v * .8; img.data[i + 3] = 255;
      }
      gx.putImageData(img, 0, 0);
      estaticaURL = g.toDataURL();
    } catch (e) {}
    return estaticaURL;
  };

  // Estática que cruza la pantalla un instante: "cambio de estación"
  window.estatica = function (ms = 380) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let el = document.getElementById('estatica');
    if (!el) {
      el = document.createElement('div');
      el.id = 'estatica';
      el.style.backgroundImage = `url(${window.ruidoRadio()})`;
      document.body.appendChild(el);
    }
    el.style.setProperty('--dur', ms + 'ms');
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    // Si el navegador pausa la animación (pestaña oculta), igual se quita
    clearTimeout(el.quitar);
    el.quitar = setTimeout(() => el.classList.remove('on'), ms + 80);
  };

  // ---------- Sonidos de radio análoga (los usa la pantalla grande) ----------
  // Todo se genera al vuelo con WebAudio y pasa por un "parlante chico" (filtro de radio).
  // La idea: suena como girar el dial de una radio de verdad. Entre estaciones hay estática y
  // un silbido que cambia de tono; al caer en una estación la estática se calla.
  let ac = null, radio = null;
  const sonidoOn = () => { try { return localStorage.getItem('wl_sonido') !== '0'; } catch (e) { return true; } };
  function audio() {
    if (!sonidoOn()) return null;
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  // Los navegadores solo dejan sonar después de un toque o clic
  window.addEventListener('pointerdown', () => { if (sonidoOn()) audio(); }, { once: true });

  // Estática de radio: ruido con chasquidos sueltos, en un bucle de 2 segundos
  function bufferEstatica(c) {
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
    let marron = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      marron = (marron + 0.04 * w) / 1.04;
      d[i] = w * 0.55 + marron * 2.2;
      if (Math.random() < 0.0009) {
        const largo = 40 + Math.random() * 160, f = Math.random() * 1.6 + 0.4;
        for (let k = 0; k < largo && i + k < d.length; k++) d[i + k] += (Math.random() * 2 - 1) * f * (1 - k / largo);
      }
    }
    return b;
  }
  // Cadena fija: estática + silbido → parlante chico → salida
  function montarRadio() {
    const c = audio(); if (!c) return null;
    if (radio) return radio;
    const parlante = c.createBiquadFilter(); parlante.type = 'bandpass'; parlante.frequency.value = 1500; parlante.Q.value = 0.55;
    parlante.connect(c.destination);
    const ruido = c.createBufferSource(); ruido.buffer = bufferEstatica(c); ruido.loop = true;
    const gRuido = c.createGain(); gRuido.gain.value = 0;
    ruido.connect(gRuido).connect(parlante); ruido.start();
    const silbido = c.createOscillator(); silbido.type = 'sine'; silbido.frequency.value = 900;
    const gSilbido = c.createGain(); gSilbido.gain.value = 0;
    silbido.connect(gSilbido).connect(parlante); silbido.start();
    radio = { parlante, gRuido, gSilbido, silbido, apagar: null };
    return radio;
  }
  const rampa = (param, valor, seg) => { const t = ac.currentTime; param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); param.linearRampToValueAtTime(valor, t + seg); };
  // Estaciones de mentira repartidas en el dial (88–108 MHz)
  const ESTACIONES = [89.1, 91.7, 94.3, 96.9, 99.5, 102.1, 104.7, 107.3];
  const sintonia = mhz => {
    const d = Math.min(...ESTACIONES.map(e => Math.abs(e - mhz)));   // 0 = justo en una estación
    return {
      silbidoHz: 120 + d * 2600,                                       // el silbido baja al acercarse
      ruido: 0.05 + 0.13 * Math.min(1, d / 0.7),                       // y la estática se calla
      silbido: d < 0.9 ? 0.035 * Math.min(1, d / 0.08) * (1 - d / 0.9) : 0,
    };
  };
  // Timbre suave, como el de identificación de una estación
  function notaCampana(destino, hz, t, vol) {
    [1, 2.76, 5.4].forEach((m, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = hz * m;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol / (1 + i * 2.5), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4 - i * 0.35);
      o.connect(g).connect(destino); o.start(t); o.stop(t + 1.5);
    });
  }

  window.sonido = {
    activo: sonidoOn,
    alternar() {
      try { localStorage.setItem('wl_sonido', sonidoOn() ? '0' : '1'); } catch (e) {}
      if (!sonidoOn() && radio) { rampa(radio.gRuido.gain, 0, 0.05); rampa(radio.gSilbido.gain, 0, 0.05); }
      if (sonidoOn()) audio();
      return sonidoOn();
    },
    // Girar el dial: se llama cada vez que se mueve la aguja (0–180).
    // Suena mientras se mueve y se apaga solo cuando la aguja se queda quieta.
    girar(angulo) {
      const r = montarRadio(); if (!r) return;
      const s = sintonia(88 + angulo / 180 * 20);
      rampa(r.silbido.frequency, s.silbidoHz, 0.06);
      rampa(r.gRuido.gain, s.ruido, 0.06);
      rampa(r.gSilbido.gain, s.silbido, 0.06);
      clearTimeout(r.apagar);
      r.apagar = setTimeout(() => { rampa(r.gRuido.gain, 0, 0.35); rampa(r.gSilbido.gain, 0, 0.25); }, 260);
    },
    // Cambio de fase: el "kssht" corto de pasar rápido entre estaciones
    estatica(seg = 0.32, vol = 0.22) {
      const r = montarRadio(); if (!r) return;
      clearTimeout(r.apagar);
      const t = ac.currentTime, g = r.gRuido.gain, f = r.parlante.frequency;
      g.cancelScheduledValues(t); g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(vol, t + 0.015); g.linearRampToValueAtTime(vol * 0.5, t + seg * 0.6); g.linearRampToValueAtTime(0, t + seg);
      f.cancelScheduledValues(t); f.setValueAtTime(700, t);
      f.exponentialRampToValueAtTime(2600, t + seg * 0.5); f.exponentialRampToValueAtTime(1500, t + seg);
    },
    // Revelar: se gira el dial desde lejos hasta caer justo en la estación; la estática se calla
    sintonizar() {
      const r = montarRadio(); if (!r) return;
      clearTimeout(r.apagar);
      const t = ac.currentTime, dur = 0.95, f = r.silbido.frequency, gs = r.gSilbido.gain, gr = r.gRuido.gain;
      f.cancelScheduledValues(t); f.setValueAtTime(2900, t);
      f.exponentialRampToValueAtTime(1200, t + dur * 0.35);
      f.exponentialRampToValueAtTime(2100, t + dur * 0.5);   // pasa por una estación vecina
      f.exponentialRampToValueAtTime(60, t + dur);           // batido cero: sintonizado
      gs.cancelScheduledValues(t); gs.setValueAtTime(0, t); gs.linearRampToValueAtTime(0.04, t + 0.08);
      gs.setValueAtTime(0.04, t + dur * 0.8); gs.linearRampToValueAtTime(0, t + dur);
      gr.cancelScheduledValues(t); gr.setValueAtTime(0, t); gr.linearRampToValueAtTime(0.2, t + 0.05);
      gr.linearRampToValueAtTime(0.1, t + dur * 0.8); gr.linearRampToValueAtTime(0, t + dur + 0.04);
    },
    // Resultado: si cayeron en la estación suena su timbre (4 = tres notas, 3 = dos, 2 = una);
    // si no sumaron, la señal se pierde entre estática
    puntos(n) {
      const r = montarRadio(); if (!r) return;
      const t = ac.currentTime + 1.05;
      if (n) {
        [392, 659.3, 523.3].slice(0, n - 1).forEach((hz, i) => notaCampana(r.parlante, hz, t + i * 0.32, 0.22));
        return;
      }
      const gr = r.gRuido.gain, gs = r.gSilbido.gain, f = r.silbido.frequency;
      gr.setValueAtTime(0, t); gr.linearRampToValueAtTime(0.24, t + 0.3); gr.linearRampToValueAtTime(0, t + 1.3);
      f.setValueAtTime(1800, t); f.exponentialRampToValueAtTime(3400, t + 1.1);
      gs.setValueAtTime(0, t); gs.linearRampToValueAtTime(0.03, t + 0.2); gs.linearRampToValueAtTime(0, t + 1.1);
    },
  };

  window.addEventListener('DOMContentLoaded', () => {
    // Logos fijos de la página
    document.querySelectorAll('.wordmark').forEach(e => { if (!e.querySelector('.marca')) e.innerHTML = window.marca('vivo' in e.dataset ? 'vivo' : ''); });

  });
})();
