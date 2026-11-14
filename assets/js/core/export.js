// Generación de archivos en el navegador, sin librerías: .xlsx, PNG a partir de SVG y descarga.
window.OLT = window.OLT || {};
OLT.export = (() => {
  "use strict";

  /* ---------- Excel (.xlsx) ---------- */
  const XML_ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
  const xesc = (t) => String(t ?? "").replace(/[&<>]/g, (ch) => XML_ESC[ch]);
  // 0 -> A, 25 -> Z, 26 -> AA
  const colLetra = (i) => { let s = ""; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

  // Estilos disponibles para las celdas
  const ESTILO = { normal: 0, encabezado: 1, entero: 2, porcentaje: 3, fecha: 4 };

  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

  // ZIP sin compresión (método "store"), suficiente para un .xlsx
  function crearZip(archivos) {
    const enc = new TextEncoder();
    const u16 = (n) => [n & 255, (n >>> 8) & 255];
    const u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    const locales = [], centrales = [];
    let desplazamiento = 0;
    for (const a of archivos) {
      const nombre = enc.encode(a.nombre), datos = enc.encode(a.contenido);
      const crc = crc32(datos), tam = datos.length;
      const cab = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
        ...u32(crc), ...u32(tam), ...u32(tam), ...u16(nombre.length), ...u16(0)]);
      locales.push(cab, nombre, datos);
      centrales.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
        ...u32(crc), ...u32(tam), ...u32(tam), ...u16(nombre.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(desplazamiento)]), nombre);
      desplazamiento += cab.length + nombre.length + tam;
    }
    const tamCentral = centrales.reduce((n, x) => n + x.length, 0);
    const fin = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(archivos.length), ...u16(archivos.length),
      ...u32(tamCentral), ...u32(desplazamiento), ...u16(0)]);
    return new Blob([...locales, ...centrales, fin], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  // Índices de estilo = ESTILO: 0 normal, 1 negrita, 2 entero con miles, 3 porcentaje 0,0 %, 4 fecha aaaa-mm
  const ESTILOS = XML + `<styleSheet ${NS}>` +
    `<numFmts count="2"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="yyyy\-mm"/></numFmts>` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="5">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  // Celda: null/undefined = vacía; texto o número directo; o { v, est } con un valor de ESTILO
  const celdaXml = (ref, c) => {
    if (c == null) return "";
    const { v, est = 0 } = typeof c === "object" ? c : { v: c };
    if (v == null) return "";
    return typeof v === "number"
      ? `<c r="${ref}" s="${est}"><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"${est ? ` s="${est}"` : ""}><is><t>${xesc(v)}</t></is></c>`;
  };

  const hojaXml = (h) => {
    const filas = h.filas.map((fila, i) =>
      `<row r="${i + 1}">${fila.map((c, j) => celdaXml(colLetra(j) + (i + 1), c)).join("")}</row>`).join("");
    const vistas = h.congelarEncabezado
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
    const cols = h.anchos?.length
      ? `<cols>${h.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    return XML + `<worksheet ${NS}>${vistas}${cols}<sheetData>${filas}</sheetData></worksheet>`;
  };

  // hojas: [{ nombre, filas: [[celda, ...], ...], anchos?: [n, ...], congelarEncabezado?: bool }]
  // Devuelve un Blob .xlsx. En cada fila, la celda j va en la columna j (A, B, ...), en orden.
  function xlsx(hojas) {
    const idx = hojas.map((_, i) => i + 1);
    const CT = "application/vnd.openxmlformats-officedocument.spreadsheetml";
    return crearZip([
      { nombre: "[Content_Types].xml", contenido: XML + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/>` +
        idx.map((i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="${CT}.worksheet+xml"/>`).join("") +
        `<Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/></Types>` },
      { nombre: "_rels/.rels", contenido: XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { nombre: "xl/workbook.xml", contenido: XML + `<workbook ${NS} xmlns:r="${REL}"><sheets>` +
        hojas.map((h, i) => `<sheet name="${xesc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + `</sheets></workbook>` },
      { nombre: "xl/_rels/workbook.xml.rels", contenido: XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        idx.map((i) => `<Relationship Id="rId${i}" Type="${REL}/worksheet" Target="worksheets/sheet${i}.xml"/>`).join("") +
        `<Relationship Id="rId${hojas.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>` },
      { nombre: "xl/styles.xml", contenido: ESTILOS },
      ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: hojaXml(h) }))
    ]);
  }

  /* ---------- PNG a partir de un SVG ---------- */
  // Devuelve una promesa con el Blob PNG. ancho y alto son los del SVG; escala multiplica la resolución.
  const svgAPng = (svg, ancho, alto, escala = 2) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = ancho * escala; cv.height = alto * escala;
      const cx = cv.getContext("2d");
      cx.fillStyle = "#ffffff"; cx.fillRect(0, 0, cv.width, cv.height);
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar el PNG"))), "image/png");
    };
    img.onerror = () => reject(new Error("No se pudo cargar el SVG"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });

  /* ---------- Descarga ---------- */
  function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  return { ESTILO, xlsx, svgAPng, descargarBlob };
})();
