// Dial de Sintonizados en SVG (compartido por pantalla y celular): una escala de radio.
// La posición sigue midiéndose de 0 (extremo izquierdo) a 180 (extremo derecho),
// igual que el servidor. Arriba van las marcas y las frecuencias (solo decoración);
// abajo, la franja de la señal donde vive el objetivo, tapada con una persiana de madera.
(function () {
  // En celular (pantalla angosta) todo es más grande y hay menos marcas
  const CEL = window.matchMedia('(max-width: 600px)').matches;
  const VW = CEL ? 600 : 1000;                       // ancho del dibujo (en celular, más angosto = todo más grande)
  const K = CEL ? 1.4 : 1;                           // escala de letras y trazos
  const P = CEL ? 36 : 60;                           // margen de la escala dentro del vidrio
  const X0 = P, X1 = VW - P, W = X1 - X0;
  const Y0 = CEL ? 22 : 20, BH = CEL ? 222 : 200;    // caja de la radio
  const ALTO = Y0 + BH + 10;
  const FY = Y0 + (CEL ? 122 : 100), FH = Y0 + BH - 22 - FY;  // franja de la señal
  const NUM = 30 * K;                                // número de cada cuña
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
    const svg = el('svg', { viewBox: `0 0 ${VW} ${ALTO}`, role: 'img', 'aria-label': 'Dial' }, wrap);
    const ink = css('--ink'), mostaza = css('--mustard'), papel = css('--bg');
    const id = ++uid;

    const defs = el('defs', {}, svg);
    el('rect', { x: 24, y: FY, width: VW - 48, height: FH, rx: 8 }, el('clipPath', { id: 'franja-' + id }, defs));

    // Caja y vidrio
    el('rect', { x: 0, y: Y0, width: VW, height: BH, rx: 20, fill: ink }, svg);
    el('rect', { x: 12, y: Y0 + 12, width: VW - 24, height: BH - 24, rx: 12, fill: css('--glass') }, svg);

    // Marcas y frecuencias
    const n = CEL ? 20 : 40, fuerte = CEL ? 10 : 8, medio = CEL ? 5 : 4;
    for (let i = 0; i <= n; i++) {
      const a = i / n * 180, esF = i % fuerte === 0, esM = i % medio === 0;
      const largo = (esF ? 30 : esM ? 21 : 13) * K;
      el('line', { x1: xDe(a), y1: Y0 + 22, x2: xDe(a), y2: Y0 + 22 + largo, stroke: mostaza, 'stroke-width': (esF ? 3 : 1.6) * (CEL ? 1.3 : 1), opacity: esF ? 1 : 0.6 }, svg);
      if (esF) el('text', {
        x: xDe(a), y: Y0 + 22 + 30 * K + 22 * K, 'text-anchor': 'middle', class: 'dial-freq',
        'font-size': 16 * K, fill: papel, opacity: 0.85,
      }, svg).textContent = Math.round(88 + a / 180 * 20);
    }
    // Centro: triangulito arriba (el rótulo "CENTRO" va abajo, entre los extremos)
    el('path', { d: `M ${xDe(90) - 9 * K} ${Y0 + 8} L ${xDe(90) + 9 * K} ${Y0 + 8} L ${xDe(90)} ${Y0 + 8 + 12 * K} Z`, fill: mostaza }, svg);

    // Franja de la señal
    el('rect', { x: 24, y: FY, width: VW - 48, height: FH, rx: 8, fill: css('--strip') }, svg);
    const franja = el('g', { 'clip-path': `url(#franja-${id})` }, svg);
    el('line', { x1: xDe(90), y1: FY, x2: xDe(90), y2: FY + FH, stroke: papel, 'stroke-width': 1.5, 'stroke-dasharray': '4 5', opacity: 0.35 }, franja);

    // Objetivo: 5 cuñas (2-3-4-3-2)
    const target = el('g', { class: 'dial-target' }, franja);
    const wedgeFills = ['--w2', '--w3', '--w4', '--w3', '--w2'];
    const wedgeLabels = ['2', '3', '4', '3', '2'];
    function buildTarget(w) {
      target.innerHTML = '';
      const ancho = w * porGrado, total = ancho * 5;
      wedgeFills.forEach((c, i) => {
        const x = -total / 2 + i * ancho;
        el('rect', { x, y: FY, width: ancho, height: FH, fill: css(c), stroke: ink, 'stroke-width': 2, class: i === 2 ? 'cuna4' : '' }, target);
        if (ancho >= NUM * 0.8) el('text', {
          x: x + ancho / 2, y: FY + FH / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-family': 'Fraunces, Georgia, serif', 'font-style': 'italic', 'font-weight': 900, 'font-size': NUM,
          fill: i === 2 ? '#fff8ea' : ink,
        }, target).textContent = wedgeLabels[i];
      });
    }
    let wedge = opts.wedge || 7;
    buildTarget(wedge);

    // Estática que aparece un instante al sintonizar (revelar)
    if (window.ruidoRadio) el('image', { href: window.ruidoRadio(), x: 24, y: FY, width: VW - 48, height: FH, preserveAspectRatio: 'none', class: 'dial-static' }, franja);

    // Tapa: persiana de madera con el letrero "SEÑAL OCULTA"; baja al revelar
    const cover = el('g', { class: 'dial-cover' }, franja);
    cover.style.setProperty('--baja', (FH + 12) + 'px');
    el('rect', { x: 24, y: FY, width: VW - 48, height: FH, fill: css('--wood') }, cover);
    for (let y = FY + 8; y < FY + FH; y += 9) el('line', { x1: 24, y1: y, x2: VW - 24, y2: y, stroke: css('--wood-2'), 'stroke-width': 2.5 }, cover);
    const tw = 190 * K, th = 30 * K;
    el('rect', { x: VW / 2 - tw / 2, y: FY + FH / 2 - th / 2, width: tw, height: th, rx: th / 2, fill: ink }, cover);
    el('text', {
      x: VW / 2, y: FY + FH / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'dial-freq',
      'font-size': 14 * K, 'letter-spacing': 2, fill: mostaza,
    }, cover).textContent = 'SEÑAL OCULTA';

    // Aguja: línea tomate con perilla arriba
    const needle = el('g', { class: 'dial-needle' }, svg);
    el('line', { x1: 0, y1: Y0 - 4, x2: 0, y2: Y0 + BH + 4, stroke: ink, 'stroke-width': 10 * (CEL ? 1.3 : 1), 'stroke-linecap': 'round', opacity: 0.55 }, needle);
    el('line', { x1: 0, y1: Y0 - 4, x2: 0, y2: Y0 + BH + 4, stroke: css('--tomato'), 'stroke-width': 6 * (CEL ? 1.3 : 1), 'stroke-linecap': 'round' }, needle);
    el('circle', { cx: 0, cy: Y0 - 4, r: 11 * K, fill: css('--tomato'), stroke: ink, 'stroke-width': 3 }, needle);

    // Etiquetas de la tarjeta: una por extremo
    const labels = document.createElement('div');
    labels.className = 'dial-labels';
    labels.innerHTML = '<div class="l"><span class="txt"></span></div><span class="c">CENTRO</span><div class="r"><span class="txt"></span></div>';
    wrap.appendChild(labels);
    container.appendChild(wrap);

    const state = { needle: 90, target: null, covered: true, left: '', right: '' };
    let tapadoAntes = true, sintTimer;

    function render() {
      needle.style.transform = `translateX(${xDe(state.needle)}px)`;
      if (state.target == null) {
        target.style.display = 'none';
      } else {
        target.style.display = '';
        target.style.transform = `translateX(${xDe(state.target)}px)`;
      }
      cover.classList.toggle('open', !state.covered);
      // Al destapar: estática, aguja que tiembla y la cuña de 4 que brilla
      if (tapadoAntes && !state.covered && state.target != null) {
        wrap.classList.add('sintonizando', 'revelado');
        clearTimeout(sintTimer);
        sintTimer = setTimeout(() => wrap.classList.remove('sintonizando'), 1300);
      }
      if (state.covered) wrap.classList.remove('revelado');
      tapadoAntes = state.covered;
      labels.querySelector('.l .txt').textContent = state.left || '';
      labels.querySelector('.r .txt').textContent = state.right || '';
      labels.classList.toggle('hidden', !state.left && !state.right);
    }

    // Interacción táctil / mouse: solo importa la posición horizontal
    if (interactive) {
      let dragging = false;
      const angleFromEvent = e => {
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (VW / rect.width);
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
