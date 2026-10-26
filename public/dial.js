// Dial de Sintonizados en SVG (compartido por pantalla y celular): una línea recta.
// La posición sigue midiéndose de 0 (extremo izquierdo) a 180 (extremo derecho),
// igual que el servidor; aquí solo se dibuja sobre una barra horizontal tipo píldora.
(function () {
  // En celular (pantalla angosta) la barra es más alta y ocupa casi todo el ancho
  const CEL = window.matchMedia('(max-width: 600px)').matches;
  const X0 = CEL ? 40 : 80, X1 = 1000 - X0, W = X1 - X0;   // barra
  const Y0 = CEL ? 64 : 58, Y1 = CEL ? 200 : 150, H = Y1 - Y0, YC = (Y0 + Y1) / 2, R = H / 2;
  const ALTO = CEL ? 290 : 232, LETRA = CEL ? 30 : 15, NUM = CEL ? 34 : 22;
  const IN = 7;                                     // margen interior (objetivo y tapa)
  const TINTE = R + 12;                             // franja de color de cada extremo
  const NS = 'http://www.w3.org/2000/svg';
  const xDe = a => X0 + (a / 180) * W;
  const porGrado = W / 180;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  let uid = 0;

  window.createDial = function (container, opts = {}) {
    const interactive = !!opts.interactive;
    const wrap = document.createElement('div');
    wrap.className = 'dial-wrap' + (interactive ? ' interactive' : '');
    const svg = el('svg', { viewBox: `0 0 1000 ${ALTO}`, role: 'img', 'aria-label': 'Dial' }, wrap);
    const ink = css('--ink');
    const id = ++uid;

    const defs = el('defs', {}, svg);
    el('rect', { x: X0, y: Y0, width: W, height: H, rx: R }, el('clipPath', { id: 'barra-' + id }, defs));
    el('rect', { x: X0 + IN, y: Y0 + IN, width: W - 2 * IN, height: H - 2 * IN, rx: R - IN }, el('clipPath', { id: 'dentro-' + id }, defs));

    // Cablecitos que salen de cada extremo (el "teléfono de latas")
    const cable = (x, dir) => el('path', {
      d: `M ${x} ${YC} c ${dir * 18} 0, ${dir * 22} -26, ${dir * 34} -18 s ${dir * 2} 30, ${dir * 18} 22`,
      fill: 'none', stroke: ink, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.55,
    }, svg);
    if (!CEL) { cable(X0, -1); cable(X1, 1); }  // en celular no hay espacio a los lados

    // Barra
    el('rect', { x: X0, y: Y0, width: W, height: H, rx: R, fill: css('--paper') }, svg);
    const barra = el('g', { 'clip-path': `url(#barra-${id})` }, svg);
    // extremos teñidos con su color
    el('rect', { x: X0, y: Y0, width: TINTE, height: H, fill: css('--extremo-izq') }, barra);
    el('rect', { x: X1 - TINTE, y: Y0, width: TINTE, height: H, fill: css('--extremo-der') }, barra);
    el('line', { x1: X0 + TINTE, y1: Y0, x2: X0 + TINTE, y2: Y1, stroke: ink, 'stroke-width': 1.5, opacity: 0.35 }, barra);
    el('line', { x1: X1 - TINTE, y1: Y0, x2: X1 - TINTE, y2: Y1, stroke: ink, 'stroke-width': 1.5, opacity: 0.35 }, barra);
    // rayitas finas de regla
    for (let a = 10; a < 180; a += 10) {
      const media = a % 30 === 0;
      el('line', { x1: xDe(a), y1: Y1 - (media ? 16 : 9), x2: xDe(a), y2: Y1, stroke: ink, 'stroke-width': 1.5, opacity: media ? 0.35 : 0.18 }, barra);
    }
    // centro
    el('line', { x1: xDe(90), y1: Y0, x2: xDe(90), y2: Y1, stroke: ink, 'stroke-width': 1.5, 'stroke-dasharray': '5 6', opacity: 0.4 }, barra);

    // Objetivo: 5 cuñas (2-3-4-3-2) dentro de la barra, con separadores finos
    const dentro = el('g', { 'clip-path': `url(#dentro-${id})` }, svg);
    const target = el('g', { class: 'dial-target' }, dentro);
    const wedgeFills = ['--w2', '--w3', '--w4', '--w3', '--w2'];
    const wedgeLabels = ['2', '3', '4', '3', '2'];
    function buildTarget(w) {
      target.innerHTML = '';
      const ancho = w * porGrado, total = ancho * 5;
      const grupo = el('g', {}, target);
      wedgeFills.forEach((c, i) => {
        const x = -total / 2 + i * ancho;
        el('rect', { x, y: Y0 + IN, width: ancho, height: H - 2 * IN, fill: css(c) }, grupo);
        if (i) el('line', { x1: x, y1: Y0 + IN, x2: x, y2: Y1 - IN, stroke: css('--paper'), 'stroke-width': 2 }, grupo);
        el('text', {
          x: x + ancho / 2, y: YC, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-family': 'inherit', 'font-weight': 800, 'font-size': NUM, fill: i === 2 ? '#fff' : ink,
        }, grupo).textContent = wedgeLabels[i];
      });
      el('rect', { x: -total / 2, y: Y0 + IN, width: total, height: H - 2 * IN, rx: 10, fill: 'none', stroke: ink, 'stroke-width': 2 }, grupo);
    }
    let wedge = opts.wedge || 7;
    buildTarget(wedge);

    // Tapa: se levanta al revelar
    const cover = el('g', { class: 'dial-cover' }, svg);
    el('rect', { x: X0 + TINTE + 4, y: Y0 + IN, width: W - 2 * TINTE - 8, height: H - 2 * IN, rx: R - IN, fill: css('--cover') }, cover);
    el('path', {
      d: `M ${X0 + 60} ${YC + 6} C ${X0 + 170} ${Y0 + 10}, ${X0 + 260} ${Y1 - 12}, ${X0 + 350} ${YC - 4}
          S ${X0 + 440} ${Y0 + 14}, ${X0 + 420} ${YC - 18} S ${X0 + 480} ${Y1 - 18}, ${X0 + 560} ${YC + 2}
          S ${X0 + 690} ${Y0 + 16}, ${X1 - 60} ${YC + 4}`,
      fill: 'none', stroke: '#fff', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0.75,
    }, cover);
    el('circle', { cx: X0 + W / 2, cy: YC, r: CEL ? 34 : 22, fill: css('--paper'), stroke: ink, 'stroke-width': 2 }, cover);
    el('text', {
      x: X0 + W / 2, y: YC + 1, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-family': 'inherit', 'font-weight': 800, 'font-size': CEL ? 40 : 26, fill: ink,
    }, cover).textContent = '?';

    // Contorno de la barra
    el('rect', { x: X0, y: Y0, width: W, height: H, rx: R, fill: 'none', stroke: ink, 'stroke-width': 2.5 }, svg);

    // Escala debajo: extremo – centro – extremo
    const rotulo = (x, anchor, txt) => el('text', {
      x, y: Y1 + (CEL ? 78 : 50), 'text-anchor': anchor, 'font-family': 'inherit', 'font-weight': 700, 'font-size': LETRA,
      'letter-spacing': 2.5, fill: ink, opacity: 0.55,
    }, svg).textContent = txt;
    rotulo(X0 + 8, 'start', 'EXTREMO');
    rotulo(xDe(90), 'middle', 'CENTRO');
    rotulo(X1 - 8, 'end', 'EXTREMO');
    el('path', { d: `M ${xDe(90) - 7} ${Y0 - 13} L ${xDe(90) + 7} ${Y0 - 13} L ${xDe(90)} ${Y0 - 4} Z`, fill: ink, opacity: 0.55 }, svg);

    // Flecha: línea delgada con punta arriba y perilla abajo (de ahí se agarra)
    const needle = el('g', { class: 'dial-needle' }, svg);
    el('line', { x1: 0, y1: Y0 - 22, x2: 0, y2: Y1 + 12, stroke: ink, 'stroke-width': CEL ? 6 : 4, 'stroke-linecap': 'round' }, needle);
    el('path', { d: `M -11 ${Y0 - 36} L 11 ${Y0 - 36} L 0 ${Y0 - 18} Z`, fill: css('--tomato'), stroke: ink, 'stroke-width': 2, 'stroke-linejoin': 'round' }, needle);
    el('circle', { cx: 0, cy: Y1 + 26, r: CEL ? 24 : 16, fill: css('--tomato'), stroke: ink, 'stroke-width': 2.5 }, needle);
    el('circle', { cx: -5, cy: Y1 + 21, r: 4, fill: 'rgba(255,255,255,.65)' }, needle);

    // Etiquetas de la tarjeta: una por extremo, con el color de su extremo
    const labels = document.createElement('div');
    labels.className = 'dial-labels';
    labels.innerHTML = '<div class="l"><span class="txt"></span></div><div class="r"><span class="txt"></span></div>';
    wrap.appendChild(labels);
    container.appendChild(wrap);

    const state = { needle: 90, target: null, covered: true, left: '', right: '' };

    function render() {
      needle.style.transform = `translateX(${xDe(state.needle)}px)`;
      if (state.target == null) {
        target.style.display = 'none';
      } else {
        target.style.display = '';
        target.style.transform = `translateX(${xDe(state.target)}px)`;
      }
      cover.classList.toggle('open', !state.covered);
      labels.querySelector('.l .txt').textContent = state.left || '';
      labels.querySelector('.r .txt').textContent = state.right || '';
      labels.classList.toggle('hidden', !state.left && !state.right);
    }

    // Interacción táctil / mouse: solo importa la posición horizontal
    if (interactive) {
      let dragging = false;
      const angleFromEvent = e => {
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (1000 / rect.width);
        return Math.max(0, Math.min(180, (x - X0) / W * 180));
      };
      const move = e => {
        if (!dragging) return;
        state.needle = Math.round(angleFromEvent(e) * 10) / 10;
        render();
        opts.onChange && opts.onChange(state.needle);
      };
      svg.addEventListener('pointerdown', e => {
        dragging = true; wrap.classList.add('dragging');
        svg.setPointerCapture(e.pointerId);
        move(e);
      });
      svg.addEventListener('pointermove', move);
      const up = () => { dragging = false; wrap.classList.remove('dragging'); opts.onEnd && opts.onEnd(state.needle); };
      svg.addEventListener('pointerup', up);
      svg.addEventListener('pointercancel', up);
    }

    render();
    return {
      el: wrap,
      set(patch) {
        if (patch.wedge && patch.wedge !== wedge) { wedge = patch.wedge; buildTarget(wedge); }
        Object.assign(state, patch);
        render();
      },
      get: () => ({ ...state }),
    };
  };
})();
