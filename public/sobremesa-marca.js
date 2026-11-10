// Sello "Creado por Sobremesa" en chico, fijo en una esquina de todas las pantallas del juego.
// Original: Juegos interactivos\sobremesa-marca.js. Cada juego lleva una copia junto a sus páginas
// (se publica por separado); si cambias el original, vuelve a copiarlo a todos.
//
// Uso: <script src="sobremesa-marca.js" data-lugar="abajo-der"></script>
//   data-lugar: abajo-der (por defecto) | abajo-izq | arriba-der | arriba-izq
//   data-tono:  oscuro (pastilla oscura, para fondos de color; por defecto) | claro (pastilla clara)
// El logo es "El abrazo" de la plataforma (Plataforma\manos.js), en la fuente Bowlby One.
(function () {
  const yo = document.currentScript;
  const lugar = (yo && yo.dataset.lugar) || "abajo-der";
  const claro = yo && yo.dataset.tono === "claro";

  const LOGO = `<svg viewBox="60 96 520 290" role="img" aria-label="Sobremesa">
  <g fill="none" stroke="currentColor" stroke-width="30" stroke-linecap="round" stroke-linejoin="round">
    <path d="M92 340 V168 Q92 132 128 132 H498"/><path d="M548 138 V310 Q548 346 512 346 H146"/>
  </g>
  <g stroke="currentColor" stroke-width="12" stroke-linecap="round" fill="none">
    <path d="M500 136 q8 22 2 40"/><path d="M510 134 q14 20 14 40"/><path d="M518 128 q20 12 26 32"/><path d="M506 124 q16 -10 24 -24"/>
    <path d="M144 342 q-8 -22 -2 -40"/><path d="M134 344 q-14 -20 -14 -40"/><path d="M126 350 q-20 -12 -26 -32"/><path d="M138 354 q-16 10 -24 24"/>
  </g>
  <text transform="translate(-3,-16)" x="138" font-family="Bowlby One" fill="currentColor" textLength="370" lengthAdjust="spacingAndGlyphs"><tspan y="296" font-size="118">S</tspan><tspan y="276" font-size="82">o</tspan><tspan y="300" font-size="104">B</tspan><tspan y="282" font-size="92">R</tspan><tspan y="298" font-size="112">E</tspan><tspan y="286" font-size="94">M</tspan><tspan y="270" font-size="78">e</tspan><tspan y="300" font-size="108">S</tspan><tspan y="284" font-size="98">A</tspan></text>
</svg>`;

  if (!document.querySelector('link[href*="Bowlby+One"]')) {
    const f = document.createElement("link");
    f.rel = "stylesheet";
    f.href = "https://fonts.googleapis.com/css2?family=Bowlby+One&display=swap";
    document.head.appendChild(f);
  }

  const [v, h] = lugar.split("-");
  const css = document.createElement("style");
  css.textContent = `
  #sobremesa-marca { position: fixed; ${v === "arriba" ? "top" : "bottom"}: 10px; ${h === "izq" ? "left" : "right"}: 12px; z-index: 2147483000;
    display: flex; align-items: center; gap: 6px; padding: 4px 10px 4px 9px; border-radius: 999px; pointer-events: none; user-select: none;
    font: 600 10px/1 system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: .04em; text-transform: uppercase;
    background: ${claro ? "rgba(255,255,255,.72)" : "rgba(0,0,0,.42)"}; color: ${claro ? "#1d1d1d" : "#fff"}; opacity: .82; }
  #sobremesa-marca svg { height: 26px; width: auto; display: block; }
  @media (min-width: 1200px) { #sobremesa-marca { font-size: 12px; padding: 5px 12px 5px 11px; } #sobremesa-marca svg { height: 34px; } }
  @media print { #sobremesa-marca { display: none; } }`;
  document.head.appendChild(css);

  const poner = () => {
    if (document.getElementById("sobremesa-marca")) return;
    const el = document.createElement("div");
    el.id = "sobremesa-marca";
    el.innerHTML = `<span>Creado por</span>${LOGO}`;
    document.body.appendChild(el);
  };
  if (document.body) poner(); else document.addEventListener("DOMContentLoaded", poner);
})();
