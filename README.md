# Visor Interactivo (sitio Quarto)

Sitio estático del Observatorio Laboral de Tarapacá con tres páginas: portada, indicadores de la
Encuesta Nacional de Empleo (ENE) y catálogo de ocupaciones CIUO-08.CL. Se genera con Quarto
y se publica como archivos estáticos (Netlify u otro hosting). No requiere R ni servidor en producción.

| Página | Archivo fuente | URL |
|---|---|---|
| Inicio | `index.qmd` | `/` |
| Indicadores ENE | `indicadores.qmd` | `/indicadores.html` |
| Ocupaciones CIUO-08 | `ocupaciones.qmd` | `/ocupaciones.html` |

## Estructura

```
Pagina web/
├── _quarto.yml              # proyecto web: navbar, pie, tema, CSS y recursos globales
├── index.qmd                # portada
├── indicadores.qmd          # módulo ENE (HTML + datos incrustados)
├── ocupaciones.qmd          # módulo CIUO-08 (HTML + datos incrustados)
├── _includes/
│   └── head.html            # fuente Ubuntu (Google Fonts), común a todas las páginas
├── assets/
│   ├── scss/visor.scss      # tema Bootstrap (colores y tipografía base) + resets acotados
│   ├── css/
│   │   ├── tokens.css       # variables CSS (colores, tipografía): única fuente de verdad
│   │   ├── components.css   # base y componentes comunes, colgados de la clase .visor
│   │   └── pages/           # estilos propios de cada página (portada, ene, ocupaciones)
│   └── js/
│       ├── core/            # utilidades compartidas: util.js (esc, $), hash.js, medir.js, export.js (xlsx, PNG, descarga)
│       └── pages/           # lógica de cada página (portada, ene, ocupaciones)
├── data/json/               # JSON que se incrustan en el HTML al renderizar
├── netlify.toml             # publicación, redirecciones y cabeceras para Netlify
├── .github/workflows/       # render y despliegue automático
└── _site/                   # salida del render (no se versiona)
```

### Cómo se combinan los estilos

Orden de carga: tema Bootstrap (cosmo + `visor.scss`) → fuente → `tokens.css` → `components.css` →
CSS de la página. Cada módulo vive dentro de un contenedor con id propio (`#pt`, `#ene`, `#cv`) y la
clase `.visor`. Los estilos comunes cuelgan de `.visor` y los de página de su id, que tiene más
especificidad y puede sobrescribir los comunes.

Los colores y la tipografía se cambian solo en `assets/css/tokens.css`.

### Cómo se combinan los scripts

Son scripts clásicos (sin módulos ES). Los de `core/` cuelgan del espacio de nombres global `OLT`
(`OLT.util`, `OLT.hash`, `OLT.medir`, `OLT.export`). Cada página los carga antes de su propio script, al final del
contenido, después de los bloques de datos:

```html
<script src="assets/js/core/util.js"></script>
<script src="assets/js/core/hash.js"></script>
<script src="assets/js/core/medir.js"></script>
<script src="assets/js/core/export.js"></script>
<script src="assets/js/pages/ene.js"></script>
```

El orden importa: los scripts de `core/` van siempre antes que el de la página. `export.js` genera archivos sin
librerías: `OLT.export.xlsx(hojas)`, `OLT.export.svgAPng(svg, ancho, alto)` y `OLT.export.descargarBlob(blob, nombre)`;
lo usa solo el módulo de indicadores, y ocupaciones no lo carga.

## Requisitos

- [Quarto](https://quarto.org/docs/get-started/) (probado con 1.11.9).
- Para desplegar a mano: Node.js y la CLI de Netlify (`npm i -g netlify-cli`).

## Flujo de trabajo

```bash
quarto preview     # servidor local con recarga automática (http://localhost:4747 con --port 4747)
quarto render      # genera el sitio completo en _site/
```

- Los JSON de `data/json/` se incrustan en el HTML con `{{< include data/json/X.json >}}`. Si cambias
  un JSON, vuelve a renderizar.
- `assets/js/**` se declara como recurso en `_quarto.yml` para que Quarto lo copie a `_site/`.
- Añadir una página: crear el `.qmd`, agregarlo a `render:` y al `navbar` en `_quarto.yml`.
  Si lleva CSS o JS propio, declarar el CSS en su YAML (`format: html: css:`) y el script con un
  `<script src>` al final.
- Al editar un módulo, comprobar que sus estilos sigan acotados a su contenedor para no chocar con Bootstrap.
  Evitar etiquetas que Quarto restilice (por ejemplo `<aside>`, que Quarto manda a la columna lateral).

### Datos

Los JSON se generan fuera de este repositorio, con los scripts R del proyecto original (`ENE/`:
`ene_a_json.R`, `datos_a_json.R`, entre otros). Aquí solo se versionan los resultados (~6 MB).
Para actualizar datos: regenerar los JSON allí, copiarlos a `data/json/`, renderizar y publicar.

| JSON | Usado en |
|---|---|
| `ene_indicadores.json` | indicadores |
| `gran_grupo`, `subgrupo_ppal`, `subgrupo`, `primario`, `chilevalora`, `SABE`, `ENADEL`, `ciuo_casen`, `ciuo_enadel` | ocupaciones |

## Despliegue

`netlify.toml` publica `_site/`, redirige las URL antiguas (`/modulo_ene.html` → `/indicadores.html`, etc.)
y define cabeceras de caché.

### Opción A: manual

```bash
quarto render
netlify login
netlify link                         # una sola vez: enlazar con el sitio de Netlify
netlify deploy --prod --dir=_site
```

### Opción B: GitHub Actions

`.github/workflows/deploy.yml` renderiza con Quarto y publica: en producción al hacer push a
`main`/`master`, y como vista previa (`pr-<n>`) en los pull requests del mismo repositorio.

Configuración única:
1. Subir el repositorio a GitHub.
2. Crear un sitio en Netlify (sin conectar el repo) y copiar su Site ID.
3. Crear un token personal en Netlify.
4. En GitHub, Settings > Secrets and variables > Actions, crear `NETLIFY_AUTH_TOKEN` y `NETLIFY_SITE_ID`.

El workflow usa la última versión de Quarto y de la CLI de Netlify. Para un render reproducible,
fija ambas versiones en el archivo.

### Otros hostings

El sitio es estático: sirve cualquier hosting de archivos. Alternativas: Posit Connect Cloud
(`quarto publish` o Posit Publisher en Positron), Posit Connect (servidor propio), Quarto Pub,
GitHub Pages y Cloudflare Pages. `netlify.toml` solo aplica en Netlify; en otros hostings las URL
antiguas necesitan otra solución (por ejemplo `aliases:` en el YAML de las páginas).

## Pendientes conocidos

- Quarto emite el aviso «Unable to parse table from raw html block» al renderizar `indicadores` y
  `ocupaciones`. No afecta al resultado, pero no se investigó su origen.
- Los datos anuales (`ene_indicadores_anuales.json`) no están integrados en el módulo de indicadores.
- La fuente se carga desde Google Fonts. Autoalojarla evitaría la dependencia externa y las diferencias
  de medición de texto sin conexión.
