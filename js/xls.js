// Visor de Excel: abre cualquier .xlsx en el navegador y lo muestra en tarjetas legibles en el móvil.
// El archivo se procesa en el dispositivo y no se sube a ningún sitio.
// Plantillas: describen cómo mostrar un tipo de archivo (por sus cabeceras), nunca sus datos.

import { $, $$, esc, nrm, cmp, lsGet, lsSet, lsDel, parseTable, colNum, siText, walkCells, cellRef, decodeText } from './util.js';
import { st, save, partByRef, modelByName } from './store.js';
import { loadZip } from './stock.js';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const KEY = 'refcom_xls_recent', KTPL = 'refcom_tpl_local';
const MAX_KEEP = 3 * 1024 * 1024; // no se guardan archivos mayores de ~3 MB

/* ================= lectura del .xlsx ================= */

const parseXml = t => new DOMParser().parseFromString(t, 'application/xml');
const kids = (el, name) => (el ? [...el.childNodes].filter(n => n.nodeType === 1 && n.localName === name) : []);
const kid = (el, name) => kids(el, name)[0];
const colOf = ref => ref.replace(/\d+/g, '');
const rowOf = ref => +ref.replace(/\D+/g, '');
const b64of = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const bufOf = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();

const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
function isDateFmt(code) {
  const c = String(code || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
  return /[dmyhs]/i.test(c) && !/^[#0.,%\s]*$/.test(c);
}
function fmtDate(serial, d1904, withTime) {
  if (serial < 1 && withTime) { const m = Math.round(serial * 1440); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; } // solo hora
  const ms = (serial - (d1904 ? 24107 : 25569)) * 86400000;
  const d = new Date(Math.round(ms));
  if (isNaN(d)) return String(serial);
  const p = n => String(n).padStart(2, '0');
  const s = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return withTime && (d.getUTCHours() || d.getUTCMinutes()) ? `${s} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : s;
}

export async function readXlsx(buf) {
  const JSZip = await loadZip();
  let zip;
  try { zip = await JSZip.loadAsync(buf); } catch { throw new Error('No es un archivo .xlsx válido. Los .xls antiguos o protegidos con contraseña no se pueden abrir: guárdalo como .xlsx.'); }
  const read = async p => { const f = zip.file(p); return f ? parseXml(await f.async('string')) : null; };
  const wb = await read('xl/workbook.xml');
  if (!wb) throw new Error('El archivo no contiene un libro de Excel.');
  const d1904 = /^(1|true)$/.test(wb.getElementsByTagNameNS(NS, 'workbookPr')[0]?.getAttribute('date1904') || '');
  const rels = await read('xl/_rels/workbook.xml.rels');
  const relMap = new Map([...rels.getElementsByTagName('Relationship')].map(r => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const ssDoc = await read('xl/sharedStrings.xml');
  const ss = ssDoc ? [...ssDoc.getElementsByTagNameNS(NS, 'si')].map(siText) : [];
  // estilos: formato numérico y relleno de cada estilo de celda
  const sty = await read('xl/styles.xml');
  const fmts = new Map(); kids(kid(sty?.documentElement, 'numFmts'), 'numFmt').forEach(n => fmts.set(+n.getAttribute('numFmtId'), n.getAttribute('formatCode')));
  const fills = kids(kid(sty?.documentElement, 'fills'), 'fill').map(f => f.getElementsByTagNameNS(NS, 'fgColor')[0]?.getAttribute('rgb') || '');
  const xfs = kids(kid(sty?.documentElement, 'cellXfs'), 'xf').map(x => {
    const id = +(x.getAttribute('numFmtId') || 0), code = fmts.get(id) || '', dm = code.match(/\.(0+)/);
    return { date: DATE_IDS.has(id) || (id >= 164 && isDateFmt(code)), time: /h/i.test(code.replace(/"[^"]*"/g, '')) || [18, 19, 20, 21, 22, 45, 46, 47].includes(id),
      thousands: id === 3 || id === 4 || /#,##/.test(code), pct: id === 9 || id === 10 || /%/.test(code), dec: dm ? dm[1].length : (id === 2 || id === 4 ? 2 : 0),
      fill: fills[+(x.getAttribute('fillId') || 0)] || '' };
  });
  const sheets = [];
  for (const sh of wb.getElementsByTagNameNS(NS, 'sheet')) {
    const name = sh.getAttribute('name'), hidden = !!sh.getAttribute('state') && sh.getAttribute('state') !== 'visible';
    const rid = sh.getAttributeNS(RNS, 'id') || sh.getAttribute('r:id');
    let target = (relMap.get(rid) || '').replace(/^\//, '');
    const path = target.startsWith('xl/') ? target : 'xl/' + target;
    const doc = await read(path); if (!doc) continue;
    // hipervínculos
    const links = new Map();
    const hl = doc.getElementsByTagNameNS(NS, 'hyperlink');
    if (hl.length) {
      const sr = await read(path.replace(/([^/]+)$/, '_rels/$1.rels'));
      const sm = sr ? new Map([...sr.getElementsByTagName('Relationship')].map(r => [r.getAttribute('Id'), r.getAttribute('Target')])) : new Map();
      [...hl].forEach(h => { const u = sm.get(h.getAttributeNS(RNS, 'id') || h.getAttribute('r:id')); if (u && /^(https?:|mailto:|tel:)/i.test(u)) { const c = cellRef((h.getAttribute('ref') || '').split(':')[0]); if (c) links.set(c.L + c.r, u); } });
    }
    const grid = new Map(); // fila → Map(col → {v, fill, link})
    walkCells(doc.getElementsByTagNameNS(NS, 'row'), kids, (row, r, c, L) => {
      if (!c) return;
      const cells = grid.get(r) || new Map();
      {
        const ref = L + r, t = c.getAttribute('t'), x = xfs[+(c.getAttribute('s') || 0)] || {};
        const vEl = kid(c, 'v');
        let v = '';
        if (t === 's') v = ss[+vEl?.textContent] ?? '';
        else if (t === 'inlineStr') v = [...c.getElementsByTagNameNS(NS, 't')].map(n => n.textContent).join('');
        else if (t === 'b') v = vEl?.textContent === '1' ? 'Sí' : 'No';
        else if (t === 'str' || t === 'e' || t === 'd') v = vEl?.textContent ?? '';
        else if (vEl) {
          const n = +vEl.textContent;
          if (x.date && n >= 0 && n < 2958466 && (n >= 1 || x.time)) v = fmtDate(n, d1904, x.time);
          else if (x.pct) v = (Math.round(n * 10000) / 100).toLocaleString('es-ES') + ' %';
          else if (x.thousands || x.dec > 0) v = n.toLocaleString('es-ES', { maximumFractionDigits: Math.max(0, x.dec), minimumFractionDigits: Math.max(0, x.dec) });
          else v = Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6).replace('.', ',');
        }
        v = clean(v);
        const link = links.get(ref);
        if (v || link) { cells.set(L, { v, fill: /^[0-9A-F]{6,8}$/i.test(x.fill) ? x.fill : '', link }); grid.set(r, cells); }
      }
    });
    sheets.push(buildSheet(name, hidden, grid));
  }
  return sheets;
}

/** Detecta la fila de cabecera, las columnas y las filas de datos de una hoja. */
function buildSheet(name, hidden, grid) {
  const rowsN = [...grid.keys()].sort((a, b) => a - b);
  let hr = rowsN[0], best = 0;
  for (const r of rowsN.slice(0, 15)) {
    const n = [...grid.get(r).values()].filter(c => c.v && !/^[\d.,\s%/:-]+$/.test(c.v) && c.v.length < 60).length;
    if (n > best + 0.5) { best = n; hr = r; }
  }
  const caption = rowsN.filter(r => r < hr).map(r => [...grid.get(r).values()].map(c => c.v).join(' · ')).filter(Boolean).join(' — ');
  const head = grid.get(hr) || new Map();
  const data = rowsN.filter(r => r > hr).map(r => grid.get(r))
    .filter(cells => [...cells.values()].some(c => c.v && !/^(n\/?a|-+|—)$/i.test(c.v)));
  const letters = new Set([...head.keys()]); data.forEach(cells => cells.forEach((_, k) => letters.add(k)));
  const used = new Set(); const cols = [];
  [...letters].sort((a, b) => colNum(a) - colNum(b)).forEach(L => {
    if (!data.some(cells => cells.get(L)?.v)) return; // columna sin datos
    let label = clean(head.get(L)?.v) || 'Columna ' + L, key = nrm(label) || 'col' + L.toLowerCase();
    while (used.has(key)) key += '_';
    used.add(key); cols.push({ L, key, label });
  });
  const rows = data.map(cells => {
    const v = {}, link = {};
    cols.forEach(c => { const x = cells.get(c.L); if (x) { if (x.v) v[c.key] = x.v; if (x.link) link[c.key] = x.link; } });
    const fill = [...cells.values()].find(x => x.v)?.fill || '';
    return { v, link, fill };
  }).filter(r => Object.keys(r.v).length);
  // el relleno solo es informativo si varía entre filas
  const fills = new Set(rows.map(r => r.fill));
  if (fills.size < 2) rows.forEach(r => { r.fill = ''; });
  return { name, hidden, caption, cols, rows };
}

function csvToSheets(text, name) {
  const t = parseTable(text);
  const grid = new Map(t.map((r, i) => [i + 1, new Map(r.map((v, j) => [String.fromCharCode(65 + (j % 26)) + (j >= 26 ? j : ''), { v: clean(v), fill: '' }]).filter(([, x]) => x.v))]));
  return [buildSheet(name, false, grid)];
}

/* ================= plantillas ================= */

// Integradas: solo describen columnas de archivos habituales del equipo.
const BUILTIN = [
  { id: 'b-toner', name: 'Stock de seguridad de tóner', sig: ['modelo', 'edpcode', 'color', 'stockactual', 'stocknecesario'],
    title: 'modelo', sub: ['edpcode', 'edpcodeii'], main: ['color', 'stockactual', 'stocknecesario', 'reponer'], hide: [],
    group: 'modelo', sort: '', flag: { col: 'reponer', op: 'gt0', label: 'A reponer' } },
  { id: 'b-parque', name: 'Listado de máquinas', sig: ['serialnumber', 'model', 'clientecalculado'],
    title: 'clientecalculado', sub: ['model', 'serialnumber'],
    main: ['address1', 'address2', 'poblacion', 'address3', 'phonenumber', 'phonenumber2', 'phonenumber3', 'emailaddress', 'ultimots', 'estaenelcliente', 'estaenuso', 'resolucion', 'comentarios', 'notes'],
    hide: [], group: '', sort: 'clientecalculado', flag: null }
];
const sigOf = sheet => sheet.cols.map(c => c.key);
const localTpls = () => { const v = lsGet(KTPL, []); return Array.isArray(v) ? v : []; };
const teamTpls = () => (Array.isArray(st.D.templates) ? st.D.templates : []);

/** Plantilla que mejor encaja con las cabeceras de la hoja: local > equipo > integrada; la más específica. */
export function templateFor(sheet) {
  const keys = new Set(sigOf(sheet));
  const fits = t => t && Array.isArray(t.sig) && t.sig.length && t.sig.every(k => keys.has(k));
  for (const [src, list] of [['local', localTpls()], ['equipo', teamTpls()], ['integrada', BUILTIN]]) {
    const m = list.filter(fits).sort((a, b) => b.sig.length - a.sig.length)[0];
    if (m) return { ...m, src };
  }
  return autoTemplate(sheet);
}
function autoTemplate(sheet) {
  const ks = sigOf(sheet), pick = re => ks.find(k => re.test(k));
  const title = pick(/cliente|nombre|name|descrip|modelo|model|articulo/) || ks[0];
  const sub = ks.filter(k => k !== title && /serial|serie|ref|codigo|code|edp|partnumber|model/.test(k)).slice(0, 2);
  const main = ks.filter(k => k !== title && !sub.includes(k)).slice(0, 6);
  return { id: 'auto', name: 'Automática', sig: [], title, sub, main, hide: [], group: '', sort: '', flag: null, src: 'auto' };
}
export function saveTemplate(sheet, t, team) {
  const tpl = { id: t.id && t.src !== 'integrada' && t.src !== 'auto' ? t.id : 't' + Date.now().toString(36), name: t.name || 'Plantilla', sig: sigOf(sheet),
    title: t.title, sub: t.sub, main: t.main, hide: t.hide, group: t.group, sort: t.sort, flag: t.flag };
  if (team && st.editing) {
    st.D.templates = teamTpls().filter(x => x.id !== tpl.id && x.sig.join() !== tpl.sig.join()); st.D.templates.push(tpl); save();
    lsSet(KTPL, localTpls().filter(x => x.sig.join() !== tpl.sig.join()));
  } else lsSet(KTPL, [...localTpls().filter(x => x.id !== tpl.id && x.sig.join() !== tpl.sig.join()), tpl]);
}
export function resetTemplate(sheet) { const s = sigOf(sheet).join(); lsSet(KTPL, localTpls().filter(x => x.sig.join() !== s)); }

/* ================= estado del visor ================= */

export const XS = { file: null, sheets: [], si: 0, flagOnly: false, fcol: '', fval: '', mode: '', showHidden: false, limit: 150 };

export async function openFile(file) {
  const buf = await file.arrayBuffer();
  const isCsv = /\.(csv|tsv|txt)$/i.test(file.name);
  const sheets = isCsv ? csvToSheets(decodeText(buf), file.name) : await readXlsx(buf);
  if (!sheets.some(s => s.rows.length)) throw new Error('El archivo no tiene filas con datos.');
  Object.assign(XS, { file: { name: file.name, size: file.size }, sheets, si: Math.max(0, sheets.findIndex(s => !s.hidden && s.rows.length)), flagOnly: false, fcol: '', fval: '', limit: 150, showHidden: false });
  // recientes: se guarda el archivo para reabrirlo sin buscarlo de nuevo
  if (buf.byteLength <= MAX_KEEP) {
    const rec = recent().filter(x => x.name !== file.name);
    rec.unshift({ name: file.name, at: new Date().toISOString(), csv: isCsv, b64: b64of(buf) });
    // como mucho ~2,5 M caracteres en total, para dejar sitio al stock rule y al borrador del editor
    let keep = rec.slice(0, 3); while (keep.length > 1 && JSON.stringify(keep).length > 2.5e6) keep = keep.slice(0, -1);
    for (let n = keep.length; n > 0; n--) { try { localStorage.setItem(KEY, JSON.stringify(keep.slice(0, n))); break; } catch { /* sin espacio: guardar menos */ } }
  }
}
export const recent = () => { const v = lsGet(KEY, []); return Array.isArray(v) ? v : []; };
export async function openRecent(i) {
  const r = recent()[i]; if (!r) return;
  await openFile(new File([bufOf(r.b64)], r.name));
}
export function forgetRecent(i) { const r = recent(); r.splice(i, 1); r.length ? lsSet(KEY, r) : lsDel(KEY); }
export function closeFile() { XS.file = null; XS.sheets = []; }
export const curSheet = () => XS.sheets[XS.si];

/* ================= vista ================= */

const KIND = [
  ['tel', /phone|telefono|tel$|movil|mobile/], ['mail', /email|correo|^mail/], ['addr', /address|direccion|poblacion|localidad|ciudad|provincia|codigopostal|^cp$/],
  ['model', /^model|modelo/], ['serial', /serial|nserie|numerodeserie|^serie$/], ['ref', /edp|^ref|referencia|partnumber|codigo|code/], ['color', /^color$/]
];
const kindOf = k => (KIND.find(([, re]) => re.test(k)) || [''])[0];
const flagged = (row, f) => {
  if (!f || !f.col) return false;
  const raw = row.v[f.col] ?? '', n = parseFloat(String(raw).replace(/\./g, '').replace(',', '.'));
  return f.op === 'gt0' ? n > 0 : f.op === 'lt1' ? !isNaN(n) && n < 1 : f.op === 'filled' ? !!raw : false;
};

function valueHTML(k, v, link) {
  const kd = kindOf(k), e = esc(v);
  if (link) return `<a href="${esc(link)}" target="_blank" rel="noopener">${e}</a>`;
  if (kd === 'tel' && /^\+?[\d\s]{6,}$/.test(v)) { const d = v.replace(/\s/g, ''); const t = d.length === 11 && d.startsWith('34') ? '+' + d : d; return `<a href="tel:${esc(t)}">${e}</a>`; }
  if ((kd === 'mail' || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)) && v.includes('@')) return `<a href="mailto:${esc(v)}">${e}</a>`;
  if (kd === 'color' && /^[KCMY]$/i.test(v)) return `<span class="tt ch-${v.toUpperCase()}">${e}</span>`;
  if (kd === 'model') { const m = modelByName(v); if (m) return `<a href="#/m/${encodeURIComponent(m.name)}">${e}</a>`; }
  const p = partByRef(v);
  if (p) return `<button type="button" class="ref" data-copy="${esc(p.ref)}">${e}</button> <a href="#/r/${encodeURIComponent(p.ref)}" class="small">${esc(p.type)}</a>`;
  if (kd === 'serial' || kd === 'ref') return `<button type="button" class="ref sm" data-copy="${e}" aria-label="Copiar ${e}">${e}</button>`;
  return e;
}

function card(sheet, t, row) {
  const lab = Object.fromEntries(sheet.cols.map(c => [c.key, c.label]));
  const hide = new Set(t.hide || []), title = row.v[t.title] || '—';
  const sub = (t.sub || []).filter(k => row.v[k] && k !== t.title);
  const main = (t.main || []).filter(k => row.v[k] && k !== t.title && !sub.includes(k) && !hide.has(k));
  const rest = sheet.cols.map(c => c.key).filter(k => row.v[k] && k !== t.title && k !== t.group && !sub.includes(k) && !main.includes(k) && !hide.has(k));
  const fl = flagged(row, t.flag);
  const addr = sheet.cols.filter(c => kindOf(c.key) === 'addr' && row.v[c.key] && !hide.has(c.key)).map(c => row.v[c.key]);
  const field = k => `<div class="xf"><span>${esc(lab[k])}</span><b>${valueHTML(k, row.v[k], row.link[k])}</b></div>`;
  const s = esc(nrm(Object.values(row.v).join(' ')));
  return `<article class="xc ${fl ? 'flag' : ''}" data-s="${s}" style="${row.fill ? `--rf:#${row.fill.slice(-6)}` : ''}">
    <div class="xc-h"><b class="xt">${valueHTML(t.title, title, row.link[t.title])}</b>${fl ? `<span class="bd w">${esc(t.flag.label || 'Destacado')}</span>` : ''}</div>
    ${sub.length ? `<div class="xs">${sub.map(k => `<span>${valueHTML(k, row.v[k], row.link[k])}</span>`).join('')}</div>` : ''}
    ${main.length ? `<div class="xg">${main.map(field).join('')}</div>` : ''}
    ${addr.length ? `<a class="sm ghost btn xmap" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr.join(', '))}" target="_blank" rel="noopener">Cómo llegar</a>` : ''}
    ${rest.length ? `<details class="xm"><summary>Más datos (${rest.length})</summary><div class="xg">${rest.map(field).join('')}</div></details>` : ''}
  </article>`;
}

export function xlsView() {
  if (!XS.file) {
    const rec = recent();
    return `<header class="ph"><h1>Abrir Excel</h1><div class="meta">Abre un .xlsx compartido (Teams, correo) y míralo en tarjetas legibles: búsqueda, filtros, teléfonos y direcciones con un toque.</div>
      <div class="acts"><button type="button" class="btn pri" data-x="open">Abrir archivo</button></div></header>
      ${rec.length ? `<section class="blk"><h2 class="h">Recientes en este dispositivo</h2><div class="list">${rec.map((r, i) => `<div class="row"><button type="button" class="rm linkb" data-xrec="${i}"><b>${esc(r.name)}</b><span class="mut small">${new Date(r.at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span></button><button type="button" class="sm ghost" data-xforget="${i}" aria-label="Olvidar ${esc(r.name)}">✕</button></div>`).join('')}</div></section>` : ''}
      <p class="mut small">El archivo se lee en este dispositivo y no se sube a ningún sitio. Los recientes (hasta 3, de menos de 3 MB) se guardan en el navegador para reabrirlos sin conexión; «✕» los borra. No abre archivos .xls antiguos ni protegidos con contraseña.</p>`;
  }
  const sh = curSheet(), t = templateFor(sh);
  const visibleSheets = XS.sheets.map((s, i) => ({ s, i })).filter(({ s }) => (XS.showHidden || !s.hidden) && s.rows.length);
  const nHidden = XS.sheets.filter(s => s.hidden && s.rows.length).length;
  let rows = sh.rows;
  if (XS.flagOnly && t.flag) rows = rows.filter(r => flagged(r, t.flag));
  if (XS.fcol && XS.fval) rows = rows.filter(r => (r.v[XS.fcol] || '') === XS.fval);
  if (t.sort) rows = [...rows].sort((a, b) => cmp(a.v[t.sort] || '~', b.v[t.sort] || '~'));
  const nFlag = t.flag ? sh.rows.filter(r => flagged(r, t.flag)).length : 0;
  const filterCols = sh.cols.filter(c => { const n = new Set(sh.rows.map(r => r.v[c.key]).filter(Boolean)).size; return n > 1 && n <= 40; });
  const vals = XS.fcol ? [...new Set(sh.rows.map(r => r.v[XS.fcol]).filter(Boolean))].sort(cmp) : [];
  const mode = XS.mode || (matchMedia('(min-width: 900px)').matches ? 'table' : 'cards');
  let h = `<header class="ph"><div class="crumb"><button type="button" class="linkb" data-x="close">Abrir otro</button></div><h1 class="xh1">${esc(XS.file.name)}</h1>
    <div class="meta">${esc(sh.caption || sh.name)} · ${sh.rows.length} filas · vista «${esc(t.name)}»${t.src === 'auto' ? '' : ` (${t.src})`}</div>
    <div class="acts"><button type="button" class="sm ghost" data-x="tpl">Ajustar vista</button>${st.editing ? '<button type="button" class="sm ghost" data-x="tocat">Añadir al catálogo</button>' : ''}<button type="button" class="sm ghost ${mode === 'cards' ? 'on' : ''}" data-xmode="cards">Tarjetas</button><button type="button" class="sm ghost ${mode === 'table' ? 'on' : ''}" data-xmode="table">Tabla</button></div></header>`;
  if (visibleSheets.length > 1 || nHidden) h += `<div class="seg scroll" role="group" aria-label="Hojas">${visibleSheets.map(({ s, i }) => `<button type="button" class="${i === XS.si ? 'on' : ''}" data-xsheet="${i}">${esc(s.name)}${s.hidden ? ' <small>oculta</small>' : ''}</button>`).join('')}${nHidden ? `<button type="button" data-x="hidden">${XS.showHidden ? 'Ocultar ocultas' : `+${nHidden} ocultas`}</button>` : ''}</div>`;
  h += `<div class="filters">${t.flag ? `<label class="sw"><input type="checkbox" data-x="flag" ${XS.flagOnly ? 'checked' : ''}><span>Solo «${esc(t.flag.label || 'destacadas')}» (${nFlag})</span></label>` : ''}
    ${filterCols.length ? `<select data-xf="col" aria-label="Filtrar por columna"><option value="">Filtrar por…</option>${filterCols.map(c => `<option value="${esc(c.key)}" ${XS.fcol === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>` : ''}
    ${XS.fcol ? `<select data-xf="val" aria-label="Valor"><option value="">Todos</option>${vals.map(v => `<option ${XS.fval === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>` : ''}</div>
    <input type="search" class="tf xq" placeholder="Buscar en esta hoja" aria-label="Buscar en esta hoja">`;
  if (!rows.length) return h + '<div class="empty"><p>Ninguna fila con este filtro.</p></div>';
  const shown = rows.slice(0, XS.limit);
  if (mode === 'table') {
    const cols = [t.title, ...(t.sub || []), ...(t.main || []), ...sh.cols.map(c => c.key)].filter((k, i, a) => k && a.indexOf(k) === i && !(t.hide || []).includes(k) && sh.cols.some(c => c.key === k));
    const lab = Object.fromEntries(sh.cols.map(c => [c.key, c.label]));
    h += `<div class="tw"><table class="xtbl"><thead><tr>${cols.map(k => `<th scope="col">${esc(lab[k])}</th>`).join('')}</tr></thead><tbody>${shown.map(r => `<tr class="${flagged(r, t.flag) ? 'flag' : ''}" data-s="${esc(nrm(Object.values(r.v).join(' ')))}">${cols.map(k => `<td>${r.v[k] ? valueHTML(k, r.v[k], r.link[k]) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  } else if (t.group) {
    const groups = new Map(); shown.forEach(r => { const g = r.v[t.group] || '—'; (groups.get(g) || groups.set(g, []).get(g)).push(r); });
    const lab = sh.cols.find(c => c.key === t.group)?.label || '';
    const tg = { ...t, title: t.title === t.group ? (t.sub || [])[0] || t.title : t.title, sub: (t.sub || []).filter(k => k !== t.group) };
    if (tg.title !== t.title) tg.sub = tg.sub.filter(k => k !== tg.title);
    h += [...groups.entries()].map(([g, rs]) => `<section class="blk xgrp"><h2 class="h">${esc(g)} <span class="mut">· ${rs.length}</span></h2><div class="xcards">${rs.map(r => card(sh, tg, r)).join('')}</div></section>`).join('');
  } else h += `<div class="xcards">${shown.map(r => card(sh, t, r)).join('')}</div>`;
  if (rows.length > XS.limit) h += `<p><button type="button" class="btn" data-x="more">Mostrar más (${rows.length - XS.limit})</button></p>`;
  return h;
}

/* ================= diálogo de plantilla ================= */

export function templateDialogHTML() {
  const sh = curSheet(), t = templateFor(sh);
  const role = k => (k === t.title ? 'title' : (t.sub || []).includes(k) ? 'sub' : (t.main || []).includes(k) ? 'main' : (t.hide || []).includes(k) ? 'hide' : 'more');
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${l}</option>`;
  const colOpts = cur => '<option value="">— ninguna —</option>' + sh.cols.map(c => opt(c.key, esc(c.label), cur)).join('');
  return `<p class="mut small">Elige cómo se muestra este tipo de archivo. Se reconoce por sus cabeceras: la próxima vez que abras un archivo con las mismas columnas se aplicará sola. Solo se guarda la estructura, nunca los datos.</p>
    <label class="fld"><span>Nombre de la vista</span><input name="tname" value="${esc(t.src === 'auto' ? sh.name : t.name)}"></label>
    <div class="fld"><span>Columnas</span><div class="xroles">${sh.cols.map(c => `<label><span>${esc(c.label)}</span><select name="role:${esc(c.key)}">${opt('title', 'Título', role(c.key))}${opt('sub', 'Subtítulo', role(c.key))}${opt('main', 'Principal', role(c.key))}${opt('more', 'Más datos', role(c.key))}${opt('hide', 'Ocultar', role(c.key))}</select></label>`).join('')}</div></div>
    <div class="two"><label class="fld"><span>Agrupar por</span><select name="group">${colOpts(t.group)}</select></label>
    <label class="fld"><span>Ordenar por</span><select name="sort">${colOpts(t.sort)}</select></label></div>
    <div class="two"><label class="fld"><span>Destacar filas según</span><select name="fcol">${colOpts(t.flag?.col || '')}</select></label>
    <label class="fld"><span>Condición</span><select name="fop">${opt('gt0', 'Mayor que 0', t.flag?.op)}${opt('lt1', 'Menor que 1', t.flag?.op)}${opt('filled', 'Con contenido', t.flag?.op)}</select></label></div>
    <label class="fld"><span>Etiqueta del destacado</span><input name="flabel" value="${esc(t.flag?.label || '')}" placeholder="A reponer, Pendiente…"></label>
    ${st.editing ? '<label class="sw"><input type="checkbox" name="team"><span>Publicar esta vista para todo el equipo (al pulsar «Publicar»)</span></label>' : ''}
    ${t.src === 'local' ? '<p><button type="button" class="sm ghost bad" data-xreset>Volver a la vista por defecto</button></p>' : ''}`;
}
export function readTemplateForm(f) {
  const sh = curSheet(), t = templateFor(sh), roles = {};
  sh.cols.forEach(c => { roles[c.key] = f.elements['role:' + c.key].value; });
  const by = r => sh.cols.map(c => c.key).filter(k => roles[k] === r);
  const titles = by('title');
  if (!titles.length) throw new Error('Elige una columna como título');
  const fcol = f.elements.fcol.value;
  return { ...t, name: f.elements.tname.value.trim() || sh.name, title: titles[0], sub: [...titles.slice(1), ...by('sub')], main: by('main'), hide: by('hide'),
    group: f.elements.group.value, sort: f.elements.sort.value, flag: fcol ? { col: fcol, op: f.elements.fop.value, label: f.elements.flabel.value.trim() || 'Destacado' } : null };
}

/* ================= archivo compartido desde otra app (Android) ================= */

export async function takeShared() {
  if (!('caches' in window)) return null;
  try {
    const c = await caches.open('refcom-share');
    const r = await c.match('shared-file'); if (!r) return null;
    const name = decodeURIComponent(r.headers.get('X-File-Name') || 'compartido.xlsx');
    const blob = await r.blob(); await c.delete('shared-file');
    return new File([blob], name);
  } catch { return null; }
}
