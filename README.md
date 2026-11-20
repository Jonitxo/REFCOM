# Referencias por modelo

Consulta rápida de referencias de piezas por serie y modelo de equipo, pensada para el móvil: el técnico encuentra la referencia y la pide sin abrir el despiece. Todo el equipo consulta; solo quien tenga permiso de escritura en este repositorio puede actualizar los datos.

## Estructura de los datos

**Serie** (METIS MF4) → **Modelo** (IM C2010 · código D0DY) → **Piezas** agrupadas por sistema (PCU, Reveladoras K/C/M/Y, Fusión…).

- **Categoría** de la serie (p. ej. «MULTIFUNCION COLOR»): etiqueta para filtrar en la pantalla de inicio.
- **Franja** del modelo (Alta, Media, Baja): etiqueta con color en la fila del modelo.
- **Despiece**: enlace por modelo; si un modelo no tiene, se usa el de su serie.
- Una pieza se asigna a modelos concretos o a una serie entera (incluye los modelos que se añadan después).
- **Común a toda la serie**: piezas de tipo marcado como «Común» que cubren todos los modelos de la serie; se muestran una sola vez.
- **Origen**: si los 4 primeros caracteres de una referencia coinciden con el código de un modelo (D0DZ2205 → IM C2510), se indica como modelo de origen y, al dar de alta, se sugiere asignarla. Es un patrón observado en los datos, no una regla documentada; la asignación siempre la decide el editor.

Los datos de versiones anteriores (familia > serie > franja/grupo) se convierten solos al cargarlos; el archivo se guarda en el formato nuevo en la siguiente publicación.

## Contenido del repositorio

| Archivo | Función |
|---|---|
| `index.html` | Estructura de la página. |
| `css/app.css` | Estilos (móvil primero). |
| `js/app.js` | Rutas, pintado y eventos. |
| `js/views.js` | Pantallas: inicio, serie, modelo, referencia, búsqueda, vista general, inventario, revisión. |
| `js/forms.js` | Formularios del editor, importación y exportación, publicación. |
| `js/store.js` | Modelo de datos, migraciones e índices. |
| `js/github.js` | Carga de `data.json`, sesión con token y publicación. |
| `js/inv.js` | Inventario personal (solo en el dispositivo). |
| `js/toner.js` | Stock de seguridad de tóner: vista, edición, recuento, pedido y exportación a Excel. |
| `js/img.js` | Compresión, recorte, nombres y cola de fotos pendientes (IndexedDB). |
| `js/idb.js` | Almacén clave-valor en IndexedDB para el borrador del editor. |
| `img/` | Fotos publicadas (se crea al publicar la primera). |
| `js/xls.js` | Visor de Excel y vistas por cabeceras. |
| `js/stock.js` | Importación, edición y exportación del stock rule (.xlsx). |
| `js/vendor/jszip.min.js` | JSZip 3.10.1 (MIT), para leer y escribir el .xlsx en el navegador. Se carga solo en la pantalla de stock rule. |
| `js/util.js` | Utilidades comunes. |
| `data.json` | Los datos. Es lo único que cambia al publicar. |
| `sw.js`, `manifest.webmanifest`, iconos | App instalable y consulta sin conexión. |
| `tools/validar.mjs`, `.github/workflows/validar.yml` | Validación automática de `data.json` en cada cambio. |
| `package.json` | Solo indica a Node que los `.js` son módulos (para la validación). |

Sin dependencias ni compilación. Para probar en local hace falta un servidor (los módulos JavaScript no funcionan abriendo el archivo desde el disco): `python3 -m http.server` y abrir `http://localhost:8000`.

## Publicación (una sola vez)

1. Crea un repositorio en GitHub (por ejemplo `referencias-piezas`).
2. Sube todos los archivos y carpetas a la raíz del repositorio (Add file → Upload files).
3. En el repositorio: Settings → Pages → Build and deployment → Source: *Deploy from a branch* → Branch: `main` y carpeta `/ (root)` → Save.
4. Tras unos instantes, la web queda en `https://USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`. Comparte esa dirección con el equipo.

### Privacidad

- En GitHub Pages, la web es accesible desde Internet para cualquiera que conozca la dirección. Solo las organizaciones en GitHub Enterprise Cloud pueden publicar sitios privados, limitados a quienes tengan acceso de lectura al repositorio ([documentación](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/about-privately-published-github-pages-sites)).
- Si el repositorio es público, también lo es `data.json`, con todas las referencias. Valora si esa información puede ser pública antes de publicarla.
- La página incluye `noindex` para pedir a los buscadores que no la indexen. No es una medida de seguridad.

## Dar acceso de edición

La edición se controla con GitHub, no con contraseñas de la página. Cada editor necesita:

1. Una cuenta de GitHub con permiso de escritura en el repositorio (Settings → Collaborators, o equipo de la organización).
2. Un token de acceso personal limitado a este repositorio:
   - GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
   - Repository access: *Only select repositories* → este repositorio.
   - Permissions → Repository permissions → **Contents: Read and write**.
   - Fecha de caducidad a tu criterio. Copia el token (empieza por `github_pat_`); GitHub no vuelve a mostrarlo.

El token no se guarda en ningún servidor: solo en el navegador de quien lo introduce.

## Uso diario (equipo)

- **Inicio**: series como tarjetas, con filtro por categoría, favoritos y recientes. Serie → lista de modelos con código → modelo.
- **Modelo**: piezas en tarjetas por sistema, con salto rápido entre sistemas. Tocar la referencia la copia. «+ Pedir» y «+ Tengo» la añaden al inventario personal. «Despiece» abre el enlace.
- **Buscar**: referencia, modelo, código o tipo; ignora mayúsculas, acentos, espacios y guiones. Varias palabras se combinan (`c2010 fusor`). Atajos de teclado: `/` o Ctrl+K.
- **Mis series**: cada técnico elige las series que atiende («Elegir mis series»). Inicio, General y Técnico muestran solo esas, con «Todas» a un toque. Se guarda en el dispositivo.
- **Sustituciones**: si una referencia fue reemplazada, buscar la antigua lleva a la vigente y la antigua muestra «sustituida por …» (también en el inventario).
- **Técnico**: códigos SC (causas posibles, solución y piezas relacionadas) y consultas (procedimientos como el acceso a modo SP). Cada modelo muestra al final las que le aplican. La búsqueda encuentra «SC542» o «542».
- **Avisar de un error**: en modelos, referencias, entradas técnicas y búsquedas sin resultado. Abre un correo al responsable con el contexto escrito o, si no hay correo configurado, lo comparte o copia para Teams.
- **Productos de limpieza**: apartado propio (inicio → «Productos de limpieza») con referencia, nombre, nota y foto; buscables, copiables y con «+ Pedir». El editor los añade uno a uno o pegando una lista «REFERENCIA ; nombre» (o dos columnas de Excel).
- **Fotos**: cada referencia (pieza o producto de limpieza) puede tener una foto. Se ve en miniatura en las tarjetas y grande en el detalle; se guarda en el móvil al verla, para consultarla sin conexión.
- **Tóner** (stock de seguridad por delegación): una pestaña por delegación con el número de referencias a reponer; agrupado por modelo con una fila por color K/C/M/Y, stock actual frente a necesario con barra, «Reponer N» calculado al momento, filtro «Solo a reponer» y búsqueda por modelo o código EDP (los modelos del catálogo quedan enlazados). «Fijar como mi delegación» abre siempre la suya en ese dispositivo. «Pedido de reposición» comparte o copia la lista de lo que falta; «Exportar Excel» genera el archivo con una hoja por delegación y las mismas columnas que el actual (REPONER como fórmula). Solo el editor modifica: − / + del stock actual, editar fila (códigos, color, necesario, nota), añadir y borrar filas, delegaciones (con copia de filas de otra) y **Recuento**: se escribe lo contado, se revisan las diferencias y se guarda la fecha del último recuento. «Importar Excel» carga el archivo actual (hojas visibles; sustituye las delegaciones con el mismo nombre). Los cambios se comparten con «Publicar».
- **Excel**: abre cualquier .xlsx (o .csv) compartido y lo muestra en tarjetas: elección de hoja (las ocultas, aparte), búsqueda, filtro por columna, agrupación, teléfonos y correos que se pulsan, «Cómo llegar» con las columnas de dirección, referencias del catálogo enlazadas y vista de tabla en pantallas anchas. «Ajustar vista» define título, subtítulo, campos principales, ocultos, agrupación, orden y una condición para destacar filas (p. ej. «A reponer» si REPONER > 0); se guarda por cabeceras y se aplica sola a los archivos con las mismas columnas. El editor puede publicarla para todo el equipo (solo la estructura, nunca los datos). Incluye vistas para el stock de seguridad de tóner y el listado de máquinas. El archivo se procesa en el dispositivo; los 3 últimos (hasta 3 MB) se guardan en el navegador para reabrirlos. En Android, con la web instalada como app, aparece en «Compartir» de Teams o del gestor de archivos. Límites: no recalcula fórmulas (muestra el último valor guardado), no ejecuta macros, no abre .xls antiguos ni archivos con contraseña.
- **Cómo se usa**: guía rápida para el técnico, enlazada desde el inicio (`#/ayuda`).
- **Stock rule** (Mi inventario → Stock rule): importa el Excel de reposición automática del técnico. Lista con todas las referencias: «Eliminar» (rojo), cambiar cantidad con − / + (amarillo, con la nota «Quitar N, dejar M» en la columna L) y añadir referencias nuevas (verde, al final). «Generar Excel» crea `<nombre>_cambios.xlsx` con el mismo formato, columnas y estilos, para enviarlo al jefe de equipo (en el móvil abre el menú de compartir). Las marcas de color que ya tenga el archivo se respetan al importarlo. «Añadir todo a Tengo» pasa al inventario personal las referencias que quedan activas. El archivo y los cambios se guardan solo en ese dispositivo.
- **General**: todos los modelos con sus referencias en una pantalla, por serie plegable.
- **Serie**: vistas «Modelos», «Resumen» y «Matriz» (la matriz es para pantallas anchas). Exportar CSV.
- **Mi inventario**: listas Tengo / Pedir / Devolver con cantidades. En «Tengo», uso habitual u ocasional. «Recibida» pasa una pieza de Pedir a Tengo. «Compartir lista» abre el menú de compartir del móvil (o copia el texto) para enviarlo por Teams. Se guarda solo en ese dispositivo: si se borran los datos del navegador se pierde, por eso existe «Exportar copia».
- Favoritos, recientes, vista preferida e inventario se guardan en el navegador de cada dispositivo y no se sincronizan. La primera vez que hay algo que solo vive en el dispositivo (inventario, stock rule, borrador), la web pide al navegador almacenamiento persistente para que no lo borre solo cuando falta espacio; el navegador puede concederlo o no, y «Exportar copia» sigue siendo la protección real.
- Instalable como app desde el navegador (HTTPS). Sin conexión muestra la última versión cargada. Los datos nuevos se cargan solos al volver a la app y cada 5 minutos, con petición condicional: si `data.json` no ha cambiado, no se descarga de nuevo.

## Edición


1. «Acceso» → `usuario/repositorio` y token. «Recordar en este dispositivo» conserva el token.
2. Botón «Editar» (barra inferior en móvil, arriba en escritorio): + Pieza, + Varias, + Modelo, + Serie, Importar tabla, Tipos de pieza, Revisión, Exportar, Deshacer (también Ctrl+Z, hasta 40 pasos; cada paso guarda solo lo que cambió).
3. En cada serie y modelo aparecen «Editar», «+ Modelo» y «+ Pieza» con el destino ya marcado. Al editar una serie se ordena su lista de modelos.
4. Los cambios quedan como borrador en el navegador («Sin publicar»), en IndexedDB, que no tiene el límite de unos 5 MB de localStorage (si IndexedDB no está disponible se usa localStorage). Se escribe medio segundo después del último cambio y al salir de la página o pasar a segundo plano. «Publicar» muestra el resumen y guarda `data.json` con un commit. GitHub Pages tarda un momento en reflejarlo.
5. «Revisión» lista incidencias. Referencias duplicadas y tipos inexistentes bloquean la publicación.

**Sustituciones**: en la pieza vigente, campo «Sustituye a» con las referencias anteriores separadas por coma.

**Técnico**: «Editar» → «+ SC / consulta», o en la pestaña Técnico «Importar tabla» con cabecera Tipo (SC o Consulta), Código, Título, Serie, Modelo, Causas, Solución, Piezas, Notas. En Causas y Solución, cada línea de la celda (Alt+Intro en Excel) es un punto. Sin serie ni modelo, la entrada aplica a todos los equipos. «Exportar CSV» devuelve el mismo formato. El contenido técnico lo introduce el editor; la herramienta no trae datos de SC.

**Cargar el catálogo desde Excel**: en el visor de Excel (o en Stock rule) el editor tiene «Añadir al catálogo». Se elige la columna de referencia (o se extrae de «DESCRIPCIÓN (REF)»), descripción, modelo y tipo; sin modelo, la referencia se asigna al modelo cuyo código coincide con su prefijo o queda en «Sin asignar». Solo añade o amplía, y se puede deshacer hasta publicar.

**Fotos (editor)**: en el formulario de la pieza o del producto, «Hacer o elegir foto» (cámara o galería), pegar con Ctrl+V o arrastrar. Se quitan solos los márgenes uniformes de las capturas; «Recortar a mano» permite arrastrar un recuadro. Al guardar, la foto se comprime en el navegador y se nombra con la referencia (`img/D0E33060.webp`); si cambia la referencia, la foto se renombra. «Fotos en bloque» asigna varias imágenes llamadas como la referencia. Las fotos quedan pendientes en el dispositivo y se suben con «Publicar» en un único commit junto con `data.json`; las que se quitan se borran del repositorio.

Compresión: lado mayor de 640 px como máximo (nunca amplía), WebP con calidad 0,80 y búsqueda de la calidad máxima que cabe en 40 KB (si ni con 0,45 cabe, se reduce el tamaño); JPEG si el navegador no genera WebP. Se respeta la orientación de la cámara y la transparencia pasa a fondo blanco. Parámetros elegidos midiendo tamaño y similitud estructural (SSIM) con fotos de 12 MP y capturas: en WebP la calidad 0,80 es el punto a partir del cual cada mejora visible casi duplica el tamaño. Resultado típico: 5–35 KB por foto (de 1–2 MB originales). Las fotos de iPhone en HEIC se deben hacer desde la propia web o convertir a JPG si el navegador no las abre. Repositorio público: las fotos son visibles para cualquiera con la dirección; no deben aparecer datos de clientes.

**Correo de avisos**: «Editar» → «Correo de avisos». Se publica en `data.json`, visible para quien abra la web.

**Importar tabla**: columnas reconocidas por cabecera: Serie, Categoría, Modelo, Códigos, Plataforma, Franja, Despiece, Tipo, Referencia, Descripción, Uso, Notas, Verificar, Sustituye a (formato de «Exportar CSV»; «Familia» se acepta como Categoría). Solo añade o amplía.

**Varios editores**: si dos personas editan a la vez, la primera en publicar gana; a la segunda no se le sobrescribe nada y se le ofrece descargar su versión.

**Modo local** (en `localhost`): edición sin GitHub; «Descargar data.json» para subirlo a mano.

## Límites de GitHub Pages

Según la documentación de GitHub: sitio publicado de hasta 1 GB, límite orientativo de 100 GB de transferencia al mes y 10 compilaciones por hora ([GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). Un inventario de referencias queda muy por debajo.

## Copia de seguridad

El historial de commits conserva cada versión de `data.json` (Editar → «Historial de publicaciones»). Para una copia adicional: Editar → Exportar JSON. Al actualizar la aplicación, no sobrescribas `data.json` con uno vacío.
