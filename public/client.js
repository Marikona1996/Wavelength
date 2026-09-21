// Conexión WebSocket compartida + fondo de estrellas
(function () {
  window.connectGame = function (role, handlers) {
    let ws, retry = 500;
    const api = {
      send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); },
      connected: false,
    };
    function open() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}`);
      ws.onopen = () => {
        retry = 500; api.connected = true;
        api.send({ type: 'hello', role, playerId: localStorage.getItem('wl_pid') || null });
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
        else if (msg.type === 'joined') { localStorage.setItem('wl_pid', msg.playerId); handlers.onJoined && handlers.onJoined(msg.playerId); }
        else if (msg.type === 'kicked') { localStorage.removeItem('wl_pid'); handlers.onKicked && handlers.onKicked(); }
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

  // Estrellas como en la caja / el sitio
  window.addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('canvas');
    c.className = 'stars';
    document.body.prepend(c);
    const ctx = c.getContext('2d');
    let stars = [];
    function size() {
      c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
      const n = Math.floor((innerWidth * innerHeight) / 6000);
      stars = Array.from({ length: n }, () => ({
        x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.3, a: Math.random(), s: Math.random() * 0.02 + 0.004,
      }));
    }
    function draw() {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const s of stars) {
        s.a += s.s; const tw = 0.45 + 0.55 * Math.abs(Math.sin(s.a));
        ctx.globalAlpha = tw;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s.x * c.width, s.y * c.height, s.r * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
      }
      requestAnimationFrame(draw);
    }
    size(); addEventListener('resize', size); draw();
  });
})();
