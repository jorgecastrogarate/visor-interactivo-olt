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
  // Divide un texto en líneas de a lo más `max` píxeles; medirFn(texto) devuelve el ancho de un texto.
  const envolver = (texto, max, medirFn) => {
    const lineas = [];
    let actual = "";
    for (const palabra of texto.split(" ")) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (actual && medirFn(prueba) > max) { lineas.push(actual); actual = palabra; } else actual = prueba;
    }
    if (actual) lineas.push(actual);
    return lineas;
  };
  return { ancho, envolver };
})();
