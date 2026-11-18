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
- **General**: todos los modelos con sus referencias en una pantalla, por serie plegable.
- **Serie**: vistas «Modelos», «Resumen» y «Matriz» (la matriz es para pantallas anchas). Exportar CSV.
- **Mi inventario**: listas Tengo / Pedir / Devolver con cantidades. En «Tengo», uso habitual u ocasional. «Recibida» pasa una pieza de Pedir a Tengo. «Compartir lista» abre el menú de compartir del móvil (o copia el texto) para enviarlo por Teams. Se guarda solo en ese dispositivo: si se borran los datos del navegador se pierde, por eso existe «Exportar copia».
- Favoritos, recientes, vista preferida e inventario se guardan en el navegador de cada dispositivo y no se sincronizan.
- Instalable como app desde el navegador (HTTPS). Sin conexión muestra la última versión cargada. Los datos nuevos se cargan solos al volver a la app y cada 5 minutos.

## Edición

1. «Acceso» → `usuario/repositorio` y token. «Recordar en este dispositivo» conserva el token.
2. Botón «Editar» (barra inferior en móvil, arriba en escritorio): + Pieza, + Varias, + Modelo, + Serie, Importar tabla, Tipos de pieza, Revisión, Exportar, Deshacer (también Ctrl+Z, 40 pasos).
3. En cada serie y modelo aparecen «Editar», «+ Modelo» y «+ Pieza» con el destino ya marcado. Al editar una serie se ordena su lista de modelos.
4. Los cambios quedan como borrador en el navegador («Sin publicar»). «Publicar» muestra el resumen y guarda `data.json` con un commit. GitHub Pages tarda un momento en reflejarlo.
5. «Revisión» lista incidencias. Referencias duplicadas y tipos inexistentes bloquean la publicación.

**Importar tabla**: columnas reconocidas por cabecera: Serie, Categoría, Modelo, Códigos, Plataforma, Franja, Despiece, Tipo, Referencia, Descripción, Uso, Notas, Verificar (formato de «Exportar CSV»; «Familia» se acepta como Categoría). Solo añade o amplía.

**Varios editores**: si dos personas editan a la vez, la primera en publicar gana; a la segunda no se le sobrescribe nada y se le ofrece descargar su versión.

**Modo local** (en `localhost`): edición sin GitHub; «Descargar data.json» para subirlo a mano.

## Límites de GitHub Pages

Según la documentación de GitHub: sitio publicado de hasta 1 GB, límite orientativo de 100 GB de transferencia al mes y 10 compilaciones por hora ([GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). Un inventario de referencias queda muy por debajo.

## Copia de seguridad

El historial de commits conserva cada versión de `data.json` (Editar → «Historial de publicaciones»). Para una copia adicional: Editar → Exportar JSON. Al actualizar la aplicación, no sobrescribas `data.json` con uno vacío.
