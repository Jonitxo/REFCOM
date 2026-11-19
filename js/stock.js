// Stock rule: importa el Excel de reposición automática del técnico, permite marcar cambios
// (rojo = eliminar, amarillo = cambiar cantidad, verde = añadir) y genera un .xlsx con el
// mismo formato. Se edita el XML del propio archivo para conservar estilos, anchos y columnas.
// Todo queda en este dispositivo (localStorage); nada se publica.

import { esc, fmtRef, cleanRef, nrm, lsGet, lsSet, lsDel, cmp } from './util.js';
import { partByRef, supersededBy, mo, M } from './store.js';

const KEY = 'refcom_stock_v1';
export const COLORS = { del: 'FFC00000', mod: 'FFFFC000', add: 'FF00B050' };
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/* ---------- carga perezosa de JSZip (solo en esta pantalla) ---------- */
let zipLib;
export function loadZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!zipLib) zipLib = new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/jszip.min.js'; s.onload = () => ok(window.JSZip); s.onerror = () => ko(new Error('No se pudo cargar el lector de Excel'));
    document.head.appendChild(s);
  });
  return zipLib;
}

/* ---------- utilidades XML ---------- */
const parseXml = t => new DOMParser().parseFromString(t, 'application/xml');
const ser = d => new XMLSerializer().serializeToString(d);
const kids = (el, name) => [...el.childNodes].filter(n => n.nodeType === 1 && n.localName === name);
const kid = (el, name) => kids(el, name)[0];
const colOf = ref => ref.replace(/\d+/g, '');
const colNum = c => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const b64of = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const bufOf = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

/** Clasifica un color ARGB como rojo, amarillo o verde (tolerante a tonos). */
function classify(rgb) {
  if (!rgb || rgb.length < 6) return '';
  const h = rgb.slice(-6), r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if (r > 150 && g < 110 && b < 110) return 'del';
  if (r > 180 && g > 140 && b < 120) return 'mod';
  if (g > 120 && r < 170 && b < 140) return 'add';
  return '';
}

async function openParts(buf) {
  const JSZip = await loadZip();
  const zip = await JSZip.loadAsync(buf);
  const wb = parseXml(await zip.file('xl/workbook.xml').async('string'));
  const rels = parseXml(await zip.file('xl/_rels/workbook.xml.rels').async('string'));
  const sheet = wb.getElementsByTagNameNS(NS, 'sheet')[0];
  const rid = sheet.getAttributeNS(RNS, 'id') || sheet.getAttribute('r:id');
  const rel = [...rels.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid);
  let target = rel.getAttribute('Target').replace(/^\//, '');
  const sheetPath = target.startsWith('xl/') ? target : 'xl/' + target;
  const ssFile = zip.file('xl/sharedStrings.xml');
  const ss = ssFile ? [...parseXml(await ssFile.async('string')).getElementsByTagNameNS(NS, 'si')].map(si => [...si.getElementsByTagNameNS(NS, 't')].map(t => t.textContent).join('')) : [];
  const styles = parseXml(await zip.file('xl/styles.xml').async('string'));
  const sheetDoc = parseXml(await zip.file(sheetPath).async('string'));
  return { zip, sheetPath, ss, styles, sheetDoc };
}

function cellText(c, ss) {
  const t = c.getAttribute('t'), v = kid(c, 'v');
  if (t === 's') return ss[+v?.textContent] ?? '';
  if (t === 'inlineStr') return [...c.getElementsByTagNameNS(NS, 't')].map(x => x.textContent).join('');
  return v ? v.textContent : '';
}
function fillOfStyle(styles, s) {
  const xfs = kids(kid(styles.documentElement, 'cellXfs'), 'xf'), xf = xfs[+s || 0];
  const fid = +(xf?.getAttribute('fillId') || 0);
  const fill = kids(kid(styles.documentElement, 'fills'), 'fill')[fid];
  const fg = fill && fill.getElementsByTagNameNS(NS, 'fgColor')[0];
  return fg ? fg.getAttribute('rgb') || '' : '';
}

/** «DESCRIPCIÓN (REFERENCIA)» → {desc, ref} */
export function splitModel(t) {
  const m = String(t || '').match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  return m ? { desc: m[1].trim(), ref: cleanRef(m[2]) } : { desc: String(t || '').trim(), ref: '' };
}
/** Interpreta la nota de una fila amarilla: «Solo 1», «Quitar 1», «dejar 1»… → cantidad final. */
function parseNote(note, qty) {
  const n = String(note || '');
  let m = n.match(/(?:solo|dejar|deja|queda[n]?|quedan|→)\s*(\d+)/i); if (m) return +m[1];
  m = n.match(/(?:quitar|quita|menos|-)\s*(\d+)/i); if (m) return Math.max(0, qty - +m[1]);
  m = n.match(/(?:subir|añadir|sumar|\+)\s*(\d+)/i); if (m) return qty + +m[1];
  m = n.match(/^\s*(\d+)\s*$/); if (m) return +m[1];
  return null;
}

/* ---------- importar ---------- */

export async function importStock(file) {
  const buf = await file.arrayBuffer();
  const { ss, styles, sheetDoc, sheetPath } = await openParts(buf);
  const rows = [...sheetDoc.getElementsByTagNameNS(NS, 'row')];
  const hdr = {};
  kids(rows[0], 'c').forEach(c => { hdr[nrm(cellText(c, ss))] = colOf(c.getAttribute('r')); });
  const cModel = hdr.model, cQty = hdr.threshold, cStock = hdr.stockroom;
  if (!cModel || !cQty) throw new Error('No parece un stock rule: faltan las columnas «Model» y «Threshold».');
  let noteCol = 'L';
  const last = Object.values(hdr).sort((a, b) => colNum(b) - colNum(a))[0];
  if (colNum(last) >= colNum('L')) noteCol = String.fromCharCode(last.charCodeAt(0) + 1);
  const out = []; let stockroom = '';
  rows.slice(1).forEach(row => {
    const cells = Object.fromEntries(kids(row, 'c').map(c => [colOf(c.getAttribute('r')), c]));
    const mc = cells[cModel]; if (!mc) return;
    const { desc, ref } = splitModel(cellText(mc, ss));
    if (!ref && !desc) return;
    const qty = parseInt(cellText(cells[cQty] || mc, ss), 10) || 0;
    if (!stockroom && cells[cStock]) stockroom = cellText(cells[cStock], ss);
    const st0 = classify(fillOfStyle(styles, mc.getAttribute('s')));
    const note = cells[noteCol] ? cellText(cells[noteCol], ss) : '';
    const nq = st0 === 'mod' ? parseNote(note, qty) : null;
    out.push({ r: +row.getAttribute('r'), ref, desc, qty, state: st0 === 'add' ? 'add0' : st0 || 'keep', newQty: nq ?? qty, nq0: nq ?? qty, note0: note });
  });
  const data = { name: file.name, b64: b64of(buf), sheetPath, noteCol, cols: hdr, stockroom, rows: out, added: [], at: new Date().toISOString() };
  lsSet(KEY, data);
  return data;
}

export const stockGet = () => lsGet(KEY, null);
const put = d => lsSet(KEY, d);
export const stockClear = () => lsDel(KEY);

/* ---------- edición ---------- */

function find(d, key) { return key.startsWith('a:') ? d.added[+key.slice(2)] : d.rows.find(x => x.r === +key); }
export function stockToggleDel(key) {
  const d = stockGet(), it = find(d, key); if (!it) return;
  if (key.startsWith('a:')) { d.added.splice(+key.slice(2), 1); }
  else it.state = it.state === 'del' ? (it.newQty !== it.qty ? 'mod' : 'keep') : 'del';
  put(d);
}
export function stockQty(key, delta) {
  const d = stockGet(), it = find(d, key); if (!it) return;
  if (key.startsWith('a:')) { it.qty = Math.max(1, it.qty + delta); put(d); return; }
  if (it.state === 'add0') { it.newQty = Math.max(1, it.newQty + delta); put(d); return; }
  it.newQty = Math.max(0, it.newQty + delta);
  if (it.newQty === 0) { it.state = 'del'; it.newQty = it.qty; }
  else it.state = it.newQty === it.qty ? (it.state === 'add0' ? 'add0' : 'keep') : 'mod';
  put(d);
}
export function stockReset(key) {
  const d = stockGet(), it = find(d, key); if (!it || key.startsWith('a:')) return;
  it.state = 'keep'; it.newQty = it.qty; put(d);
}
export function stockAdd(ref, qty, desc) {
  ref = cleanRef(ref); if (!ref) return 'empty';
  const d = stockGet();
  const ex = d.rows.find(x => nrm(x.ref) === nrm(ref));
  if (ex) { if (ex.state === 'del') ex.state = ex.newQty !== ex.qty ? 'mod' : 'keep'; put(d); return 'exists'; }
  const ad = d.added.find(x => nrm(x.ref) === nrm(ref));
  if (ad) { ad.qty += qty; put(d); return 'more'; }
  d.added.push({ ref, qty: Math.max(1, qty), desc: (desc || '').toUpperCase() });
  put(d); return 'ok';
}
export function stockCounts(d) {
  const c = { keep: 0, del: 0, mod: 0, add: d.added.length + d.rows.filter(x => x.state === 'add0').length };
  d.rows.forEach(x => { if (x.state in c && x.state !== 'add') c[x.state]++; });
  return c;
}
/** Referencias que quedan activas tras los cambios, con su cantidad. */
export function stockFinal(d) {
  return [...d.rows.filter(x => x.state !== 'del').map(x => ({ ref: x.ref, qty: x.state === 'mod' ? x.newQty : x.qty })),
    ...d.added.map(x => ({ ref: x.ref, qty: x.qty }))];
}

/* ---------- exportar ---------- */

const noteFor = it => { const dlt = it.newQty - it.qty; return dlt < 0 ? `Quitar ${-dlt}, dejar ${it.newQty}` : `Subir ${dlt}, dejar ${it.newQty}`; };

export async function exportStock() {
  const d = stockGet(); if (!d) throw new Error('No hay stock rule cargado');
  const { zip, ss, styles, sheetDoc, sheetPath } = await openParts(bufOf(d.b64));
  const root = styles.documentElement;
  const fillsEl = kid(root, 'fills'), xfsEl = kid(root, 'cellXfs');
  const fillId = rgb => {
    const fills = kids(fillsEl, 'fill');
    let i = fills.findIndex(f => { const fg = f.getElementsByTagNameNS(NS, 'fgColor')[0]; const p = f.getElementsByTagNameNS(NS, 'patternFill')[0]; return p?.getAttribute('patternType') === 'solid' && fg?.getAttribute('rgb') === rgb; });
    if (i >= 0) return i;
    const f = styles.createElementNS(NS, 'fill'), p = styles.createElementNS(NS, 'patternFill'), fg = styles.createElementNS(NS, 'fgColor'), bg = styles.createElementNS(NS, 'bgColor');
    p.setAttribute('patternType', 'solid'); fg.setAttribute('rgb', rgb); bg.setAttribute('indexed', '64');
    p.appendChild(fg); p.appendChild(bg); f.appendChild(p); fillsEl.appendChild(f);
    fillsEl.setAttribute('count', kids(fillsEl, 'fill').length);
    return kids(fillsEl, 'fill').length - 1;
  };
  const cache = new Map();
  /** Estilo igual al dado pero con otro relleno (o sin relleno si rgb es null). */
  const styled = (s, rgb) => {
    const k = (s || 0) + '|' + rgb;
    if (cache.has(k)) return cache.get(k);
    const xfs = kids(xfsEl, 'xf'), base = xfs[+s || 0];
    const fid = rgb ? fillId(rgb) : 0;
    const clone = base.cloneNode(true);
    clone.setAttribute('fillId', fid);
    if (rgb) clone.setAttribute('applyFill', '1'); else clone.removeAttribute('applyFill');
    const want = ser(clone);
    let idx = xfs.findIndex(x => ser(x) === want);
    if (idx < 0) { xfsEl.appendChild(clone); idx = kids(xfsEl, 'xf').length - 1; xfsEl.setAttribute('count', idx + 1); }
    cache.set(k, idx); return idx;
  };
  const sheetData = sheetDoc.getElementsByTagNameNS(NS, 'sheetData')[0];
  const rowEls = kids(sheetData, 'row');
  const byR = new Map(rowEls.map(r => [+r.getAttribute('r'), r]));
  const setNote = (row, rnum, text, s) => {
    let c = kids(row, 'c').find(x => colOf(x.getAttribute('r')) === d.noteCol);
    if (!text) { if (c) row.removeChild(c); return; }
    if (!c) { c = sheetDoc.createElementNS(NS, 'c'); c.setAttribute('r', d.noteCol + rnum); row.appendChild(c); }
    while (c.firstChild) c.removeChild(c.firstChild);
    c.setAttribute('t', 'inlineStr'); if (s != null) c.setAttribute('s', s);
    const is = sheetDoc.createElementNS(NS, 'is'), t = sheetDoc.createElementNS(NS, 't');
    t.textContent = text; is.appendChild(t); c.appendChild(is);
  };
  // 1) filas existentes
  d.rows.forEach(it => {
    const row = byR.get(it.r); if (!row) return;
    const rgb = it.state === 'del' ? COLORS.del : it.state === 'mod' ? COLORS.mod : it.state === 'add0' ? COLORS.add : null;
    let textStyle = null;
    kids(row, 'c').forEach(c => {
      if (colOf(c.getAttribute('r')) === d.noteCol) return;
      const s = styled(c.getAttribute('s'), rgb); c.setAttribute('s', s);
      if (colOf(c.getAttribute('r')) === d.cols.model) textStyle = s;
    });
    if (it.state === 'add0' && it.newQty !== it.qty) { // alta pendiente con cantidad cambiada: se corrige el valor
      const qc = kids(row, 'c').find(c => colOf(c.getAttribute('r')) === d.cols.threshold);
      const v = qc && kid(qc, 'v'); if (v) v.textContent = String(it.newQty);
    }
    setNote(row, it.r, it.state === 'mod' ? (it.note0 && it.newQty === it.nq0 ? it.note0 : noteFor(it)) : it.state === 'del' || it.state === 'add0' ? it.note0 : '', textStyle);
  });
  // 2) filas añadidas (verde), copiando la última fila de datos como plantilla
  if (d.added.length) {
    const tpl = rowEls[rowEls.length - 1];
    let rnum = Math.max(...rowEls.map(r => +r.getAttribute('r')));
    const tplCells = kids(tpl, 'c').filter(c => colOf(c.getAttribute('r')) !== d.noteCol);
    d.added.forEach(a => {
      rnum++;
      const row = tpl.cloneNode(false); row.setAttribute('r', rnum);
      tplCells.forEach(tc => {
        const col = colOf(tc.getAttribute('r')), c = sheetDoc.createElementNS(NS, 'c');
        c.setAttribute('r', col + rnum); c.setAttribute('s', styled(tc.getAttribute('s'), COLORS.add));
        const key = Object.entries(d.cols).find(([, v]) => v === col)?.[0] || '';
        let val = null, type = 'str';
        const t = tc.getAttribute('t');
        if (key === 'model') val = `${a.desc ? a.desc + ' ' : ''}(${a.ref})`;
        else if (key === 'threshold') { val = String(a.qty); type = 'n'; }
        else if (key === 'createdby' || key === 'created' || key === 'updated' || key === 'updatedby') val = null;
        else if (t === 'b') { val = cellText(tc, []); type = 'b'; }
        else if (t === 's' || t === 'inlineStr' || t === 'str') val = cellText(tc, ss);
        else { const v = kid(tc, 'v'); if (v) { val = v.textContent; type = 'n'; } }
        if (val != null && val !== '') {
          if (type === 'str') { c.setAttribute('t', 'inlineStr'); const is = sheetDoc.createElementNS(NS, 'is'), te = sheetDoc.createElementNS(NS, 't'); te.textContent = val; is.appendChild(te); c.appendChild(is); }
          else { if (type === 'b') c.setAttribute('t', 'b'); const v = sheetDoc.createElementNS(NS, 'v'); v.textContent = val; c.appendChild(v); }
        }
        row.appendChild(c);
      });
      sheetData.appendChild(row);
    });
    const dim = sheetDoc.getElementsByTagNameNS(NS, 'dimension')[0];
    if (dim) dim.setAttribute('ref', dim.getAttribute('ref').replace(/\d+$/, rnum));
  }
  zip.file(sheetPath, ser(sheetDoc));
  zip.file('xl/styles.xml', ser(styles));
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  const name = d.name.replace(/(\.xlsx)?$/i, '') + '_cambios.xlsx';
  return { blob, name };
}

/* ---------- vista ---------- */

export const SF = { f: 'all', q: '' };
export function stockView() {
  const d = stockGet();
  const intro = `<p class="mut small">Importa tu archivo de stock rule (.xlsx). Marca lo que quieras quitar, cambia cantidades o añade referencias, y genera un Excel con el mismo formato y los colores habituales (rojo eliminar, amarillo cambiar cantidad con la nota, verde añadir) para enviarlo al jefe de equipo. El archivo solo se guarda en este dispositivo.</p>`;
  if (!d) return `${intro}<div class="empty"><p>No hay ningún stock rule cargado.</p><p><button type="button" class="btn pri" data-sk="import">Importar stock rule (.xlsx)</button></p></div>`;
  const c = stockCounts(d);
  const segs = [['all', 'Todas', d.rows.length + d.added.length], ['chg', 'Cambios', c.del + c.mod + c.add], ['del', 'Eliminar', c.del], ['mod', 'Cantidad', c.mod], ['add', 'Añadir', c.add]];
  let h = `<div class="sk-h"><div><b>${esc(d.name)}</b><div class="mut small">${esc(d.stockroom)} · importado ${new Date(d.at).toLocaleDateString('es-ES')}</div></div>
    <div class="sk-c"><span class="sk-b del">${c.del}</span><span class="sk-b mod">${c.mod}</span><span class="sk-b add">${c.add}</span></div></div>
  <div class="acts"><button type="button" class="btn pri" data-sk="export" ${c.del + c.mod + c.add ? '' : 'disabled'}>Generar Excel</button><button type="button" class="sm ghost" data-sk="toinv">Añadir todo a «Tengo»</button><button type="button" class="sm ghost" data-sk="import">Importar otro</button><button type="button" class="sm ghost bad" data-sk="clear">Quitar archivo</button></div>
  <form class="invadd wrapf" data-form="skadd" autocomplete="off"><input name="ref" list="dlRefs" placeholder="Añadir referencia" aria-label="Referencia a añadir" required autocapitalize="characters"><input name="qty" type="number" min="1" value="1" inputmode="numeric" aria-label="Cantidad"><button class="pri">Añadir</button><input name="desc" placeholder="Descripción (opcional)" aria-label="Descripción" class="full"></form>
  <div class="seg scroll" role="group" aria-label="Filtro">${segs.map(([k, l, n]) => `<button type="button" class="${SF.f === k ? 'on' : ''}" data-skf="${k}">${l} <small>${n}</small></button>`).join('')}</div>
  <input type="search" class="tf sk-q" placeholder="Filtrar por referencia o descripción" aria-label="Filtrar" value="${esc(SF.q)}">`;
  const items = [...d.added.map((a, i) => ({ key: 'a:' + i, ref: a.ref, desc: a.desc, qty: a.qty, newQty: a.qty, state: 'add', isNew: true })),
    ...d.rows.map(x => ({ key: String(x.r), ...x }))];
  const vis = items.filter(it => SF.f === 'all' || (SF.f === 'chg' ? it.state !== 'keep' : SF.f === 'add' ? it.state === 'add' || it.state === 'add0' : it.state === SF.f));
  h += `<div class="inv sk">${vis.map(it => {
    const p = partByRef(it.ref), nw = supersededBy(it.ref), m1 = p ? [...mo(p)].map(M).filter(Boolean)[0] : null;
    const stl = { keep: '', del: 'Eliminar', mod: `${it.qty} → ${it.newQty}`, add: 'Nueva', add0: 'Añadida' }[it.state];
    return `<div class="ii st-${it.state}" data-s="${esc(nrm(it.ref + ' ' + it.desc + ' ' + (p?.name || '')))}"><div class="ii-i">${it.state !== 'keep' ? `<span class="sk-t">${esc(stl)}</span>` : ''}<button type="button" class="ref" data-copy="${esc(it.ref)}" aria-label="Copiar ${esc(it.ref)}">${fmtRef(it.ref)}</button>
      <div class="small">${esc(it.desc || p?.name || '')}</div><div class="mut small">${p ? esc(p.type) + (m1 ? ' · ' + esc(m1.name) : '') : ''}${nw ? ` <a class="bd w" href="#/r/${encodeURIComponent(nw.ref)}">sustituida por ${esc(nw.ref)}</a>` : ''}</div></div>
      <div class="ii-a"><div class="step"><button type="button" data-skq="-1" data-k="${it.key}" aria-label="Restar" ${it.state === 'del' ? 'disabled' : ''}>−</button><span>${it.newQty}</span><button type="button" data-skq="1" data-k="${it.key}" aria-label="Sumar" ${it.state === 'del' ? 'disabled' : ''}>+</button></div>
      ${it.state === 'mod' ? `<button type="button" class="sm ghost" data-skr="${it.key}">Deshacer</button>` : ''}
      <button type="button" class="sm ${it.state === 'del' ? 'on' : 'ghost bad'}" data-skd="${it.key}">${it.isNew ? 'Quitar' : it.state === 'del' ? 'Mantener' : 'Eliminar'}</button></div></div>`;
  }).join('') || '<div class="empty"><p>Nada en este filtro.</p></div>'}</div>`;
  return intro + h;
}
