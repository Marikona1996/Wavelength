// Conexión WebSocket compartida + fondo de estrellas
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

  window.connectGame = function (role, handlers) {
    let ws, retry = 500;
    let sala = window.salaDeUrl();
    if (!sala && role === 'host') { sala = salaNueva(); history.replaceState(null, '', '?sala=' + sala); }
    // El jugador se recuerda por sala: si entra a otra, no se mezcla.
    const PID = 'wl_pid_' + sala;
    const api = {
      send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); },
      connected: false,
      sala,
      pid: () => localStorage.getItem(PID),
      forget: () => localStorage.removeItem(PID),
    };
    function open() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}`);
      ws.onopen = () => {
        retry = 500; api.connected = true;
        api.send({ type: 'hello', role, sala, playerId: api.pid() || null });
        handlers.onOpen && handlers.onOpen();
      };
      ws.onmessage = ev => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'state') {
          if (msg.state.boot) {
            if (api.boot && api.boot !== msg.state.boot) { location.reload(); return; }
            api.boot = msg.state.boot;
          }
          handlers.onState(msg.state);
        }
        else if (msg.type === 'needle') handlers.onNeedle && handlers.onNeedle(msg.angle);
        else if (msg.type === 'joined') { localStorage.setItem(PID, msg.playerId); handlers.onJoined && handlers.onJoined(msg.playerId); }
        else if (msg.type === 'kicked') { api.forget(); if (msg.message) alert(msg.message); handlers.onKicked && handlers.onKicked(); }
        else if (msg.type === 'error') alert(msg.message);
      };
      ws.onclose = () => {
        api.connected = false;
        handlers.onClose && handlers.onClose();
        setTimeout(open, retry); retry = Math.min(retry * 1.6, 5000);
      };
      ws.onerror = () => ws.close();
    }
    open();
    return api;
  };

  // Fondo: cables ondulados de "teléfono de latas" que cruzan la página, con un rizo de vez en cuando
  window.addEventListener('DOMContentLoaded', () => {
    // Grano de papel: se dibuja una vez en un canvas chico y se repite como fondo
    try {
      const g = document.createElement('canvas');
      g.width = g.height = 140;
      const gx = g.getContext('2d'), img = gx.createImageData(140, 140);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = 31; img.data[i + 1] = 27; img.data[i + 2] = 23;
        img.data[i + 3] = Math.random() < 0.5 ? Math.random() * 26 : 0;
      }
      gx.putImageData(img, 0, 0);
      document.documentElement.style.backgroundImage = `url(${g.toDataURL()})`;
    } catch (e) {}

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'cables');
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('preserveAspectRatio', 'none');
    document.body.prepend(svg);
    const cable = y => {
      let d = `M -40 ${y}`, x = -40;
      while (x < 1040) {
        const paso = 140 + Math.random() * 120, dy = (Math.random() - 0.5) * 220;
        const nx = x + paso, ny = Math.max(40, Math.min(960, y + dy));
        if (Math.random() < 0.3) {
          // rizo: el cable da una vuelta sobre sí mismo
          const r = 18 + Math.random() * 14;
          d += ` C ${x + paso * 0.4} ${y}, ${nx - r} ${ny - r * 2.2}, ${nx} ${ny - r} S ${nx + r} ${ny + r}, ${nx - r * 0.6} ${ny}`;
        } else {
          d += ` S ${nx - paso * 0.5} ${ny + dy * 0.4}, ${nx} ${ny}`;
        }
        x = nx; y = ny;
      }
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', '#1f1b17');
      p.setAttribute('stroke-width', '2.2');
      p.setAttribute('vector-effect', 'non-scaling-stroke');
      p.setAttribute('stroke-linecap', 'round');
      svg.appendChild(p);
    };
    [180, 520, 860].forEach(y => cable(y + (Math.random() - 0.5) * 120));
  });
})();
