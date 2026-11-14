// Medición de texto con canvas, para disponer etiquetas y palabras en gráficos SVG.
window.OLT = window.OLT || {};
OLT.medir = (() => {
  "use strict";
  const cx = document.createElement("canvas").getContext?.("2d") ?? null;
  // peso: "" (normal), "600", "bold"... Sin canvas se estima por número de caracteres.
  const ancho = (txt, px = 12, peso = "") => {
    if (!cx) return String(txt).length * px * 0.58;
    cx.font = `${peso ? peso + " " : ""}${px}px "Ubuntu", system-ui, sans-serif`;
    return cx.measureText(txt).width;
  };
  return { ancho };
})();
