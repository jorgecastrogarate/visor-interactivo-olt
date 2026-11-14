// Estado de la página en location.hash (p. ej. #t_des o #4110).
window.OLT = window.OLT || {};
OLT.hash = (() => {
  "use strict";
  const get = () => location.hash.slice(1);
  // push = false reemplaza la entrada actual del historial; push = true añade una (solo si el valor cambia)
  const set = (valor, { push = false } = {}) => {
    if (push) { if (get() !== valor) history.pushState(null, "", "#" + valor); }
    else history.replaceState(null, "", "#" + valor);
  };
  // El callback recibe el nuevo valor del hash (sin "#")
  const onChange = (fn) => window.addEventListener("hashchange", () => fn(get()));
  return { get, set, onChange };
})();
