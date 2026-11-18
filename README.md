# Referencias por modelo

Herramienta web de consulta de referencias de piezas por modelo de equipo, organizada por familia, serie y franja. Todo el equipo la consulta desde el navegador; solo quien tenga permiso de escritura en este repositorio puede actualizarla.

## Contenido del repositorio

| Archivo | Función |
|---|---|
| `index.html` | La aplicación completa (un solo archivo, sin dependencias). |
| `data.json` | Los datos: tipos de pieza, modelos, series, franjas y referencias. Es lo que se actualiza. |
| `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png` | App instalable (PWA) y consulta sin conexión. |
| `.nojekyll` | Indica a GitHub Pages que sirva los archivos tal cual. |

## Publicación (una sola vez)

1. Crea un repositorio en GitHub (por ejemplo `referencias-piezas`).
2. Sube los tres archivos a la raíz del repositorio (Add file → Upload files).
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

## Uso diario

**Consulta (todo el equipo):** abrir la dirección web. Navegar por familia → serie → modelo, o buscar una referencia, modelo o código. Clic en una referencia: se copia y se muestran los modelos donde aplica.

**Edición:**
1. Pulsar *Acceso editor* e introducir `usuario/repositorio` y el token. *Recordar en este navegador* conserva el token entre sesiones; sin marcar, se borra al cerrar la pestaña.
2. Crear series (con familia y franjas), modelos y piezas. Cada celda vacía de la matriz tiene un botón «+» para añadir la referencia con el tipo y el modelo ya rellenos. Ajustes → Tipos de pieza define las columnas, los colores K/C/M/Y y las piezas comunes de serie.
3. Los cambios se guardan como borrador en el navegador y aparece «Cambios sin publicar». Pulsar **Publicar** para guardarlos en `data.json` mediante un commit. GitHub tarda un momento en actualizar la web.

Cada publicación es un commit con historial completo: se puede ver quién cambió qué y volver a una versión anterior desde GitHub.

### Varios editores

Si dos personas editan a la vez, la primera en publicar gana. A la segunda, la herramienta le avisa de que hay cambios publicados que no tiene, no sobrescribe nada y le ofrece descargar su versión como copia JSON. Tras recargar, debe volver a aplicar sus cambios sobre la versión publicada.

## Otras funciones

- **Exportar JSON / CSV, Importar JSON:** en Ajustes. Importar reemplaza el inventario en edición y requiere publicar después.
- **Descartar cambios sin publicar:** en Ajustes, vuelve a la versión publicada.
- **Modo local:** abriendo `index.html` directamente desde el disco, o en `localhost`, el acceso de editor ofrece un modo local sin GitHub. Publicar descarga `data.json` para subirlo manualmente al repositorio. Al abrir el archivo desde el disco, el navegador bloquea la lectura de `data.json`, por lo que la consulta solo funciona desde la web publicada.

- **Instalación y sin conexión:** desde la web publicada (HTTPS) el navegador ofrece instalarla como app. Sin conexión muestra la última versión visitada.
- **Enlaces directos:** la dirección refleja modelo, serie, referencia y búsqueda; «Copiar enlace» comparte la vista exacta.
- **Búsqueda tolerante:** ignora mayúsculas, acentos, espacios y guiones; varios términos se combinan (modelo + referencia).
- **Favoritos y recientes:** se guardan en el navegador de cada dispositivo (localStorage), no se sincronizan.
- **Actualización automática:** los visores recargan `data.json` al volver a la pestaña y cada 5 minutos.
- **Deshacer:** botón o Ctrl+Z en modo editor (40 pasos, hasta publicar).
- **Importar tabla:** Ajustes → Importar tabla; admite pegar desde Excel o CSV, y el formato de «Exportar CSV».
- **Clonar modelo, edición desde cada celda (+), panel «Revisión»:** duplicados de códigos, formatos inusuales, piezas sin asignar o por verificar.
- **Impresión / PDF:** botón «Imprimir / PDF» en series y modelos (horizontal, con colores).
- **Historial:** el enlace del pie apunta a `commits/main/data.json`; si la rama por defecto no es `main`, ajusta la dirección.

## Límites de GitHub Pages

Según la documentación de GitHub: sitio publicado de hasta 1 GB, límite orientativo de 100 GB de transferencia al mes y 10 compilaciones por hora ([GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). Un inventario de referencias queda muy por debajo.

## Copia de seguridad

El historial de commits conserva cada versión. Para una copia adicional, usa *Exportar JSON* en Ajustes o descarga `data.json` del repositorio.
