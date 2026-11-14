(() => {
  "use strict";

  /* ---------- Configuración (edita aquí) ---------- */
  // Nombre legible de cada indicador; los que no estén aquí se muestran con su código.
  const NOMBRES = {
    ft: "Fuerza de trabajo",
    fft: "Fuera de la fuerza de trabajo",
    oc: "Ocupados",
    des: "Desocupados",
    t_par: "Tasa de participación",
    t_oc: "Tasa de ocupación",
    t_des: "Tasa de desocupación",
    t_oi: "Tasa de ocupación informal",
    t_osi: "Tasa de ocupación sector informal",
    t_pj: "Tasa de ocupación población joven (15-29 años)",
    t_pej: "Tasa de ocupación población en edad de jubilar",
    t_ehc: "Tasa de ocupación población con enseñanza media (H-C)",
    t_emtp: "Tasa de ocupación población con enseñanza media (T-P)", 
    t_tns: "Tasa de ocupación población con técnico de nivel superior",
    t_pro: "Tasa de ocupación población con grado universitario y superior"  
  };
  // Color de cada serie (categoria)
  const COLORES = { Total: "#1C2E5E", Hombres: "#41D8CF", Mujeres: "#4142D9" };
  const COLOR_OTRO = "#6b5b95";
  const ORDEN_SERIES = ["Total", "Hombres", "Mujeres"];
  const ORDEN_TERR = ["tarapaca", "nacional"];
  const ORDEN_IND = ["ft", "oc", "des", "fft", "t_par", "t_oc", "t_des", "t_oi", "t_osi", "t_pj", "t_pej", "t_ehc", "t_emtp","t_tns","t_pro"];
  // Filtros de período, en meses hacia atrás desde el último dato
  const PERIODOS = [
    { id: "12", meses: 12, etq: "1 año" },
    { id: "24", meses: 24, etq: "2 años" },
    { id: "60", meses: 60, etq: "5 años" },
    { id: "todo", meses: Infinity, etq: "Serie completa" }
  ];
  const PERIODO_INICIAL = "60";
  // Pie de la imagen PNG (abajo a la derecha)
  const FUENTE_IMAGEN = "Fuente: Encuesta Nacional de Empleo (ENE), INE. Elaborado por el Observatorio Laboral de Tarapacá.";
  const LAG_TRIMESTRE = 1;   // "trimestre móvil anterior": el mes anterior
  const LAG_ANIO = 12;       // "año anterior": 12 meses antes

  // Frecuencia de etiquetas y de valores, en trimestres móviles (cada punto de la serie es uno; 12 = 1 año)
  const PASOS = [["auto", "Automática"], [1, "Cada trimestre"], [2, "Cada 2 trimestres"], [3, "Cada 3 trimestres"], [4, "Cada 4 trimestres"],
                 [6, "Cada 6 trimestres"], [12, "Cada 1 año"], [24, "Cada 2 años"], [36, "Cada 3 años"], [60, "Cada 5 años"]];
  // Valores por defecto de la personalización (el botón «Restablecer» vuelve a ellos)
  const PERS0 = { paso: "auto", ancla: "fin", vals: "no", titulo: "" };

  /* ---------- Utilidades ---------- */
  const { $, esc } = OLT.util;
  const nf0 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nfEje = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
  const esTasa = (ind) => ind.startsWith("t_");
  const nombreInd = (ind) => NOMBRES[ind] ?? ind;
  const colorDe = (cat) => COLORES[cat] ?? COLOR_OTRO;
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const idxDe = (f) => Number(f.slice(0, 4)) * 12 + (Number(f.slice(5, 7)) - 1);
  // Trimestre móvil a partir del mes central (idx = año*12 + mes0)
  const etiqueta = (idx) => {
    const y = Math.floor(idx / 12), m = idx % 12;
    return `${MESES[(m + 11) % 12]}-${MESES[(m + 1) % 12]} ${y + (m === 11 ? 1 : 0)}`;
  };
  const ym = (i) => `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, "0")}`;
  const etqLineas = (i) => etiqueta(i).split(" ");   // ["ene-mar", "2024"]
  const anchoTxt = (t, px = 12) => OLT.medir.ancho(t, px);
  const ordenar = (lista, orden) => [...lista].sort((a, b) => {
    const ia = orden.indexOf(a), ib = orden.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b, "es");
  });

  /* ---------- Datos ---------- */
  let crudo = [];
  try { crudo = JSON.parse($("d-ene").textContent); } catch (e) { console.error("JSON inválido", e); }

  // datos: indicador -> territorio -> { nombre, cats: categoria -> Map(idx -> {v, flag, periodo}) }
  const datos = new Map();
  for (const r of crudo) {
    if (!datos.has(r.indicador)) datos.set(r.indicador, new Map());
    const porT = datos.get(r.indicador);
    if (!porT.has(r.territorio)) porT.set(r.territorio, { nombre: r.territorio_nombre || r.territorio, cats: new Map() });
    const t = porT.get(r.territorio);
    if (!t.cats.has(r.categoria)) t.cats.set(r.categoria, new Map());
    t.cats.get(r.categoria).set(idxDe(r.fecha), {
      v: r.estimacion ?? null, flag: r.flag ?? null, periodo: r.periodo
    });
  }
  const nombreTerr = new Map();
  for (const porT of datos.values()) for (const [k, t] of porT) nombreTerr.set(k, t.nombre);
  const territorios = ordenar(nombreTerr.keys(), ORDEN_TERR);
  const indicadores = ordenar(datos.keys(), ORDEN_IND);

  /* ---------- Referencias y estado ---------- */
  const elInd = $("ene-ind"), elTerr = $("ene-terr"), elPer = $("ene-per"), elD0 = $("ene-d0"), elD1 = $("ene-d1"), elComp = $("ene-comp");
  const elTitulo = $("ene-titulo"), elSub = $("ene-sub"), elLey = $("ene-ley");
  const elGraf = $("ene-graf"), elPista = $("ene-pista"), elLive = $("ene-live"), elTabla = $("ene-tabla");
  const btnXlsx = $("ene-xlsx"), btnPng = $("ene-png");

  if (!indicadores.length) {
    $("ene").querySelector(".panel").innerHTML =
      `<p class="aviso">No se encontraron datos. Revisa que exista data/json/ene_indicadores.json y vuelve a renderizar el documento.</p>`;
    return;
  }

  const TERR_NAC = "nacional";   // código del territorio contra el que se compara
  const state = { comp: false, ind: null, terr: null, per: PERIODO_INICIAL, d0: null, d1: null, ...PERS0, ocultas: new Set(), cur: null };
  let geo = null;   // geometría del gráfico vigente
  let tip = null, cursorG = null, svgEl = null;

  /* ---------- Formato de valores y diferencias ---------- */
  const signo = (n) => (n > 0 ? "+" : n < 0 ? "\u2212" : "");
  function fmtValor(v, tasa) {
    if (v == null) return "s/d";
    return tasa ? `${nf1.format(v * 100)}%` : nf0.format(v);
  }
  // Devuelve {txt, sub}: diferencia absoluta (pp para tasas) y, para conteos, variación relativa
  function fmtDif(v, previo, tasa) {
    if (v == null || previo == null) return null;
    if (tasa) {
      const r = Math.round((v - previo) * 1000) / 10;      // puntos porcentuales, 1 decimal
      return { txt: r === 0 ? "0,0 pp" : `${signo(r)}${nf1.format(Math.abs(r))} pp`, sub: "" };
    }
    const d = Math.round(v - previo);
    const txt = d === 0 ? "0" : `${signo(d)}${nf0.format(Math.abs(d))}`;
    let sub = "";
    if (previo !== 0) {
      const p = Math.round(((v - previo) / Math.abs(previo)) * 1000) / 10;
      sub = p === 0 ? "0,0%" : `${signo(p)}${nf1.format(Math.abs(p))}%`;
    }
    return { txt, sub };
  }

  /* ---------- Contexto del gráfico ---------- */
  function contexto() {
    const t = datos.get(state.ind)?.get(state.terr);
    if (!t) return null;
    const cats = ordenar(t.cats.keys(), ORDEN_SERIES);
    let min = Infinity, max = -Infinity;
    for (const m of t.cats.values()) for (const i of m.keys()) { if (i < min) min = i; if (i > max) max = i; }
    const p = PERIODOS.find((x) => x.id === state.per);   // sin coincidencia = rango personalizado (Desde/Hasta)
    let i1 = max, i0 = Math.max(min, max - (p ? p.meses : Infinity));
    if (!p) {
      i0 = Math.min(max, Math.max(min, state.d0 ?? min)); i1 = Math.min(max, Math.max(min, state.d1 ?? max));
      if (i0 > i1) [i0, i1] = [i1, i0];
    }
    // Comparación: mismo indicador a nivel nacional (solo si se está viendo otra región)
    const tn = state.comp && state.terr !== TERR_NAC ? datos.get(state.ind)?.get(TERR_NAC) ?? null : null;
    const visibles = cats.filter((c) => !state.ocultas.has(c));
    return { t, tn, cats, visibles, visN: tn ? visibles.filter((k) => tn.cats.has(k)) : [], i0, i1, min, max, tasa: esTasa(state.ind) };
  }

  /* ---------- Escala y ejes ---------- */
  function ticksNice(min, max, n = 5) {
    if (min === max) { const d = Math.abs(min) * 0.05 || 1; min -= d; max += d; }
    const p0 = (max - min) / n, mag = Math.pow(10, Math.floor(Math.log10(p0))), fr = p0 / mag;
    const paso = (fr < 1.5 ? 1 : fr < 3 ? 2 : fr < 7 ? 5 : 10) * mag;
    const ini = Math.floor(min / paso + 1e-9) * paso, fin = Math.ceil(max / paso - 1e-9) * paso;
    const t = [];
    for (let v = ini; v <= fin + paso / 2; v += paso) t.push(Number(v.toFixed(10)));
    return t;
  }
  function ticksX(i0, i1, ancho) {
    let paso = Number(state.paso);
    if (!paso) {   // automática: según el ancho de las etiquetas
      const maxT = Math.max(2, Math.floor(ancho / (anchoTxt(etqLineas(i1)[0]) + 28)));
      paso = [1, 3, 6, 12, 24, 36, 60, 120].find((p) => Math.floor((i1 - i0) / p) + 1 <= maxT) ?? 120;
    }
    const t = [];
    if (state.ancla === "ini") for (let i = i0; i <= i1; i += paso) t.push(i);
    else for (let i = i1; i >= i0; i -= paso) t.unshift(i);
    return { t, paso };
  }

  /* ---------- Dibujo ---------- */
  // Puntos de las series visibles dentro del período elegido
  function prepararSeries(c) {
    const armar = (cat, t, nac) => {
      const mapa = t.cats.get(cat), pts = [];
      for (let i = c.i0; i <= c.i1; i++) {
        const r = mapa.get(i);
        if (r && r.v != null) pts.push({ i, v: r.v, flag: r.flag });
      }
      return { cat, mapa, pts, nac };
    };
    const series = [...c.visibles.map((k) => armar(k, c.t, false)), ...c.visN.map((k) => armar(k, c.tn, true))];
    return { series, todos: series.flatMap((s) => s.pts.map((p) => p.v)) };
  }

  // Ejes, rejilla, líneas y marcadores (sin interacción); lo usan la pantalla y la imagen PNG
  function construirGrafico(c, series, todos, W, H, tasa, mr = 18) {
    const m = { t: state.vals === "no" ? 14 : 26, r: mr, b: 56, l: W < 560 ? 54 : 66 };
    const { t: tx } = ticksX(c.i0, c.i1, W - m.l - m.r);
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    // El eje Y siempre parte de 0 (o del mínimo, si hubiera valores negativos)
    const yMin = Math.min(0, ...todos);
    const yMax = Math.max(...todos);
    const yt = ticksNice(yMin, yMax > yMin ? yMax : yMin + 1);
    const y0 = yt[0], y1 = yt[yt.length - 1];
    const X = (i) => (c.i1 === c.i0 ? m.l + iw / 2 : m.l + ((i - c.i0) / (c.i1 - c.i0)) * iw);
    const Y = (v) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;
    const fmtEje = (v) => (tasa ? `${nfEje.format(v * 100)}%` : nf0.format(v));

    let marcas = "";
    // Rejilla y eje Y
    for (const v of yt) {
      const y = Y(v);
      marcas += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="#e1e8eb" stroke-width="1"/>` +
        `<text x="${m.l - 8}" y="${y + 4}" text-anchor="end" font-size="12" fill="#51636f">${fmtEje(v)}</text>`;
    }
    marcas += `<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}" stroke="#9fb0b9" stroke-width="1"/>`;
    // Eje X
    for (const i of tx) {
      const x = X(i), y0 = m.t + ih, [l1, l2] = etqLineas(i);
      marcas += `<line x1="${x}" x2="${x}" y1="${y0}" y2="${y0 + 5}" stroke="#9fb0b9"/>` +
        `<text text-anchor="${x - 30 < 0 ? "start" : x + 30 > W ? "end" : "middle"}" font-size="12" fill="#51636f">` +
        `<tspan x="${x}" y="${y0 + 20}">${esc(l1)}</tspan><tspan x="${x}" y="${y0 + 34}">${esc(l2 ?? "")}</tspan></text>`;
    }
    // Líneas (se cortan donde falta el dato)
    for (const s of series) {
      let d = "", previo = null;
      for (const p of s.pts) {
        d += `${previo !== null && p.i === previo + 1 ? "L" : "M"}${X(p.i).toFixed(1)},${Y(p.v).toFixed(1)}`;
        previo = p.i;
      }
      const col = colorDe(s.cat);
      marcas += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${s.cat === "Total" ? 2.75 : 2.25}"${s.nac ? ' stroke-dasharray="7 5"' : ""} stroke-linejoin="round" stroke-linecap="round"/>`;
      const mostrarTodos = s.pts.length <= 30;
      for (const p of s.nac ? [] : s.pts) {
        if (p.flag) {
          marcas += `<circle cx="${X(p.i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="4" fill="#fff" stroke="${col}" stroke-width="2"/>`;
        } else if (mostrarTodos) {
          marcas += `<circle cx="${X(p.i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="2.5" fill="${col}"/>`;
        }
      }
      // Valores escritos sobre la línea
      if (state.vals !== "no" && s.pts.length && !s.nac) {
        const k = Number(state.vals) || Math.max(1, Math.ceil(40 / (iw / Math.max(1, c.i1 - c.i0))));   // «Automática»: evita solapes
        const sel = s.pts.filter((p) => (state.ancla === "ini" ? p.i - c.i0 : c.i1 - p.i) % k === 0);
        for (const p of new Set(sel)) {
          const x = X(p.i), y = Y(p.v);
          marcas += `<text x="${x.toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="${x + 26 > W ? "end" : x - 26 < 0 ? "start" : "middle"}" ` +
            `font-size="11" font-weight="600" fill="${col}" stroke="#fff" stroke-width="3" paint-order="stroke">${fmtValor(p.v, tasa)}</text>`;
        }
      }
    }
    return { marcas, geo: { W, H, m, iw, ih, X, Y, c, series, tasa } };
  }

  function dibujar() {
    const c = contexto();
    const tasa = esTasa(state.ind);
    const nombreT = nombreTerr.get(state.terr) ?? state.terr;
    btnXlsx.disabled = !c; btnPng.disabled = !c;

    elTitulo.textContent = state.titulo.trim() || nombreInd(state.ind);
    elLey.innerHTML = ""; elTabla.innerHTML = ""; elGraf.innerHTML = ""; tip = cursorG = svgEl = geo = null;

    if (!c) {
      elSub.textContent = "";
      elGraf.innerHTML = `<p class="vacio">No hay datos de este indicador para ${esc(nombreT)}.</p>`;
      elPista.textContent = "";
      return;
    }

    elSub.textContent = `${nombreT}${c.tn ? " y nivel nacional (línea punteada)" : ""}. ${tasa ? "Porcentaje" : "Personas"}. Trimestres móviles de ${etiqueta(c.i0)} a ${etiqueta(c.i1)}.`;

    elLey.innerHTML = c.cats.map((cat) =>
      `<button type="button" data-serie="${esc(cat)}" aria-pressed="${!state.ocultas.has(cat)}" style="--c:${colorDe(cat)}">` +
      `<span class="sw"></span>${esc(cat)}</button>`).join("") +
      (c.tn ? `<span class="it"><svg width="30" height="8" aria-hidden="true"><line x1="0" x2="30" y1="4" y2="4" stroke="#51636f" stroke-width="2" stroke-dasharray="7 5"/></svg>` +
        `Punteada: ${esc(nombreTerr.get(TERR_NAC))}</span>` : "");

    const { series, todos } = prepararSeries(c);
    if (!todos.length) {
      elGraf.innerHTML = `<p class="vacio">No hay datos en este período para las series seleccionadas.</p>`;
      elPista.textContent = "";
      btnXlsx.disabled = true; btnPng.disabled = true;
      renderTabla(c);
      return;
    }

    const W = Math.max(300, Math.floor(elGraf.clientWidth || 820));
    const H = W < 560 ? 290 : 380;
    const g = construirGrafico(c, series, todos, W, H, tasa);
    geo = g.geo;
    const { m, iw, ih } = geo;

    let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false">` + g.marcas;
    svg += `<g id="ene-cursor"></g>`;
    svg += `<rect id="ene-capa" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" style="cursor:crosshair"/>`;
    svg += `</svg>`;

    elGraf.innerHTML = svg + `<div class="tip" id="ene-tip" hidden></div>`;
    svgEl = elGraf.querySelector("svg"); cursorG = $("ene-cursor"); tip = $("ene-tip");
    elPista.innerHTML = `Pasa el cursor sobre el gráfico, tócalo o usa las flechas del teclado para ver cada trimestre móvil. ` +
      `El círculo vacío <span class="hueco"></span> marca un dato poco fiable o no fiable.`;

    renderTabla(c);
    if (state.cur != null && state.cur >= c.i0 && state.cur <= c.i1) mostrar(state.cur); else state.cur = null;
  }

  /* ---------- Tooltip ---------- */
  function calculos(cat, idx, c, t = c.t) {
    const mapa = t.cats.get(cat);
    const r = mapa.get(idx);
    const v = r?.v ?? null;
    return {
      r, v,
      dT: fmtDif(v, mapa.get(idx - LAG_TRIMESTRE)?.v ?? null, c.tasa),
      dA: fmtDif(v, mapa.get(idx - LAG_ANIO)?.v ?? null, c.tasa)
    };
  }

  function filaTip(cat, idx, c, t = c.t, suf = "") {
    const { r, v, dT, dA } = calculos(cat, idx, c, t);
    const celda = (d) => d
      ? `<td>${d.txt}${d.sub ? `<small>${d.sub}</small>` : ""}</td>`
      : `<td class="nd">s/d</td>`;
    let h = `<tr><th scope="row"><span class="sw" style="--c:${colorDe(cat)}"></span>${esc(cat + suf)}</th>` +
      (v == null ? `<td class="nd">s/d</td>` : `<td>${fmtValor(v, c.tasa)}</td>`) + celda(dT) + celda(dA) + `</tr>`;
    if (r?.flag) h += `<tr class="fl${r.flag === "No fiable" ? " nf" : ""}"><td colspan="4">\u26A0 ${esc(r.flag)}</td></tr>`;
    return h;
  }

  function periodoDe(idx, c) {
    for (const cat of c.cats) { const r = c.t.cats.get(cat).get(idx); if (r?.periodo) return r.periodo; }
    return etiqueta(idx);
  }

  function mostrar(idx) {
    if (!geo) return;
    const { c, X, Y, m, W, iw } = geo;
    idx = Math.min(c.i1, Math.max(c.i0, idx));
    state.cur = idx;
    const x = X(idx);

    let g = `<line x1="${x}" x2="${x}" y1="${m.t}" y2="${m.t + geo.ih}" stroke="#51636f" stroke-width="1" stroke-dasharray="3 3"/>`;
    for (const s of geo.series) {
      const r = s.mapa.get(idx);
      if (r && r.v != null) {
        g += s.nac
          ? `<rect x="${x - 4}" y="${Y(r.v) - 4}" width="8" height="8" fill="#fff" stroke="${colorDe(s.cat)}" stroke-width="2.5"/>`
          : `<circle cx="${x}" cy="${Y(r.v)}" r="5" fill="${r.flag ? "#fff" : colorDe(s.cat)}" stroke="${colorDe(s.cat)}" stroke-width="2.5"/>`;
      }
    }
    cursorG.innerHTML = g;

    const periodo = periodoDe(idx, c);
    tip.innerHTML = `<span class="t1">Trimestre móvil</span><span class="t2">${esc(periodo)}</span>` +
      `<table><thead><tr><th scope="col">Serie</th><th scope="col">${c.tasa ? "Tasa" : "Total"}</th>` +
      `<th scope="col">Var. mensual</th><th scope="col">Var. anual</th></tr></thead><tbody>` +
      c.visibles.map((cat) => filaTip(cat, idx, c)).join("") +
      c.visN.map((cat) => filaTip(cat, idx, c, c.tn, " (Nacional)")).join("") + `</tbody></table>`;
    tip.hidden = false;

    // Posición: a la derecha del cursor si cabe; si no, a la izquierda
    const ancho = tip.offsetWidth || 0;
    let left = x + 14;
    if (left + ancho > W - 4) left = x - 14 - ancho;
    tip.style.left = `${Math.max(4, left)}px`;

    const dic = (d) => (d ? `${d.txt}${d.sub ? " (" + d.sub + ")" : ""}` : "sin dato");
    elLive.textContent = `Trimestre móvil ${periodo}. ` + c.visibles.map((cat) => {
      const { r, v, dT, dA } = calculos(cat, idx, c);
      return `${cat}: ${fmtValor(v, c.tasa)}, respecto del trimestre móvil anterior ${dic(dT)}, respecto del año anterior ${dic(dA)}` +
        (r?.flag ? `, dato ${r.flag.toLowerCase()}` : "");
    }).join(". ");
  }

  function ocultarTip() {
    state.cur = null;
    if (tip) tip.hidden = true;
    if (cursorG) cursorG.innerHTML = "";
  }

  function idxDesdePuntero(ev) {
    const r = svgEl.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (geo.W / (r.width || geo.W));
    const { c, m, iw } = geo;
    return Math.round(c.i0 + ((px - m.l) / iw) * (c.i1 - c.i0));
  }

  /* ---------- Tabla alternativa ---------- */
  function renderTabla(c) {
    if (!c.visibles.length) return;
    const cols = [...c.visibles.map((k) => ({ k, t: c.t, etq: k })), ...c.visN.map((k) => ({ k, t: c.tn, etq: `${k} (Nacional)` }))];
    let h = `<table><thead><tr><th scope="col">Trimestre móvil</th>` +
      cols.map((x) => `<th scope="col" class="num">${esc(x.etq)}</th>`).join("") + `</tr></thead><tbody>`;
    for (let i = c.i1; i >= c.i0; i--) {
      h += `<tr><th scope="row">${esc(periodoDe(i, c))}</th>` + cols.map((x) => {
        const r = x.t.cats.get(x.k).get(i);
        const fl = r?.flag ? `<span class="fl${r.flag === "No fiable" ? " nf" : ""}">\u26A0 ${esc(r.flag)}</span>` : "";
        return `<td class="num">${fl}${fmtValor(r?.v ?? null, c.tasa)}</td>`;
      }).join("") + `</tr>`;
    }
    elTabla.innerHTML = h + `</tbody></table>`;
  }

  /* ---------- Exportar a Excel y PNG (los archivos se generan en core/export.js) ---------- */
  const { xlsx, svgAPng, descargarBlob, ESTILO } = OLT.export;
  const { envolver } = OLT.medir;

  const nombreArchivo = (ext) => {
    const per = { "12": "1-año", "24": "2-años", "60": "5-años", todo: "serie-completa" }[state.per] ?? `${ym(state.d0 ?? 0)}_a_${ym(state.d1 ?? 0)}`;
    return `ene_${state.ind}_${state.terr}${state.comp && state.terr !== TERR_NAC ? "_vs-nacional" : ""}_${per}.${ext}`;
  };

  function exportarExcel() {
    const c = contexto();
    if (!c || !c.visibles.length) return;
    const nombreT = nombreTerr.get(state.terr) ?? state.terr;
    const est = c.tasa ? ESTILO.porcentaje : ESTILO.entero;

    // Hoja "Datos": una fila por trimestre móvil, en orden cronológico
    const cols = [...c.visibles.map((k) => ({ k, t: c.t, etq: k })), ...c.visN.map((k) => ({ k, t: c.tn, etq: `${k} (Nacional)` }))];
    const enc = ["Trimestre móvil", "Mes central", ...cols.map((x) => x.etq), ...cols.map((x) => `Fiabilidad ${x.etq}`)];
    const filas = [enc.map((v) => ({ v, est: ESTILO.encabezado }))];
    for (let i = c.i0; i <= c.i1; i++) {
      const serie = Math.round(Date.UTC(Math.floor(i / 12), i % 12, 1) / 86400000) + 25569;   // fecha serial de Excel
      const reg = cols.map((x) => x.t.cats.get(x.k).get(i));
      filas.push([
        periodoDe(i, c),
        { v: serie, est: ESTILO.fecha },
        ...reg.map((r) => (r && r.v != null ? { v: r.v, est } : null)),
        ...reg.map((r) => (r && r.flag ? r.flag : null))
      ]);
    }
    const hojaDatos = {
      nombre: "Datos", filas, congelarEncabezado: true,
      anchos: [18, 12, ...cols.map(() => 14), ...cols.map(() => 24)]
    };

    // Hoja "Información": qué se exportó
    const info = [
      ["Indicador", nombreInd(state.ind)],
      ["Código del indicador", state.ind],
      ["Región", nombreT + (c.tn ? " y nivel nacional" : "")],
      ["Unidad", c.tasa ? "Porcentaje (los valores se guardan como proporción y se muestran en %)" : "Personas"],
      ["Período exportado", `${etiqueta(c.i0)} a ${etiqueta(c.i1)}`],
      ["Series incluidas", cols.map((x) => x.etq).join(", ")],
      ["Filas", "Un trimestre móvil por fila, en orden cronológico; «Mes central» es el mes al que se asigna cada trimestre móvil."],
      ["Fiabilidad", "Las columnas «Fiabilidad» indican los datos poco fiables o no fiables; si están vacías, el dato no tiene marca."],
      ["Exportado el", new Date().toLocaleString("es-CL")]
    ];
    const hojaInfo = {
      nombre: "Información", anchos: [24, 90],
      filas: info.map(([k, v]) => [{ v: k, est: ESTILO.encabezado }, v])
    };

    const nombre = nombreArchivo("xlsx");
    descargarBlob(xlsx([hojaDatos, hojaInfo]), nombre);
    elLive.textContent = `Se generó el archivo ${nombre}.`;
  }
  btnXlsx.addEventListener("click", exportarExcel);

  /* ---------- Descargar imagen (PNG) del gráfico ---------- */
  function exportarPng() {
    const c = contexto();
    if (!c || !c.visibles.length) return;
    const { series, todos } = prepararSeries(c);
    if (!todos.length) return;

    const FAM = "'Ubuntu', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
    const W = 1100, mg = 28, altoGraf = 400, escala = 2;
    const ctx = document.createElement("canvas").getContext("2d");
    const medir = (t, px, peso) => { ctx.font = `${peso} ${px}px ${FAM}`; return ctx.measureText(t).width; };
    const nombreT = nombreTerr.get(state.terr) ?? state.terr;

    let y = mg, capa = "";
    // Título: indicador + período
    const titulo = state.titulo.trim() || `${nombreInd(state.ind)}, ${etiqueta(c.i0)} a ${etiqueta(c.i1)}`;
    for (const l of envolver(titulo, W - 2 * mg, (t) => medir(t, 22, 700))) {
      capa += `<text x="${mg}" y="${y + 22}" font-size="22" font-weight="700" fill="#12263a">${esc(l)}</text>`;
      y += 28;
    }
    y += 4;
    capa += `<text x="${mg}" y="${y + 14}" font-size="14" fill="#51636f">` +
      `${esc(`${nombreT}${c.tn ? " y nivel nacional (línea punteada)" : ""}. ${c.tasa ? "Porcentaje" : "N° de personas (estimación)"}. Cada punto es un trimestre móvil.${state.titulo.trim() ? ` ${etiqueta(c.i0)} a ${etiqueta(c.i1)}.` : ""}`)}</text>`;
    y += 30;
    // Leyenda
    let x = mg;
    for (const s of series.filter((q) => !q.nac)) {
      capa += `<circle cx="${x + 6}" cy="${y + 8}" r="6" fill="${colorDe(s.cat)}"/>` +
        `<text x="${x + 18}" y="${y + 13}" font-size="14" fill="#12263a">${esc(s.cat)}</text>`;
      x += 18 + medir(s.cat, 14, 400) + 26;
    }
    if (c.tn) {
      capa += `<line x1="${x}" x2="${x + 28}" y1="${y + 8}" y2="${y + 8}" stroke="#51636f" stroke-width="2" stroke-dasharray="7 5"/>` +
        `<text x="${x + 36}" y="${y + 13}" font-size="14" fill="#12263a">${esc("Punteada: " + nombreTerr.get(TERR_NAC))}</text>`;
    }
    y += 30;
    // Gráfico
    const g = construirGrafico(c, series, todos, W, altoGraf, c.tasa, mg);
    capa += `<g transform="translate(0 ${y})">${g.marcas}</g>`;
    y += altoGraf;
    // Pie: nota de fiabilidad (izquierda, solo si corresponde) y fuente (derecha)
    if (series.some((s) => s.pts.some((p) => p.flag))) {
      capa += `<circle cx="${mg + 5}" cy="${y + 12}" r="4" fill="#fff" stroke="#12263a" stroke-width="2"/>` +
        `<text x="${mg + 16}" y="${y + 16}" font-size="12" fill="#51636f">Dato poco fiable o no fiable</text>`;
    }
    capa += `<text x="${W - mg}" y="${y + 16}" text-anchor="end" font-size="12" fill="#51636f">${esc(FUENTE_IMAGEN)}</text>`;
    const H = y + 32;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FAM}">` +
      `<rect width="${W}" height="${H}" fill="#ffffff"/>${capa}</svg>`;

    svgAPng(svg, W, H, escala)
      .then((blob) => {
        const nombre = nombreArchivo("png");
        descargarBlob(blob, nombre);
        elLive.textContent = `Se generó la imagen ${nombre}.`;
      })
      .catch(() => { elLive.textContent = "No se pudo generar la imagen."; });
  }
  btnPng.addEventListener("click", exportarPng);

  /* ---------- Controles ---------- */
  function llenarIndicadores() {
    const grupos = [
      ["Personas", indicadores.filter((i) => !esTasa(i))],
      ["Tasas", indicadores.filter(esTasa)]
    ];
    elInd.innerHTML = grupos.filter(([, l]) => l.length).map(([tit, l]) =>
      `<optgroup label="${tit}">` +
      l.map((i) => `<option value="${esc(i)}">${esc(nombreInd(i))}</option>`).join("") + `</optgroup>`).join("");
  }

  function pintarControles() {
    elInd.value = state.ind;
    const disp = datos.get(state.ind);
    elTerr.innerHTML = territorios.map((t) =>
      `<button type="button" data-terr="${esc(t)}" aria-pressed="${t === state.terr}"${disp.has(t) ? "" : ` disabled title="Sin datos de este indicador"`}>${esc(nombreTerr.get(t))}</button>`).join("");
    elPer.innerHTML = PERIODOS.map((p) =>
      `<button type="button" data-per="${p.id}" aria-pressed="${p.id === state.per}">${p.etq}</button>`).join("");
    // Comparación con el nivel nacional (solo si se ve otra región y el indicador tiene datos nacionales)
    const hayNac = state.terr !== TERR_NAC && disp.has(TERR_NAC);
    elComp.innerHTML = `<button type="button" aria-pressed="${state.comp && hayNac}"${hayNac ? "" : ` disabled title="Disponible al elegir una región distinta de Nacional"`}>Nivel nacional</button>`;
    // Desde / Hasta: todos los trimestres móviles disponibles; reflejan siempre el rango que se está mostrando
    const c = contexto();
    for (const [el, v] of [[elD0, c?.i0], [elD1, c?.i1]]) {
      el.innerHTML = "";
      if (c) { for (let i = c.min; i <= c.max; i++) el.add(new Option(etiqueta(i), i)); el.value = v; }
    }
  }

  function elegirIndicador(ind, { actualizarHash = true } = {}) {
    if (!datos.has(ind)) return;
    state.ind = ind;
    const disp = datos.get(ind);
    if (!state.terr || !disp.has(state.terr)) state.terr = territorios.find((t) => disp.has(t));
    state.cur = null;
    if (actualizarHash) OLT.hash.set(ind);
    pintarControles();
    dibujar();
  }

  elInd.addEventListener("change", () => elegirIndicador(elInd.value));
  elTerr.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-terr]");
    if (!b || b.disabled) return;
    state.terr = b.dataset.terr; state.cur = null; pintarControles(); dibujar();
  });
  elPer.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-per]");
    if (!b) return;
    state.per = b.dataset.per; state.cur = null; pintarControles(); dibujar();
  });
  elLey.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-serie]");
    if (!b) return;
    const cat = b.dataset.serie, c = contexto();
    if (state.ocultas.has(cat)) state.ocultas.delete(cat);
    else if (c && c.visibles.length > 1) state.ocultas.add(cat);   // siempre queda al menos una serie
    dibujar();
  });

  elComp.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b || b.disabled) return;
    state.comp = !state.comp; state.cur = null; pintarControles(); dibujar();
  });

  /* ---------- Rango y personalización ---------- */
  const alRango = (ev) => {
    let a = Number(elD0.value), b = Number(elD1.value);
    if (a > b) { if (ev.target === elD0) b = a; else a = b; }
    state.per = "custom"; state.d0 = a; state.d1 = b; state.cur = null; pintarControles(); dibujar();
  };
  elD0.addEventListener("input", alRango); elD1.addEventListener("input", alRango);

  const campo = (id, etq, ops, val) => `<div class="grupo"><label for="${id}">${etq}</label><select id="${id}">` +
    ops.map(([v, t]) => `<option value="${v}"${String(v) === val ? " selected" : ""}>${t}</option>`).join("") + `</select></div>`;
  const MAPA = [["ene-paso", "paso"], ["ene-ancla", "ancla"], ["ene-vals", "vals"], ["ene-tit", "titulo"]];
  $("ene-pers").innerHTML =
    campo("ene-paso", "Etiquetas eje X (horizontal)", PASOS, state.paso) +
    campo("ene-ancla", "Contar etiquetas eje X desde", [["fin", "El último dato"], ["ini", "El primer dato"]], state.ancla) +
    campo("ene-vals", "Etiquetas sobre la línea (dentro del gráfico)", [["no", "Ninguno"], ...PASOS], state.vals) +
    `<div class="grupo"><label for="ene-tit">Título del gráfico</label><input type="text" id="ene-tit" placeholder="Ej: Tasa de desocupación, periodo jul-sep 2021 - jul-sep 2026"></div>` +
    `<div class="grupo"><span>&nbsp;</span><button type="button" class="btn" id="ene-reset">Restablecer</button></div>`;
  for (const [id, k] of MAPA) $(id).addEventListener("input", (ev) => { state[k] = ev.target.value; state.cur = null; dibujar(); });
  $("ene-reset").addEventListener("click", () => {
    Object.assign(state, PERS0, { per: PERIODO_INICIAL });
    for (const [id, k] of MAPA) $(id).value = state[k];
    pintarControles(); dibujar();
  });

  // Puntero (ratón y tacto) y teclado
  elGraf.addEventListener("pointermove", (ev) => {
    if (!geo || !ev.target.closest("#ene-capa")) return;
    mostrar(idxDesdePuntero(ev));
  });
  elGraf.addEventListener("pointerdown", (ev) => {
    if (!geo || !ev.target.closest("#ene-capa")) return;
    mostrar(idxDesdePuntero(ev));
  });
  elGraf.addEventListener("pointerleave", (ev) => { if (ev.pointerType !== "touch") ocultarTip(); });
  elGraf.addEventListener("blur", () => { if (document.activeElement !== elGraf) ocultarTip(); });
  elGraf.addEventListener("keydown", (ev) => {
    if (!geo) return;
    const { c } = geo;
    const paso = { ArrowLeft: -1, ArrowRight: 1 }[ev.key];
    if (paso) { ev.preventDefault(); mostrar((state.cur ?? (paso > 0 ? c.i0 - 1 : c.i1 + 1)) + paso); }
    else if (ev.key === "Home") { ev.preventDefault(); mostrar(c.i0); }
    else if (ev.key === "End") { ev.preventDefault(); mostrar(c.i1); }
    else if (ev.key === "Escape") { ocultarTip(); }
  });

  // Redibujar al cambiar el ancho
  let anchoPrevio = 0;
  const alRedimensionar = () => {
    const w = elGraf.clientWidth;
    if (w && w !== anchoPrevio) { anchoPrevio = w; dibujar(); }
  };
  if (window.ResizeObserver) new ResizeObserver(alRedimensionar).observe(elGraf);
  else window.addEventListener("resize", alRedimensionar);

  OLT.hash.onChange((h) => {
    if (h !== state.ind && datos.has(h)) elegirIndicador(h, { actualizarHash: false });
  });

  /* ---------- Inicio ---------- */
  $("ene-pie").textContent =
    "Cada punto es un trimestre móvil. La variación mensual compara con el trimestre móvil anterior (un mes antes) y la anual con el de 12 meses antes; " +
    "en las tasas las diferencias se expresan en puntos porcentuales (pp). Los datos poco fiables o no fiables se señalan con \u26A0 y con un círculo vacío.";
  llenarIndicadores();
  const inicial = OLT.hash.get();
  elegirIndicador(datos.has(inicial) ? inicial : indicadores[0], { actualizarHash: false });
})();
