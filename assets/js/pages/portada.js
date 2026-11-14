(() => {
  "use strict";
  // Botón "i" (pantallas táctiles/angostas): abre o cierra la descripción
  const opciones = [...document.querySelectorAll("#pt .opcion")];
  const alternar = (op, abrir) => {
    op.classList.toggle("abierta", abrir);
    op.querySelector("button.info").setAttribute("aria-expanded", String(abrir));
  };
  opciones.forEach((op) => {
    op.querySelector("button.info").addEventListener("click", () =>
      alternar(op, !op.classList.contains("abierta")));
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") opciones.forEach((op) => alternar(op, false));
  });

})();
