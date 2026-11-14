(() => {
  "use strict";

  /* ---------- Utilidades ---------- */
  const fallosCarga = new Set(); // ids de bloques JSON ausentes o inválidos
  const leer = (id) => {
    const el = document.getElementById(id);
    if (!el) { fallosCarga.add(id); return []; }
    try { return JSON.parse(el.textContent); }
    catch (e) { console.error("JSON inválido en " + id, e); fallosCarga.add(id); return []; }
  };
  const pad = (x, n) => String(x ?? "").trim().padStart(n, "0");
  const texto = (s) => String(s ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\r\n?/g, "\n");
  const una = (s) => texto(s).replace(/\s+/g, " ").trim();
  const norm = (s) => una(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const sinPunto = (s) => s.replace(/[.;}\s]+$/, "");
  const { esc } = OLT.util;
  const plural = (n, uno, varios) => (n === 1 ? uno : varios);

  /* ---------- Interpretación de los textos de la CIUO ---------- */
  // Descripción: párrafos y listas de tareas ("a. ...", "b. ...")
  function parseDesc(txt) {
    const bloques = [];
    let buf = [];
    const vaciar = () => {
      if (buf.length) {
        const t = buf.join(" ");
        bloques.push({ t: "p", txt: t, intro: /:$/.test(t) });
        buf = [];
      }
    };
    for (const crudo of texto(txt).split("\n")) {
      const l = crudo.trim();
      if (!l) { vaciar(); continue; }
      const m = l.match(/^([a-z]{1,2})\.\s+(.+)$/);
      if (m) {
        vaciar();
        const ult = bloques[bloques.length - 1];
        const item = sinPunto(una(m[2]));
        if (ult && ult.t === "l") ult.items.push(item);
        else bloques.push({ t: "l", items: [item] });
      } else {
        buf.push(una(l));
      }
    }
    vaciar();
    return bloques;
  }

  // Listas con viñetas: devuelve {items, notas}
  function parseLista(txt) {
    const items = [], notas = [];
    for (const crudo of texto(txt).split("\n")) {
      const l = crudo.trim();
      if (!l) continue;
      if (l.startsWith("•")) items.push(una(l.replace(/^•\s*/, "")));
      else if (items.length && !/:$/.test(l)) items[items.length - 1] += " " + una(l);
      else notas.push(una(l));
    }
    return { items, notas };
  }

  // "Secretario ejecutivo – 3343." -> {nombre, cod}
  function parseNoIncl(item) {
    const m = item.match(/^(.*?)\s*[–—-]\s*(\d{4})[\s.}]*$/);
    return m ? { nombre: sinPunto(m[1]), cod: m[2] } : { nombre: sinPunto(item), cod: null };
  }

  /* ---------- Datos ---------- */
  const granGrupos = leer("d-gran_grupo").map((g) => ({ cod: pad(g.gran_grupo, 1), glosa: una(g.glosa) }));
  const glosaGG = new Map(granGrupos.map((g) => [g.cod, g.glosa]));
  const glosaSP = new Map(leer("d-subgrupo_ppal").map((s) => [pad(s.subgrupo_ppal, 2), una(s.glosa)]));
  const glosaSG = new Map(leer("d-subgrupo").map((s) => [pad(s.subgrupo, 3), una(s.glosa)]));

  const perfiles = leer("d-chilevalora").map((p) => ({
    codigo: una(p.codigo_perfil),
    ciiu: una(p.ciiu),
    ciuo: pad(p.ciuo, 4),
    nombre: una(p.nombre_perfil),
    vigencia: una(p.vigencia),
    modalidad: una(p.modalidad),
    nivel: una(p.nivel_cualificacion),
    clas: (p.clasificaciones ?? []).map((c) => ({ sector: una(c.sector), subsector: una(c.subsector), area: una(c.area_productiva) })),
    comps: (p.competencias ?? []).map((c) => ({ cod: una(c.codigo_ucl), nombre: una(c.nombre_ucl) })),
  })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const perfilesPorCiuo = new Map();
  for (const p of perfiles) {
    if (!perfilesPorCiuo.has(p.ciuo)) perfilesPorCiuo.set(p.ciuo, []);
    perfilesPorCiuo.get(p.ciuo).push(p);
  }

  // Competencias SABE por ocupación a 4 dígitos (key "ciuo")
  const sabePorCiuo = new Map();
  for (const r of leer("d-sabe")) {
    const cod = pad(r.ciuo, 4);
    if (!sabePorCiuo.has(cod)) sabePorCiuo.set(cod, []);
    sabePorCiuo.get(cod).push({ glosa: una(r.glosa_competencia), tipo: una(r.tipo_competencia), n: Number(r.menciones) || 0 });
  }

  // Requisitos solicitados por ocupación (ENADEL), ordenados de mayor a menor número de menciones
  const reqError = (() => { const t = leer("d-enadel-req"); return fallosCarga.has("d-enadel-req") || !Array.isArray(t); })();
  const reqPorCiuo = new Map();
  for (const r of reqError ? [] : leer("d-enadel-req")) {
    const cod = pad(r.ciuo, 4);
    const n = Number(r.menciones) || 0;
    if (!reqPorCiuo.has(cod)) reqPorCiuo.set(cod, new Map());
    const m = reqPorCiuo.get(cod), g = una(r.glosa_competencia);
    m.set(g, (m.get(g) ?? 0) + n);
  }
  for (const [cod, m] of reqPorCiuo) {
    reqPorCiuo.set(cod, [...m].map(([glosa, n]) => ({ glosa, n }))
      .sort((a, b) => (b.n - a.n) || a.glosa.localeCompare(b.glosa, "es")));
  }

  // Menciones de otras fuentes por código CIUO de 4 dígitos (coincidencia exacta).
  // Cada registro trae listas separadas por ";" en Puestos_Unicos y Tareas.
  const FUENTES = [
    { id: "casen", dato: "d-casen", archivo: "ciuo_casen.json", nombre: "CASEN", anio: 2024 },
    { id: "enadel", dato: "d-enadel", archivo: "ciuo_enadel.json", nombre: "ENADEL", anio: 2025 },
  ];
  const partir = (s) => [...new Set(String(s ?? "").split(";").map(una).filter(Boolean))];
  for (const f of FUENTES) {
    const filas = leer(f.dato);
    f.etq = `${f.nombre} ${f.anio}`;
    f.error = fallosCarga.has(f.dato) || !Array.isArray(filas);
    f.porCiuo = new Map();
    f.sinAsociar = []; // códigos inválidos o sin ocupación oficial exacta
    for (const r of f.error ? [] : filas) {
      const crudo = una(r.CIUO_4D);
      const cod = /^\d{1,4}$/.test(crudo) ? pad(crudo, 4) : null;
      if (!cod) { f.sinAsociar.push({ cod: crudo, motivo: "código inválido" }); continue; }
      const m = { puestos: partir(r.Puestos_Unicos), tareas: partir(r.Tareas) };
      const previo = f.porCiuo.get(cod);
      if (previo) { // registro repetido: se fusiona sin duplicar textos
        previo.puestos = [...new Set([...previo.puestos, ...m.puestos])];
        previo.tareas = [...new Set([...previo.tareas, ...m.tareas])];
      } else f.porCiuo.set(cod, m);
    }
  }

  const ocupaciones = leer("d-primario").map((p) => {
    const cod = pad(p.grupo_primario, 4);
    const inc = parseLista(p.oc_incluidas);
    const noinc = parseLista(p.oc_no_incl);
    return {
      cod, sinFicha: false,
      gg: pad(p.gran_grupo, 1), sp: pad(p.subgrupo_ppal, 2), sg: pad(p.subgrupo, 3),
      glosa: una(p.glosa),
      desc: parseDesc(p.desc),
      inc: { items: inc.items.map(sinPunto), notas: inc.notas },
      noinc: { items: noinc.items.map(parseNoIncl), notas: noinc.notas },
      perfiles: perfilesPorCiuo.get(cod) ?? [],
    };
  });

  // Códigos que ChileValora usa pero que no existen en la CIUO cargada
  const conocidos = new Set(ocupaciones.map((o) => o.cod));
  for (const [cod, lista] of perfilesPorCiuo) {
    if (conocidos.has(cod)) continue;
    ocupaciones.push({
      cod, sinFicha: true,
      gg: cod.slice(0, 1), sp: cod.slice(0, 2), sg: cod.slice(0, 3),
      glosa: "Código sin ficha en el clasificador",
      desc: [], inc: { items: [], notas: [] }, noinc: { items: [], notas: [] },
      perfiles: lista,
    });
  }

  const ordenGG = new Map(granGrupos.map((g, i) => [g.cod, i]));
  ocupaciones.sort((a, b) =>
    ((ordenGG.get(a.gg) ?? 99) - (ordenGG.get(b.gg) ?? 99)) || a.cod.localeCompare(b.cod));

  for (const o of ocupaciones) {
    o.nGlosa = norm(o.cod + " " + o.glosa);
    o.nPuestos = o.inc.items.map(norm);
    o.nPerfiles = o.perfiles.map((p) => norm(p.nombre));
  }
  const porCod = new Map(ocupaciones.map((o) => [o.cod, o]));

  // Menciones por fuente en cada ocupación (o.fuentes[id]). Los códigos sin
  // ocupación oficial exacta quedan en f.sinAsociar y no crean ocupaciones.
  const catalogoOficial = new Set(ocupaciones.filter((o) => !o.sinFicha).map((o) => o.cod));
  for (const f of FUENTES) {
    for (const cod of f.porCiuo.keys()) {
      if (!catalogoOficial.has(cod)) f.sinAsociar.push({ cod, motivo: "sin ocupación CIUO-08 con ese código" });
    }
    if (f.sinAsociar.length) console.warn(`${f.etq}: registros sin asociación`, f.sinAsociar);
  }
  for (const o of ocupaciones) {
    o.fuentes = {};
    for (const f of FUENTES) {
      const m = (!o.sinFicha && f.porCiuo.get(o.cod)) || { puestos: [], tareas: [] };
      m.nPuestos = m.puestos.map(norm);
      
      o.fuentes[f.id] = m;
    }
  }

  /* ---------- Referencias al DOM ---------- */
  const raiz = document.getElementById("cv");
  const inputQ = document.getElementById("cv-q");
  const chkSolo = document.getElementById("cv-solo");
  const chkPrio = document.getElementById("cv-prio");
  const elN = document.getElementById("cv-n");
  const elLista = document.getElementById("cv-lista");
  const elDetalle = document.getElementById("cv-detalle");
  const elPie = document.getElementById("cv-pie");

  const state = { sel: null };
  const movimientoReducido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Búsqueda ---------- */
  // Devuelve null (sin coincidencia) o {vias: [{via, txt, fuente?, tarea?}]}.
  // "vias" vacío = coincide por código o glosa oficial.
  function coincide(o, tokens, soloDigitos) {
    if (!tokens.length) return { vias: [] };
    if (soloDigitos) return o.cod.startsWith(tokens[0]) ? { vias: [] } : null;
    const todos = (t) => tokens.every((k) => t.includes(k));
    const porGlosa = todos(o.nGlosa);
    const vias = [];
    if (!porGlosa) {
      const iu = o.nPuestos.findIndex(todos);
      if (iu >= 0) vias.push({ via: "Puesto", txt: o.inc.items[iu] });
      else {
        const ip = o.nPerfiles.findIndex(todos);
        if (ip >= 0) vias.push({ via: "Perfil", txt: o.perfiles[ip].nombre });
      }
    }
    for (const f of FUENTES) {
      const m = o.fuentes[f.id];
      m.puestos.forEach((t, i) => { if (todos(m.nPuestos[i])) vias.push({ via: f.etq, txt: t, fuente: f.id }); });
      
    }
    return porGlosa || vias.length ? { vias } : null;
  }

  // Procedencia bajo el nombre: máx. 2 por fuente, el resto se resume
  const MAX_VIAS = 2;
  function htmlVias(vias) {
    const grupos = new Map();
    for (const v of vias) {
      const k = v.fuente ?? v.via;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(v);
    }
    let html = "";
    for (const lista of grupos.values()) {
      const { via, fuente } = lista[0];
      const cls = fuente ? " " + fuente : "";
      for (const v of lista.slice(0, MAX_VIAS)) {
        html += `<span class="via${cls}"><b>${esc(via)}:</b> ${esc(v.txt)}</span>`;
      }
      const r = lista.length - MAX_VIAS;
      if (r > 0) html += `<span class="via${cls}">${esc(via)}: y ${r} ${plural(r, "coincidencia más", "coincidencias más")}</span>`;
    }
    return html;
  }

  function renderLista() {
    const q = norm(inputQ.value);
    const tokens = q ? q.split(" ") : [];
    const soloDigitos = tokens.length === 1 && /^\d+$/.test(tokens[0]);
    const grupos = new Map(granGrupos.map((g) => [g.cod, []]));
    let n = 0;
    for (const o of ocupaciones) {
      if (chkSolo.checked && !o.perfiles.length) continue;
      if (chkPrio.checked && !FUENTES.some((f) => o.fuentes[f.id].puestos.length || o.fuentes[f.id].tareas.length)) continue;
      const via = coincide(o, tokens, soloDigitos);
      if (!via) continue;
      if (!grupos.has(o.gg)) grupos.set(o.gg, []);
      grupos.get(o.gg).push({ o, via });
      n++;
    }

    let html = "";
    for (const [cod, filas] of grupos) {
      if (!filas.length) continue;
      html += `<h3>${esc(cod)} ${esc(glosaGG.get(cod) ?? "Otros códigos")}</h3><ul>`;
      for (const { o, via } of filas) {
        const np = o.perfiles.length;
        html += `<li><button type="button" class="fila" data-cod="${o.cod}" aria-current="${o.cod === state.sel}">` +
          `<span class="c cod">${o.cod}</span>` +
          `<span class="nom${o.sinFicha ? " sinficha" : ""}">${esc(o.glosa)}` +
          htmlVias(via.vias) + `</span>` +
          `<span class="np" title="${np} ${plural(np, "perfil", "perfiles")} ChileValora">${np || ""}` +
          (np ? `<span class="sr"> ${plural(np, "perfil", "perfiles")}</span>` : "") + `</span></button></li>`;
      }
      html += `</ul>`;
    }
    elLista.innerHTML = html ||
      `<p class="nada">No hay ocupaciones que coincidan. Prueba con otra palabra o un código, o desmarca los filtros.</p>`;
    elN.textContent = `Mostrando ${n} de ${ocupaciones.length} ${plural(ocupaciones.length, "ocupación", "ocupaciones")}`;
  }

  /* ---------- Detalle ---------- */
  function estadoVigencia(v) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v || "");
    if (!m) return { txt: v || "No informada", vencido: false };
    const f = new Date(+m[3], +m[2] - 1, +m[1], 23, 59, 59);
    return { txt: v, vencido: f < new Date() };
  }

  function htmlArbol(o) {
    const niveles = [
      { cod: o.gg, glosa: glosaGG.get(o.gg) },
      { cod: o.sp, glosa: glosaSP.get(o.sp) },
      { cod: o.sg, glosa: glosaSG.get(o.sg) },
    ].filter((n) => n.glosa);
    if (!niveles.length) return "";
    return `<ol class="arbol" aria-label="Ubicación en la clasificación">` +
      niveles.map((n, i) =>
        `<li style="--nivel:${i}"><button type="button" data-filtro="${esc(n.cod)}" ` +
        `title="Listar las ocupaciones que empiezan con ${esc(n.cod)}"><span class="cod">${esc(n.cod)}</span>${esc(n.glosa)}</button></li>`
      ).join("") + `</ol>`;
  }

  function htmlDescripcion(o) {
    if (!o.desc.length) return "";
    const cuerpo = o.desc.map((b) => b.t === "l"
      ? `<ol type="a" class="tareas">${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ol>`
      : `<p${b.intro ? ' class="intro"' : ""}>${esc(b.txt)}</p>`).join("");
    return `<section class="bloque"><h3>Descripción</h3><div class="prosa">${cuerpo}</div></section>`;
  }

  function htmlPuestos(o) {
    const notasInc = o.inc.notas.map((n) => `<p class="nota">${esc(n)}</p>`).join("");
    const notasNo = o.noinc.notas.map((n) => `<p class="nota">${esc(n)}</p>`).join("");
    const inc = o.inc.items.length
      ? `<ul class="puestos">${o.inc.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
      : `<p class="vacio-seccion">No hay puestos incluidos registrados.</p>`;
    const no = o.noinc.items.length
      ? `<ul class="puestos no">${o.noinc.items.map((i) => {
          const dest = i.cod && porCod.get(i.cod);
          return dest
            ? `<li><button type="button" class="ir" data-ir="${i.cod}" title="Ir a ${i.cod}: ${esc(dest.glosa)}">${esc(i.nombre)}<span class="cod">${i.cod}</span></button></li>`
            : `<li>${esc(i.nombre)}${i.cod ? ` <span class="cod">${i.cod}</span>` : ""}</li>`;
        }).join("")}</ul>`
      : `<p class="vacio-seccion">No hay puestos excluidos registrados.</p>`;
    return `<section class="bloque"><h3>Puestos de trabajo</h3><div class="dos">` +
      `<div><h4>Incluidos<span class="cuenta">${o.inc.items.length}</span></h4>${notasInc}${inc}</div>` +
      `<div><h4>No incluidos, clasificados en otro grupo<span class="cuenta">${o.noinc.items.length}</span></h4>${notasNo}${no}</div>` +
      `</div></section>`;
  }

  /* ---------- Menciones en otras fuentes (CASEN, ENADEL) ---------- */
  function htmlFuente(f, o) {
    const m = o.fuentes[f.id];
    const np = m.puestos.length, nt = m.tareas.length, n = np + nt;
    let cuerpo, resumen;
    if (f.error) {
      resumen = "Fuente no disponible";
      cuerpo = `<p class="error-carga" role="alert">No fue posible cargar los datos de ${esc(f.etq)}. Esto no significa que la ocupación no tenga menciones. Revisa que ${esc(f.archivo)} exista en data/json/ y vuelve a renderizar el documento.</p>`;
    } else if (!n) {
      resumen = "0 menciones";
      cuerpo = `<p class="vacio-seccion">No hay menciones registradas para esta ocupación en esta fuente</p>`;
    } else {
      resumen = `${n} ${plural(n, "mención", "menciones")}: ${np} ${plural(np, "puesto", "puestos")} y ${nt} ${plural(nt, "tarea", "tareas")}`;
      cuerpo =
        (np ? `<h5>Puestos de trabajo<span class="cuenta">${np}</span></h5><ul class="chips">${m.puestos.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : "") +
        (nt ? `<h5>Tareas<span class="cuenta">${nt}</span></h5><ul class="tareas-f">${m.tareas.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : "");
    }
    return `<article class="fuente ${f.id}" aria-labelledby="fu-${f.id}"><h4 id="fu-${f.id}">${esc(f.nombre)} ${f.anio}</h4>` +
      `<p class="resumen">${esc(resumen)}</p>${cuerpo}</article>`;
  }

  function htmlFuentes(o) {
    return `<section class="bloque" aria-labelledby="fu-titulo"><h3 id="fu-titulo">Menciones ocupacionales en otras fuentes</h3>` +
      `<p class="fuentes-nota">Información complementaria proveniente de los últimos levantamientos de las encuestas CASEN y ENADEL. Estas permiten identificar otras denominaciones asociadas a la ocupación. Son menciones registradas en cada fuente y no forman parte de la clasificación oficial CIUO-08.</p>` +
      `<div class="fuentes">${FUENTES.map((f) => htmlFuente(f, o)).join("")}</div></section>`;
  }

  /* ---------- Nube de competencias (SABE) ---------- */
  const NUBE = { w: 720, h: 360, min: 12, max: 36, pad: 3 };
  const COLOR_TIPO = {
    "Técnico-cognitiva": "#0d4a70",
    "Técnico-física": "#1b7a70",
    "Competencia digital básica": "#b45f06",
    "Competencia digital avanzada": "#7a3b8f",
    "Certificación": "#a8281f",
  };
  const colorTipo = (t) => COLOR_TIPO[t] ?? "#51636f";
  const anchoTexto = (txt, px) => OLT.medir.ancho(txt, px, "600");
  const cacheNube = new Map();

  // Disposición en espiral (determinista): las palabras más mencionadas van al
  // centro; si una no cabe, se reduce su tamaño hasta que quepa.
  function disponerNube(items) {
    const { w, h, min, max, pad: p } = NUBE;
    const raices = items.map((i) => Math.sqrt(i.n));
    const rMin = Math.min(...raices), rMax = Math.max(...raices);
    const colocados = [];
    const choca = (r) => colocados.some((c) => r.x0 < c.x1 && r.x1 > c.x0 && r.y0 < c.y1 && r.y1 > c.y0);
    const palabras = [];
    let omitidas = 0;

    for (const it of [...items].sort((a, b) => b.n - a.n)) {
      const t = rMax > rMin ? (Math.sqrt(it.n) - rMin) / (rMax - rMin) : 0.5;
      let px = min + t * (max - min);
      while (px > min && anchoTexto(it.glosa, px) > w * 0.7) px -= 1;
      let puesto = null;

      while (!puesto && px >= 9) {
        const ancho = anchoTexto(it.glosa, px), alto = px * 1.2;
        for (let k = 0; k < 3000 && !puesto; k++) {
          const ang = k * 0.25, rad = 0.9 * ang;
          const x = w / 2 + rad * Math.cos(ang) * (w / h);
          const y = h / 2 + rad * Math.sin(ang);
          const r = { x0: x - ancho / 2 - p, x1: x + ancho / 2 + p, y0: y - alto / 2 - p, y1: y + alto / 2 + p };
          if (r.x0 < 0 || r.x1 > w || r.y0 < 0 || r.y1 > h) continue;
          if (!choca(r)) { puesto = { r, x, y }; }
        }
        if (!puesto) px *= 0.88;
      }
      if (puesto) {
        colocados.push(puesto.r);
        palabras.push({ ...it, x: puesto.x, y: puesto.y, px });
      } else omitidas++;
    }
    return { palabras, omitidas };
  }

  function htmlNube(o) {
    const items = sabePorCiuo.get(o.cod) ?? [];
    if (!items.length) {
      return `<section class="bloque"><h3>Competencias demandadas<span class="cuenta">0</span></h3>` +
        `<p class="vacio-seccion">No hay competencias SABE registradas para esta ocupación.</p></section>`;
    }
    if (!cacheNube.has(o.cod)) cacheNube.set(o.cod, disponerNube(items));
    const { palabras, omitidas } = cacheNube.get(o.cod);

    const svg = palabras.map((w) =>
      `<text x="${w.x.toFixed(1)}" y="${w.y.toFixed(1)}" font-size="${w.px.toFixed(1)}" fill="${colorTipo(w.tipo)}" ` +
      `text-anchor="middle" dominant-baseline="central"><title>${esc(w.glosa)} — ${esc(w.tipo)}: ` +
      `${w.n.toLocaleString("es-CL")} ${plural(w.n, "mención", "menciones")}</title>${esc(w.glosa)}</text>`).join("");

    const porTipo = new Map();
    for (const i of items) porTipo.set(i.tipo, (porTipo.get(i.tipo) ?? 0) + 1);
    const leyenda = [...porTipo].sort((a, b) => b[1] - a[1]).map(([t, c]) =>
      `<li><i style="background:${colorTipo(t)}"></i>${esc(t)} (${c})</li>`).join("");

    const tabla = [...items].sort((a, b) => b.n - a.n).map((i) =>
      `<li>${esc(i.glosa)}, ${esc(i.tipo)}: ${i.n} ${plural(i.n, "mención", "menciones")}</li>`).join("");

    return `<section class="bloque"><h3>Competencias demandadas<span class="cuenta">${items.length}</span></h3>` +
      `<p class="nube-nota">Información extraída del Sistema de Análisis de Bolsa de Empleo, SABE. Señala el número de menciones que cada competencia aparece en anuncios de empleo de la ocupación. El tamaño de cada competencia es proporcional a sus menciones, relativo a esta ocupación; el color indica el tipo. ` +
      `Pasa el cursor sobre una competencia para ver el número exacto de menciones (nivel nacional).` +
      (omitidas ? ` No caben en la nube ${omitidas} ${plural(omitidas, "competencia", "competencias")} de menor tamaño.` : "") + `</p>` +
      `<div class="nube"><svg viewBox="0 0 ${NUBE.w} ${NUBE.h}" aria-hidden="true" focusable="false">${svg}</svg>` +
      `<ul class="leyenda" aria-label="Tipos de competencia">${leyenda}</ul></div>` +
      `<ul class="sr" aria-label="Competencias y menciones">${tabla}</ul></section>`;
  }

  /* ---------- Requisitos solicitados (ENADEL) ---------- */
  const fmtN = (n) => Math.round(n).toLocaleString("es-CL");
  function htmlRequisitos(o) {
    const cab = (c) => `<h3>Requisitos solicitados<span class="cuenta">${c}</span></h3>`;
    if (reqError) {
      return `<section class="bloque">${cab(0)}<div class="req"><p class="error-carga" role="alert">No fue posible cargar ENADEL.json. Esto no significa que la ocupación no tenga requisitos registrados. Revisa que el archivo exista en data/json/ y vuelve a renderizar el documento.</p></div></section>`;
    }
    const items = reqPorCiuo.get(o.cod) ?? [];
    if (!items.length) {
      return `<section class="bloque">${cab(0)}<p class="vacio-seccion">No hay requisitos ENADEL registrados para esta ocupación.</p></section>`;
    }
    const max = items[0].n || 1;
    const lis = items.map((i) =>
      `<li><div class="fila-r"><span class="t">${esc(i.glosa)}</span><span class="n">${fmtN(i.n)}<span class="sr"> ${plural(Math.round(i.n), "mención", "menciones")}</span></span></div>` +
      `<span class="barra" aria-hidden="true"><i style="width:${Math.max(2, (i.n / max) * 100).toFixed(1)}%"></i></span></li>`).join("");
    return `<section class="bloque">${cab(items.length)}` +
      `<p class="nube-nota">Información extraída de la Encuesta Nacional de Demanda Laboral (ENADEL) 2025. Indica los requisitos que las empresas declaran solicitar para esta ocupación, ordenados de mayor a menor según el número de menciones. Las respuestas corresponden a opciones preestablecidas, con excepción de «Otros», que agrupa requisitos, licencias o certificaciones no contemplados entre las alternativas disponibles.</p>` +
      `<div class="req"><ol>${lis}</ol></div></section>`;
  }

  function htmlPerfil(p, abierto) {
    const vig = estadoVigencia(p.vigencia);
    const clas = p.clas.length
      ? `<table class="clas"><thead><tr><th scope="col">Sector</th><th scope="col">Subsector</th><th scope="col">Área productiva</th></tr></thead><tbody>` +
        p.clas.map((c) => `<tr><td>${esc(c.sector)}</td><td>${esc(c.subsector)}</td><td>${esc(c.area)}</td></tr>`).join("") + `</tbody></table>`
      : "";
    const comps = p.comps.length
      ? `<ul class="comps">${p.comps.map((c) => `<li>${esc(c.nombre)}<span class="ucl">${esc(c.cod)}</span></li>`).join("")}</ul>`
      : `<p class="vacio-seccion">Este perfil no tiene unidades de competencia registradas.</p>`;
    return `<details class="perfil"${abierto ? " open" : ""}>` +
      `<summary><span class="pn">${esc(p.nombre)}</span><span class="pm">` +
      `<span>${p.nivel ? "Nivel " + esc(p.nivel) : "Nivel no informado"}</span>` +
      `<span>${esc(p.modalidad || "Modalidad no informada")}</span>` +
      `<span class="${vig.vencido ? "venc" : ""}">${vig.vencido ? "Vencido el " : "Vigente hasta "}${esc(vig.txt)}</span></span></summary>` +
      `<div class="cuerpo">` +
      `<dl class="ficha">` +
      `<dt>Código del perfil</dt><dd>${esc(p.codigo)}</dd>` +
      `<dt>Código CIUO</dt><dd>${esc(p.ciuo)}</dd>` +
      `<dt>Código CIIU</dt><dd>${esc(p.ciiu || "No informado")}</dd>` +
      `<dt>Nivel de cualificación</dt><dd>${esc(p.nivel || "No informado")}</dd>` +
      `<dt>Modalidad</dt><dd>${esc(p.modalidad || "No informada")}</dd>` +
      `<dt>Vigencia</dt><dd>${esc(vig.txt)}${vig.vencido ? " (vencido)" : ""}</dd>` +
      `</dl>${clas}` +
      `<h5>Competencias del perfil<span class="cuenta">${p.comps.length}</span></h5>${comps}` +
      `</div></details>`;
  }

  function htmlPerfiles(o) {
    const n = o.perfiles.length;
    let cuerpo;
    if (n) cuerpo = o.perfiles.map((p, i) => htmlPerfil(p, i === 0)).join("");
    else cuerpo = `<p class="vacio-seccion">No existen perfiles ocupacionales asociados a esta ocupación</p>`;
    return `<section class="bloque" id="cv-perfiles"><h3>Perfiles ChileValora<span class="cuenta">${n}</span></h3>${cuerpo}</section>`;
  }

  function renderDetalle(o, foco) {
    const aviso = o.sinFicha
      ? `<p class="aviso">ChileValora usa el código ${esc(o.cod)}, pero ese código no existe en la CIUO cargada (primario.json). Revisa si hay un error de digitación en el perfil o una diferencia de versión del clasificador.</p>`
      : "";
    elDetalle.innerHTML = htmlArbol(o) +
      `<div class="titulo"><span class="codigo">${esc(o.cod)}</span><h2 tabindex="-1">${esc(o.glosa)}</h2></div>` +
      aviso + htmlDescripcion(o) + htmlPuestos(o) + htmlFuentes(o) + `<div class="par">` + htmlNube(o) + htmlRequisitos(o) + `</div>` + htmlPerfiles(o);
    if (foco) elDetalle.querySelector("h2")?.focus({ preventScroll: true });
  }

  function renderVacio() {
    const conPerfiles = ocupaciones.filter((o) => o.perfiles.length).length;
    elDetalle.innerHTML =
      `<div class="vacio"><h2>Elige una ocupación</h2>` +
      `<p>Escribe un código, el nombre de una ocupación, un puesto de trabajo o el nombre de un perfil, y selecciona un resultado de la lista para ver su ficha.</p>` +
      `<p class="cifras">${ocupaciones.filter((o) => !o.sinFicha).length} ocupaciones en la clasificación; ` +
      `${perfiles.length} perfiles de ChileValora asociados a ${conPerfiles} ${plural(conPerfiles, "ocupación", "ocupaciones")}.</p></div>`;
  }

  /* ---------- Selección y navegación ---------- */
  function marcarActual() {
    raiz.querySelectorAll("button.fila").forEach((b) =>
      b.setAttribute("aria-current", String(b.dataset.cod === state.sel)));
  }

  function seleccionar(cod, opts = {}) {
    const { empujar = true, foco = false, desdeLista = false } = opts;
    const o = porCod.get(cod);
    if (!o) return;
    state.sel = cod;
    marcarActual();
    renderDetalle(o, foco);
    if (empujar) OLT.hash.set(cod, { push: true });
    const fila = elLista.querySelector(`button.fila[data-cod="${cod}"]`);
    if (fila && !desdeLista) fila.scrollIntoView?.({ block: "nearest" });
    if (window.matchMedia && window.matchMedia("(max-width: 860px)").matches) {
      elDetalle.scrollIntoView?.({ behavior: movimientoReducido ? "auto" : "smooth", block: "start" });
    }
  }

  /* ---------- Eventos ---------- */
  raiz.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b || !raiz.contains(b)) return;
    if (b.dataset.cod) seleccionar(b.dataset.cod, { desdeLista: true });
    else if (b.dataset.ir) seleccionar(b.dataset.ir, { foco: true });
    else if (b.dataset.filtro) {
      inputQ.value = b.dataset.filtro;
      renderLista();
      elLista.scrollTop = 0;
    }
  });

  elDetalle.addEventListener("toggle", (ev) => {
    const d = ev.target;
    if (!(d instanceof HTMLDetailsElement) || !d.open) return;
    elDetalle.querySelectorAll("details.perfil[open]").forEach((o) => { if (o !== d) o.open = false; });
  }, true);

  inputQ.addEventListener("input", renderLista);
  chkSolo.addEventListener("change", renderLista);
  chkPrio.addEventListener("change", renderLista);
  inputQ.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") {
      const f = elLista.querySelector("button.fila");
      if (f) { ev.preventDefault(); f.focus(); }
    } else if (ev.key === "Enter") {
      const f = elLista.querySelector("button.fila");
      if (f) { ev.preventDefault(); seleccionar(f.dataset.cod, { desdeLista: true }); }
    }
  });
  elLista.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    const filas = [...elLista.querySelectorAll("button.fila")];
    const i = filas.indexOf(document.activeElement);
    if (i < 0) return;
    ev.preventDefault();
    if (ev.key === "ArrowUp" && i === 0) { inputQ.focus(); return; }
    filas[Math.min(Math.max(i + (ev.key === "ArrowDown" ? 1 : -1), 0), filas.length - 1)].focus();
  });
  OLT.hash.onChange((cod) => {
    if (porCod.has(cod)) seleccionar(cod, { empujar: false });
  });

  /* ---------- Inicio ---------- */
  if (!ocupaciones.length) {
    elDetalle.innerHTML = `<p class="aviso">No se encontraron datos. Revisa que existan los archivos JSON en data/json/ y vuelve a renderizar el documento.</p>`;
    return;
  }
  elPie.textContent = "Datos generados a partir del Clasificador Chileno de Ocupaciones (CIUO-08) y del catálogo de perfiles ocupacionales de ChileValora. Se incluyen, como información complementaria, menciones de puestos de trabajo y tareas provenientes de CASEN 2024 y ENADEL 2025, así como competencias demandadas reportadas en la plataforma SABE de SENCE. Esta información adicional está disponible únicamente para las ocupaciones clasificadas en las categorías Alta o Media del Índice de Priorización de Demanda Laboral (IPD) para la región de Tarapacá, elaborado en el marco de la Asistencia Técnica a SENCE desarrollada por este Observatorio Laboral. La vinculación entre ocupaciones, perfiles y competencias se realiza mediante el código CIUO de cuatro dígitos."; 
  // Si la tipografía web carga después del primer dibujo, se recalcula la nube
  document.fonts?.ready.then(() => {
    cacheNube.clear();
    const o = state.sel && porCod.get(state.sel);
    if (o) renderDetalle(o, false);
  });
  renderLista();
  const inicial = OLT.hash.get();
  if (porCod.has(inicial)) seleccionar(inicial, { empujar: false });
  else renderVacio();
})();
