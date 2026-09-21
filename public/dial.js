// Dial de Wavelength en SVG (compartido por pantalla y celular)
// Ángulo: 0° = extremo izquierdo, 90° = arriba, 180° = extremo derecho.
(function () {
  const CX = 500, CY = 520, R = 430;
  const NS = 'http://www.w3.org/2000/svg';

  function pt(a, r) {
    const t = (180 - a) * Math.PI / 180;
    return [CX + r * Math.cos(t), CY - r * Math.sin(t)];
  }
  function sector(a1, a2, r) {
    const [x1, y1] = pt(a1, r), [x2, y2] = pt(a2, r);
    return `M ${CX} ${CY} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
  }
  function ring(a1, a2, r1, r2) {
    const [ax, ay] = pt(a1, r2), [bx, by] = pt(a2, r2);
    const [cx2, cy2] = pt(a2, r1), [dx, dy] = pt(a1, r1);
    return `M ${ax} ${ay} A ${r2} ${r2} 0 0 1 ${bx} ${by} L ${cx2} ${cy2} A ${r1} ${r1} 0 0 0 ${dx} ${dy} Z`;
  }
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  window.createDial = function (container, opts = {}) {
    const interactive = !!opts.interactive;
    const wrap = document.createElement('div');
    wrap.className = 'dial-wrap' + (interactive ? ' interactive' : '');
    const svg = el('svg', { viewBox: '0 0 1000 600', role: 'img', 'aria-label': 'Dial' }, wrap);

    // Bandas concéntricas de la caja (decoración)
    const bandColors = ['--coral', '--salmon', '--cream', '--lime', '--green', '--sky', '--mustard'];
    const bandW = 9;
    bandColors.forEach((c, i) => {
      const r1 = R + 12 + i * bandW, r2 = r1 + bandW - 1.5;
      el('path', { d: ring(0, 180, r1, r2), fill: css(c), opacity: 0.85 }, svg);
    });

    // Rueda blanca
    el('path', { d: sector(0, 180, R), fill: '#fbfaf5' }, svg);

    // Marcas
    for (let a = 0; a <= 180; a += 5) {
      const big = a % 30 === 0, mid = a % 10 === 0;
      const len = big ? 26 : mid ? 16 : 8;
      const [x1, y1] = pt(a, R - 4), [x2, y2] = pt(a, R - 4 - len);
      el('line', { x1, y1, x2, y2, stroke: '#c9c4b3', 'stroke-width': big ? 3 : 2 }, svg);
    }

    // Objetivo (5 cuñas, dibujado centrado en 90° y rotado)
    const target = el('g', { class: 'dial-target' }, svg);
    const wedgeFills = ['--w2', '--w3', '--w4', '--w3', '--w2'];
    const wedgeLabels = ['2', '3', '4', '3', '2'];
    let wedgePaths = [], wedgeTexts = [];
    function buildTarget(w) {
      target.innerHTML = '';
      wedgePaths = []; wedgeTexts = [];
      wedgeFills.forEach((c, i) => {
        const a1 = 90 + (i - 2.5) * w, a2 = a1 + w;
        wedgePaths.push(el('path', { d: sector(a1, a2, R - 2), fill: css(c) }, target));
        const [tx, ty] = pt((a1 + a2) / 2, R - 60);
        wedgeTexts.push(el('text', {
          x: tx, y: ty, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
          'font-family': 'inherit', 'font-weight': 800, 'font-size': 30, fill: '#fff',
        }, target)).textContent = wedgeLabels[i];
      });
    }
    let wedge = opts.wedge || 7;
    buildTarget(wedge);

    // Tapa turquesa (se abre girando)
    const cover = el('g', { class: 'dial-cover' }, svg);
    el('path', { d: sector(0, 180, R - 1), fill: css('--teal') }, cover);
    el('path', { d: ring(0, 180, R - 34, R - 1), fill: 'rgba(0,0,0,.12)' }, cover);
    // "manija" de la tapa
    el('rect', { x: CX - 70, y: CY - R + 70, width: 140, height: 14, rx: 7, fill: 'rgba(255,255,255,.55)' }, cover);

    // Base y flecha
    el('rect', { x: 40, y: CY - 6, width: 920, height: 40, rx: 12, fill: css('--bg-2') }, svg);
    const needle = el('g', { class: 'dial-needle' }, svg);
    el('line', { x1: CX, y1: CY, x2: CX, y2: CY - R + 14, stroke: css('--red'), 'stroke-width': 9, 'stroke-linecap': 'round' }, needle);
    el('polygon', { points: `${CX - 14},${CY - R + 40} ${CX + 14},${CY - R + 40} ${CX},${CY - R + 2}`, fill: css('--red') }, needle);
    el('circle', { cx: CX, cy: CY, r: 52, fill: css('--red') }, svg);
    el('circle', { cx: CX, cy: CY, r: 34, fill: '#b32a21' }, svg);
    el('circle', { cx: CX - 12, cy: CY - 14, r: 9, fill: 'rgba(255,255,255,.35)' }, svg);

    // Etiquetas de la tarjeta
    const labels = document.createElement('div');
    labels.className = 'dial-labels';
    labels.innerHTML = '<div class="l"><span class="arrow">◀</span>&nbsp;<span class="txt"></span></div><div class="r"><span class="txt"></span>&nbsp;<span class="arrow">▶</span></div>';
    wrap.appendChild(labels);
    container.appendChild(wrap);

    const state = { needle: 90, target: null, covered: true, left: '', right: '' };

    function render() {
      needle.style.transform = `rotate(${state.needle - 90}deg)`;
      if (state.target == null) {
        target.style.display = 'none';
      } else {
        target.style.display = '';
        target.style.transform = `rotate(${state.target - 90}deg)`;
      }
      cover.classList.toggle('open', !state.covered);
      labels.querySelector('.l .txt').textContent = state.left || '';
      labels.querySelector('.r .txt').textContent = state.right || '';
    }

    // Interacción táctil / mouse
    if (interactive) {
      let dragging = false;
      const angleFromEvent = e => {
        const rect = svg.getBoundingClientRect();
        const sx = 1000 / rect.width, sy = 600 / rect.height;
        const x = (e.clientX - rect.left) * sx, y = (e.clientY - rect.top) * sy;
        const dx = x - CX, dy = CY - y;
        let a = 180 - Math.atan2(Math.max(dy, 0.001), dx) * 180 / Math.PI;
        return Math.max(0, Math.min(180, a));
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
