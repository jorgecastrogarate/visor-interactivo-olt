// Utilidades comunes. Scripts clásicos: todo cuelga del espacio de nombres global OLT.
window.OLT = window.OLT || {};
OLT.util = (() => {
  "use strict";
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  // Escapa texto para insertarlo en HTML (atributos entre comillas simples o dobles incluidos)
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
  const $ = (id) => document.getElementById(id);
  return { esc, $ };
})();
