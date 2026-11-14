# Registro de cambios desde la migración

Cambios hechos desde que se creó `Pagina web/` a partir del proyecto `ENE/` (que se conserva intacto
con su `app.R` Shiny). Los commits corresponden al historial de git de esta carpeta.

## 1. Creación de la carpeta y migración inicial
1. Se creó `Pagina web/` como carpeta hermana de `ENE/`, con `git init` independiente.
2. Se copiaron (sin mover) `modulo_portada.qmd`, `modulo_ene.qmd` y `modulo_ocupaciones.qmd` como
   `index.qmd`, `indicadores.qmd` y `ocupaciones.qmd`.
3. Se copiaron a `data/json/` los 10 JSON que usan los módulos (~6,4 MB).
4. Se guardaron como línea base los 3 HTML anteriores en `_baseline/` (no se versiona).

## 2. Sitio Quarto con navbar (commit `ca114ae`)
5. Se creó `_quarto.yml`: proyecto `website`, salida en `_site/`, navbar de 3 páginas, pie único,
   tema `cosmo` + `assets/scss/visor.scss` (colores y tipografía del visor) y `page-layout: custom`.
6. Se quitó el bloque `format:` del YAML de cada página (ahora lo hereda del proyecto).
7. Portada: se eliminó el `postMessage` al shell Shiny, los `data-destino` y el pie propio; los botones
   son enlaces normales a `indicadores.html` y `ocupaciones.html`; se actualizó el comentario inicial.
8. Se creó `.gitignore` (`_site/`, `.quarto/`, temporales de R).
9. El sitio sustituye a `app.R`: ya no hay iframes ni servidor Shiny.

## 3. Arreglos de compatibilidad con Bootstrap
10. Ocupaciones (`481d1fd`): el `<aside>` del buscador quedaba desplazado a la derecha porque Quarto
    manda todos los `<aside>` a la columna lateral. Se sustituyó por `<div role="complementary">` y se
    ajustó el `sticky` y la altura del panel para descontar el navbar fijo.
11. Encabezados (`eb347e2`): se añadió a `visor.scss` un reset, acotado a `#ene` y `#cv`, del borde
    y relleno inferior de `h2` y de la opacidad de `h3` y `h4` (estilos globales de Bootstrap y Quarto).

## 4. Extracción de CSS y JS inline (`d9e5df4`)
12. El `<style>` de cada página pasó a `assets/css/pages/{portada,ene,ocupaciones}.css`, cargado con
    `css:` en el YAML de la página.
13. El `<script>` de cada página pasó a `assets/js/pages/{portada,ene,ocupaciones}.js`, con un
    `<script src>` en el mismo lugar. Se declaró `assets/js/**` como recurso del proyecto.
14. Los `<link>` de Google Fonts pasaron a `_includes/head.html`, cargado para todo el sitio.
15. Se verificó que el CSS y el JS extraídos son idénticos al contenido inline anterior.
16. Se actualizaron los comentarios de los `.qmd` (ya no son «un solo archivo con doble clic»).

## 5. Tokens y componentes CSS compartidos (`c1e583a`)
17. Se compararon las variables CSS de los tres módulos: los valores eran idénticos; solo variaba qué
    subconjunto declaraba cada uno.
18. `assets/css/tokens.css`: variables en `:root` (unión de todas), más tokens nuevos para valores
    repetidos (`--rojo-claro`, `--linea-suave`, `--borde-control`, `--texto-deshabilitado`, `--font-base`).
19. `assets/css/components.css`, colgado de la clase `.visor`: tipografía base, `box-sizing`, reseteo de
    `button` y `select`, `.sr`, cabecera `.cab`, `.aviso` y `footer`.
20. Se añadió la clase `.visor` a los contenedores raíz (`#pt`, `#ene`, `#cv`) y `.cab` a las cabeceras.
    Se limpiaron de los CSS de página las reglas movidas y se sustituyeron los literales repetidos por tokens.
21. `_quarto.yml` carga `tokens.css` y `components.css` para todo el sitio.
22. Se eliminó `body { background; margin }` de las páginas por ser redundante con el tema.

## 6. Utilidades JS compartidas (`45aba02`)
23. Nuevos `assets/js/core/util.js` (`OLT.util.esc`, `$`), `hash.js` (`OLT.hash.get/set/onChange`) y
    `medir.js` (`OLT.medir.ancho`).
24. `ene.js` y `ocupaciones.js` usan esas utilidades en lugar de sus copias duplicadas
    (escape HTML, `location.hash` e `history`, y medición de texto con canvas).
25. Los `.qmd` de indicadores y ocupaciones cargan los tres scripts de `core/` antes del de la página.
26. Se validó la sintaxis de los cinco archivos JS y se probó su lógica con stubs de navegador.

## 7. Verificación visual
27. Con `quarto preview` y un Chrome sin interfaz se comprobó: hash en indicadores y ocupaciones,
    etiquetas de los ejes, nube de competencias y ausencia de errores en consola.
    No se probaron a mano el botón atrás, el cambio de hash en vivo, el tooltip ni las exportaciones.

## 8. Publicación (commit `0b653e9`)
28. `netlify.toml`: publicación de `_site/`, redirecciones 301 de las URL antiguas
    (`modulo_*.html` a las páginas nuevas), cabeceras de caché y seguridad básica.
29. `.github/workflows/deploy.yml`: renderiza con Quarto y publica en Netlify (producción en push,
    vista previa en pull requests del mismo repo). Requiere los secretos `NETLIFY_AUTH_TOKEN` y `NETLIFY_SITE_ID`.
30. `.gitignore`: se añadieron `/_baseline/` y `/.netlify/`.
31. `README.md` y este registro.

## 9. Exportación a archivos (`assets/js/core/export.js`)
32. Se extrajo de `ene.js` la generación de Excel y PNG a `assets/js/core/export.js`: `OLT.export.xlsx(hojas)`
    (ZIP, CRC y XML del `.xlsx`, con hojas, estilos y anchos configurables), `svgAPng(svg, ancho, alto, escala)`
    (promesa con el Blob) y `descargarBlob`.
33. `envolver` (ajuste de texto en líneas) pasó a `OLT.medir.envolver`.
34. `ene.js` conserva solo lo propio del módulo: armar las filas desde `contexto()`, la hoja «Información»,
    el SVG del gráfico, el nombre de archivo y los mensajes. `indicadores.qmd` carga `export.js` antes de `ene.js`.
35. Se verificó: sintaxis, un `.xlsx` de prueba leído con `readxl`, y ambas descargas en la página real
    (Excel como ZIP válido, PNG con firma correcta y sin errores de consola).
    Diferencia: las columnas de fiabilidad del Excel se escriben ahora en orden de columna dentro de cada fila.

## 10. Redirecciones de URL antiguas
36. Se añadió `aliases:` a `index.qmd`, `indicadores.qmd` y `ocupaciones.qmd` (`modulo_portada.html`,
    `modulo_ene.html`, `modulo_ocupaciones.html`). Quarto genera páginas que redirigen por JavaScript,
    conservando hash y parámetros, y funcionan en cualquier hosting. Se probó con el hash en ENE y ocupaciones.
37. `netlify.toml`: las tres reglas de redirección llevan `force = true`, porque Netlify no aplica una
    redirección si ya existe un archivo con esa ruta; así en Netlify sigue prevaleciendo el 301 real.

## Estado final
- Sitio Quarto de 3 páginas con navbar, sin dependencia de R ni de Shiny.
- CSS y JS en `assets/`, con tokens, componentes y utilidades compartidas (incluida la exportación a archivos).
- El proyecto `ENE/` original no se modificó.
