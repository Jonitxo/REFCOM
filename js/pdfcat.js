// Procesador de catálogos de piezas en PDF (solo editor).
// El PDF se lee en el navegador con PDF.js y NO se sube a ningún sitio: el catálogo es confidencial.
// Solo se publican las referencias que el editor marca e importa.
//
// Flujo: abrir PDF → leer texto posicionado → parseCatalog (catalog.js) → elegir serie, modelos y destino
// → marcar piezas (preselección: mantenimiento periódico, tipos conocidos y las que ya usan los técnicos)
// → importar al borrador (se puede deshacer hasta publicar).

import { $, $$, esc, uid, nrm, cmp, fmtRef, lsGet, lsSet, toast } from './util.js';
import { st, save, sIdx } from './store.js';
import { parseCatalog, effective, guessType, isSmall, supersessions, TYPE_SYSTEM } from './catalog.js';
import { invGet } from './inv.js';
import { stockGet } from './stock.js';

const KEY = 'refcom_pdfcat'; // por catálogo: configuración y piezas marcadas (solo referencias, nunca el PDF)
const NOTE_TAG = 'Catálogo';

export const PC = {
  file: null, doc: null, pages: null, cat: null, rows: [], byRef: new Map(),
  busy: '', prog: 0, err: '',
  cfg: null, sel: new Set(), types: new Map(),
  f: { q: '', u: '', only: false, small: true, na: false, limit: 150 },
  last: null // resumen de la última importación
};

/* ---------- PDF.js (carga diferida) ---------- */

let lib = null;
async function pdfjs() {
  if (!lib) {
    try { lib = await import('./vendor/pdfjs/pdf.min.js'); }
    catch { throw new Error('No se pudo cargar el lector de PDF. Comprueba la conexión y recarga la página.'); }
    lib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
  }
  return lib;
}

/** Texto posicionado de cada página, en coordenadas de la página tal y como se ve (y hacia abajo). */
async function readPages(doc, onProg) {
  const L = await pdfjs();
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n);
    const vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    pages.push({
      n, w: vp.width, h: vp.height,
      items: tc.items.filter(i => i.str && i.str.trim()).map(i => {
        const t = L.Util.transform(vp.transform, i.transform), h = Math.hypot(t[2], t[3]);
        return { s: i.str, x: t[4], y: t[5] - h * 0.85, w: i.width, h };
      })
    });
    pg.cleanup();
    if (n % 5 === 0 || n === doc.numPages) onProg(n / doc.numPages);
  }
  return pages;
}

export async function openPdf(file, rerender) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { alert('Elige un archivo PDF'); return; }
  closePdf();
  Object.assign(PC, { file, busy: 'Abriendo…', prog: 0, err: '' });
  rerender();
  try {
    const L = await pdfjs();
    const data = new Uint8Array(await file.arrayBuffer());
    PC.doc = await L.getDocument({ data, isEvalSupported: false }).promise;
    PC.busy = `Leyendo ${PC.doc.numPages} páginas…`; rerender();
    let t = 0;
    PC.pages = await readPages(PC.doc, p => { PC.prog = p; const now = Date.now(); if (now - t > 150) { t = now; progress(); } });
    PC.busy = 'Interpretando…'; progress();
    await new Promise(r => setTimeout(r, 0));
    PC.cat = parseCatalog(PC.pages);
    if (!PC.cat.parts.size) throw new Error(PC.cat.warnings[0] || 'No se han encontrado referencias');
    buildRows();
    loadCfg();
  } catch (x) {
    const msg = x?.name === 'PasswordException' ? 'El PDF está protegido con contraseña.' : (x?.message || String(x));
    closePdf(); PC.err = msg;
  }
  PC.busy = '';
  rerender();
}
function progress() {
  const b = $('#pcxProg'); if (b) b.style.width = Math.round(PC.prog * 100) + '%';
  const t = $('#pcxBusy'); if (t) t.textContent = PC.busy;
}

export function closePdf() {
  try { PC.doc?.destroy(); } catch { /* */ }
  Object.assign(PC, { file: null, doc: null, pages: null, cat: null, rows: [], byRef: new Map(), err: '', cfg: null, sel: new Set(), types: new Map(), last: null });
  PC.f = { q: '', u: '', only: false, small: true, na: false, limit: 150 };
}

/* ---------- filas ---------- */

const unitOf = g => String(g || '').split('_')[0];
function groupName(cat, g) {
  const segs = String(g || '').split('_');
  for (let i = segs.length; i > 0; i--) { const k = segs.slice(0, i).join('_'); if (cat.groups[k]?.name) return cat.groups[k].name; }
  return '';
}
const mainCodes = cat => {
  const m = /\(([A-Z0-9]{4}(?:\/[A-Z0-9]{4})*)\)/.exec(cat.title);
  return m ? m[1].split('/') : [];
};

function buildRows() {
  const cat = PC.cat;
  const oldsOf = new Map();
  supersessions(cat).forEach((n, o) => { if (n !== o) (oldsOf.get(n) || oldsOf.set(n, []).get(n)).push(o); });
  // referencias que ya usan los técnicos en este dispositivo (inventario y stock rule)
  const mine = new Set();
  try { const v = invGet(); ['tengo', 'pedir', 'devolver'].forEach(k => v[k].forEach(x => mine.add(nrm(x.ref)))); } catch { /* */ }
  try { const s = stockGet(); (s?.rows || []).forEach(r => mine.add(nrm(r.ref))); (s?.added || []).forEach(r => mine.add(nrm(r.ref))); } catch { /* */ }
  PC.rows = [...cat.parts.values()].map(p => {
    const e = effective(cat, p);
    const g0 = p.groups[0]?.g || '';
    const unit = unitOf(g0);
    return {
      ref: p.ref, name: p.name, unit, unitName: cat.units[unit] || '', group: g0, gname: groupName(cat, g0), id: p.groups[0]?.id || '',
      units: [...new Set(p.groups.map(x => unitOf(x.g)))],
      dest: e.dest, codes: e.codes, pm: cat.pm.has(p.ref), pmQty: cat.pm.get(p.ref)?.qty || 0,
      type: guessType(p.name), small: isSmall(p.name), olds: oldsOf.get(p.ref) || [], mine: mine.has(nrm(p.ref)),
      pages: cat.refPages.get(p.ref) || []
    };
  }).sort((a, b) => cmp(a.unit || 'U999', b.unit || 'U999') || cmp(a.group, b.group) || (+a.id || 999) - (+b.id || 999) || cmp(a.ref, b.ref));
  // un destino que cubre todos los del catálogo no es una restricción
  const all = new Set(PC.rows.flatMap(r => r.dest || []));
  PC.rows.forEach(r => { if (r.dest && [...all].every(d => r.dest.includes(d))) r.dest = null; else if (r.dest) r.dest = [...r.dest].sort(); });
  PC.byRef = new Map(PC.rows.map(r => [r.ref, r]));
}

/* ---------- configuración por catálogo ---------- */

const catKey = () => (PC.cat.title + '|' + PC.cat.version).slice(0, 120);
function defaultCfg() {
  const cat = PC.cat, codes = mainCodes(cat);
  const mains = cat.models.filter(m => m.main);
  const models = {};
  mains.forEach(m => {
    const code = m.code.split('/')[0];
    const ex = st.D.models.find(x => x.codes.some(c => nrm(c) === nrm(code)));
    models[m.code] = { on: codes.length ? codes.includes(code) : true, map: ex ? ex.id : 'new' };
  });
  // serie: la de los modelos ya existentes, si la hay
  const exIds = Object.values(models).map(x => x.map).filter(x => x !== 'new');
  const s = st.D.series.find(x => exIds.some(id => x.models.includes(id)));
  return { serie: s ? s.id : 'new', serieName: cat.title.replace(/\s*\([^)]*\)\s*$/, '').trim() || 'Nueva serie', models, dest: [] };
}
function loadCfg() {
  const all = lsGet(KEY, {}), saved = all[catKey()];
  const def = defaultCfg();
  PC.cfg = saved?.cfg ? { ...def, ...saved.cfg, models: { ...def.models, ...saved.cfg.models } } : def;
  // un modelo o serie guardados que ya no existen vuelven a «nuevo»
  if (PC.cfg.serie !== 'new' && !st.D.series.some(s => s.id === PC.cfg.serie)) PC.cfg.serie = 'new';
  Object.values(PC.cfg.models).forEach(m => { if (m.map !== 'new' && m.map !== '' && !st.D.models.some(x => x.id === m.map)) m.map = 'new'; });
  PC.sel = new Set(saved?.sel?.filter(r => PC.byRef.has(r)) || PC.rows.filter(preselect).map(r => r.ref));
  PC.types = new Map(Object.entries(saved?.types || {}));
}
function saveCfg() {
  if (!PC.cat) return;
  const all = lsGet(KEY, {});
  all[catKey()] = { at: Date.now(), cfg: PC.cfg, sel: [...PC.sel], types: Object.fromEntries(PC.types) };
  // se guardan como mucho 5 catálogos
  const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0));
  keys.slice(5).forEach(k => delete all[k]);
  lsSet(KEY, all);
}

/* ---------- aplicabilidad ---------- */

const preselect = r => r.pm || !!r.type || r.mine;
const activeModels = () => Object.entries(PC.cfg.models).filter(([, m]) => m.on && m.map !== '').map(([code]) => code);
function appliesTo(r, code, D) {
  const codes = code.split('/');
  if (r.codes) {
    const ds = codes.flatMap(c => r.codes[c] || []);
    if (!ds.length) return false;
    return !D.length || ds.some(d => D.includes(d));
  }
  if (r.dest && D.length) return r.dest.some(d => D.includes(d));
  return true;
}
const targetsOf = (r, am = activeModels()) => am.filter(code => appliesTo(r, code, PC.cfg.dest));
const typeOf = r => (PC.types.has(r.ref) ? PC.types.get(r.ref) : r.type);

/** Destinos que aparecen en el catálogo, con el número de piezas que los mencionan. */
function destinations() {
  const c = {};
  PC.rows.forEach(r => (r.dest || []).forEach(d => { c[d] = (c[d] || 0) + 1; }));
  return Object.entries(c).sort((a, b) => cmp(a[0], b[0]));
}

/* ---------- vista ---------- */

const partOf = ref => st.D.parts.find(p => nrm(p.ref) === nrm(ref));

export function pdfView() {
  if (!st.editing) return '<div class="empty"><p>El procesador de catálogos es solo para el editor.</p></div>';
  const intro = `<p class="mut small">Lee un catálogo de piezas de Ricoh en PDF (con texto seleccionable), propone las referencias útiles y las importa a una serie. <b>El PDF se procesa en este dispositivo y no se sube a ningún sitio</b>; solo se publican las referencias que importes.</p>`;
  const pick = `<label class="btn pri pcx-open">Abrir catálogo PDF<input type="file" accept="application/pdf,.pdf" data-pcfile hidden></label>`;
  if (PC.busy) return `${intro}<div class="pcx-busy"><div id="pcxBusy">${esc(PC.busy)}</div><div class="pcx-pb"><span id="pcxProg" style="width:${Math.round(PC.prog * 100)}%"></span></div></div>`;
  if (!PC.cat) return `${intro}${PC.err ? `<div class="banner">${esc(PC.err)}</div>` : ''}<div class="empty"><p>No hay ningún catálogo abierto.</p><p>${pick}</p></div>`;
  const cat = PC.cat;
  let h = `<div class="sk-h"><div><b>${esc(cat.title || PC.file.name)}</b><div class="mut small">${esc(cat.version)} · ${cat.pages} páginas · ${PC.rows.length} referencias · ${cat.pm.size} de mantenimiento · ${cat.changes.length} cambios de diseño</div></div>
    <button type="button" class="sm ghost" data-pc="close">Cerrar</button></div>`;
  if (PC.last) h += `<div class="banner ok">${PC.last}</div>`;
  h += cfgHTML();
  h += `<div class="pcx-f">
    <input type="search" class="tf" data-pcq placeholder="Buscar referencia o nombre" aria-label="Buscar" value="${esc(PC.f.q)}">
    <select data-pcu aria-label="Unidad"><option value="">Todas las unidades</option>${unitsList().map(([u, n, c, s]) => `<option value="${u}" ${PC.f.u === u ? 'selected' : ''}>${esc(u + ' ' + n)} (${s}/${c})</option>`).join('')}</select>
    <div class="filters"><label class="sw"><input type="checkbox" data-pcf="only" ${PC.f.only ? 'checked' : ''}><span>Solo marcadas</span></label>
    <label class="sw"><input type="checkbox" data-pcf="small" ${PC.f.small ? 'checked' : ''}><span>Ocultar piezas menores</span></label>
    <label class="sw"><input type="checkbox" data-pcf="na" ${PC.f.na ? 'checked' : ''}><span>Ver las que no aplican</span></label></div>
    <div class="acts"><button type="button" class="sm ghost" data-pc="all">Marcar visibles</button><button type="button" class="sm ghost" data-pc="none">Desmarcar visibles</button><button type="button" class="sm ghost" data-pc="pre">Volver a la preselección</button></div></div>`;
  h += `<div id="pcxList">${listHTML()}</div>`;
  h += `<div class="pcx-bar" id="pcxBar">${barHTML()}</div>`;
  return intro + h;
}

function unitsList() {
  const m = new Map();
  PC.rows.forEach(r => r.units.forEach(u => { const x = m.get(u) || [0, 0]; x[0]++; if (PC.sel.has(r.ref)) x[1]++; m.set(u, x); }));
  return [...m].sort((a, b) => cmp(a[0], b[0])).map(([u, [c, s]]) => [u, PC.cat.units[u] || '', c, s]);
}

function cfgHTML() {
  const c = PC.cfg, cat = PC.cat;
  const ss = [...st.D.series].sort((a, b) => cmp(a.name, b.name));
  const mains = cat.models.filter(m => m.main);
  const allM = [...st.D.models].sort((a, b) => cmp(a.name, b.name));
  const ds = destinations();
  return `<details class="pcx-cfg" ${activeModels().length ? '' : 'open'}><summary><b>Destino de la importación</b> <span class="mut small">${esc(c.serie === 'new' ? 'Nueva serie «' + c.serieName + '»' : (st.D.series.find(s => s.id === c.serie)?.name || ''))} · ${activeModels().length} modelos · ${c.dest.length ? 'destino ' + c.dest.join(', ') : 'todos los destinos'}</span></summary>
    <label class="fld"><span>Serie</span><select data-pcc="serie"><option value="new" ${c.serie === 'new' ? 'selected' : ''}>Nueva serie…</option>${ss.map(s => `<option value="${esc(s.id)}" ${c.serie === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    ${c.serie === 'new' ? `<label class="fld"><span>Nombre de la nueva serie</span><input data-pcc="serieName" value="${esc(c.serieName)}"></label>` : ''}
    <div class="fld"><span>Modelos del catálogo</span>${mains.map(m => {
      const x = c.models[m.code] || { on: false, map: 'new' };
      return `<div class="pcx-m"><label class="sw"><input type="checkbox" data-pcm="${esc(m.code)}" ${x.on ? 'checked' : ''}><span><b>${esc(m.name)}</b> <small class="mut">${esc(m.code)}</small></span></label>
        <select data-pcmap="${esc(m.code)}" aria-label="Modelo para ${esc(m.name)}" ${x.on ? '' : 'disabled'}><option value="new" ${x.map === 'new' ? 'selected' : ''}>Crear «${esc(m.name)}»</option>${allM.map(o => `<option value="${esc(o.id)}" ${x.map === o.id ? 'selected' : ''}>${esc(o.name)}${o.codes.length ? ' · ' + esc(o.codes.join('/')) : ''}</option>`).join('')}</select></div>`;
    }).join('') || '<p class="mut small">El catálogo no tiene tabla de modelos.</p>'}</div>
    ${ds.length ? `<div class="fld"><span>Destino (últimas 2 cifras del código de producto de la placa, p. ej. D0CA-<b>27</b>)</span><div class="pcx-d">${ds.map(([d, n]) => `<label class="sw"><input type="checkbox" data-pcd="${esc(d)}" ${c.dest.includes(d) ? 'checked' : ''}><span>${esc(d)} <small class="mut">${n}</small></span></label>`).join('')}</div>
      <p class="mut small">Sin marcar: se importan las variantes de todos los destinos. El catálogo no indica a qué país corresponde cada número; compruébalo en la placa de una máquina.</p></div>` : ''}
  </details>`;
}

function visible() {
  const q = nrm(PC.f.q);
  const am = activeModels();
  return PC.rows.filter(r => {
    if (PC.f.u && !r.units.includes(PC.f.u)) return false;
    if (PC.f.only && !PC.sel.has(r.ref)) return false;
    if (PC.f.small && r.small && !PC.sel.has(r.ref)) return false;
    if (!PC.f.na && am.length && !PC.sel.has(r.ref) && !targetsOf(r, am).length) return false;
    if (q && !nrm(r.ref + ' ' + r.name + ' ' + r.gname + ' ' + r.olds.join(' ')).includes(q)) return false;
    return true;
  });
}

function rowHTML(r) {
  const on = PC.sel.has(r.ref), tg = targetsOf(r), ex = partOf(r.ref), ty = typeOf(r);
  const b = [];
  if (r.pm) b.push(`<span class="bd c">PM${r.pmQty > 1 ? ' ×' + r.pmQty : ''}</span>`);
  if (ex) b.push(`<span class="bd ok">ya está</span>`);
  if (r.mine) b.push(`<span class="bd o">en tu inventario</span>`);
  if (r.dest) b.push(`<span class="bd o">destino ${esc(r.dest.join('/'))}</span>`);
  if (r.codes) b.push(`<span class="bd o">${esc(Object.entries(r.codes).map(([c, d]) => c + '-' + d.join(',')).join(' / '))}</span>`);
  if (activeModels().length && !tg.length) b.push('<span class="bd w">no aplica</span>');
  r.olds.forEach(o => b.push(`<span class="bd ${partOf(o) ? 'w' : 'o'}">sustituye a ${esc(o)}</span>`));
  const types = st.D.types.map(t => t.name);
  if (ty && !types.includes(ty)) types.push(ty);
  return `<div class="cr${on ? ' on' : ''}${tg.length || !activeModels().length ? '' : ' na'}">
    <label class="cr-c"><input type="checkbox" data-pcs="${esc(r.ref)}" ${on ? 'checked' : ''} aria-label="Importar ${esc(r.ref)}"></label>
    <div class="cr-b" data-pct="${esc(r.ref)}"><div class="cr-h"><span class="ref">${fmtRef(r.ref)}</span>${b.join('')}</div>
      <div class="cr-n">${esc(r.name)}</div>
      <div class="mut small">${esc([r.unit + (r.unitName ? ' ' + r.unitName : ''), r.gname && r.gname !== r.unitName ? r.gname : ''].filter(Boolean).join(' · '))}${r.id ? ' · nº ' + esc(r.id) : ''}</div></div>
    <div class="cr-a">${on ? `<select data-pcty="${esc(r.ref)}" aria-label="Tipo de ${esc(r.ref)}"><option value="">Sin tipo</option>${types.sort((a, b) => sIdx(a) - sIdx(b) || cmp(a, b)).map(t => `<option ${t === ty ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : ty ? `<span class="mut small">${esc(ty)}</span>` : ''}
      ${r.pages.length ? `<button type="button" class="sm ghost" data-pcp="${esc(r.ref)}">Lámina</button>` : ''}</div></div>`;
}

function listHTML() {
  const v = visible();
  if (!v.length) return '<div class="empty"><p>Nada con este filtro.</p></div>';
  return `<p class="mut small">${v.length} visibles</p><div class="crs">${v.slice(0, PC.f.limit).map(rowHTML).join('')}</div>`
    + (v.length > PC.f.limit ? `<div class="acts bottom"><button type="button" class="btn" data-pc="more">Mostrar más (${v.length - PC.f.limit})</button></div>` : '');
}

function barHTML() {
  const am = activeModels();
  const sel = PC.rows.filter(r => PC.sel.has(r.ref));
  const imp = sel.filter(r => targetsOf(r, am).length).length;
  const ok = am.length && (PC.cfg.serie !== 'new' || PC.cfg.serieName.trim());
  return `<span><b>${sel.length}</b> marcadas${sel.length !== imp ? ` <small class="mut">(${sel.length - imp} no aplican)</small>` : ''}</span>
    <button type="button" class="pri" data-pc="import" ${imp && ok ? '' : 'disabled'}>Importar ${imp}</button>`;
}

/** Refresca la lista y la barra sin rehacer la página (no se pierde el foco del buscador). */
function refreshList(full) {
  saveCfg();
  if (full) { const y = scrollY; rerenderAll(); scrollTo(0, y); return; }
  const l = $('#pcxList'); if (l) l.innerHTML = listHTML();
  const b = $('#pcxBar'); if (b) b.innerHTML = barHTML();
}
function refreshBar() { saveCfg(); const b = $('#pcxBar'); if (b) b.innerHTML = barHTML(); }

/* ---------- lámina ---------- */

async function showPage(ref, idx = 0) {
  const r = PC.byRef.get(ref); if (!r || !PC.doc) return;
  const n = r.pages[idx];
  const { openDialog } = await import('./forms.js');
  openDialog(`${ref} · página ${n}`, `${r.pages.length > 1 ? `<div class="seg scroll">${r.pages.map((p, i) => `<button type="button" class="${i === idx ? 'on' : ''}" data-pg="${i}">Pág. ${p}</button>`).join('')}</div>` : ''}
    <p class="mut small">${esc(r.name)} · Toca la imagen para ampliar.</p><div class="pcx-pg"><canvas></canvas></div>`, {
    wide: true,
    mount(f) {
      f.addEventListener('click', e => {
        const b = e.target.closest('[data-pg]'); if (b) { showPage(ref, +b.dataset.pg); return; }
        if (e.target.tagName === 'CANVAS') e.target.parentElement.classList.toggle('z');
      });
      draw(f.querySelector('canvas'), n, ref).catch(x => { f.querySelector('.err').textContent = x.message || String(x); });
    }
  });
}
async function draw(cv, n, ref) {
  const pg = await PC.doc.getPage(n);
  const base = pg.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.max(1.5, 1800 / base.width));
  const vp = pg.getViewport({ scale });
  cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await pg.render({ canvasContext: ctx, viewport: vp }).promise;
  // resalta la referencia en la lámina
  const items = PC.pages[n - 1]?.items || [];
  ctx.lineWidth = 3 * scale / 2; ctx.strokeStyle = '#e8590c'; ctx.fillStyle = 'rgba(255,170,0,.28)';
  let first = null;
  items.filter(i => i.s.includes(ref)).forEach(i => {
    const x = i.x * scale - 8, y = i.y * scale - 8, w = Math.max(i.w, 40) * scale + 16, h = i.h * scale + 16;
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
    if (!first) first = { x, y };
  });
  pg.cleanup();
  if (first) {
    const box = cv.parentElement;
    requestAnimationFrame(() => { const k = cv.clientWidth / cv.width; box.scrollTo({ top: Math.max(0, first.y * k - 80), left: Math.max(0, first.x * k - 80) }); });
  }
}

/* ---------- importar ---------- */

function doImport() {
  const c = PC.cfg, D = c.dest;
  const rows = PC.rows.filter(r => PC.sel.has(r.ref) && targetsOf(r).length);
  if (!rows.length) return;
  const mains = PC.cat.models.filter(m => m.main && c.models[m.code]?.on && c.models[m.code].map !== '');
  const res = { nuevas: 0, ampliadas: 0, modelos: 0, serie: '', tipos: 0 };
  // serie
  let serie = c.serie === 'new' ? null : st.D.series.find(s => s.id === c.serie);
  if (!serie) {
    serie = st.D.series.find(s => nrm(s.name) === nrm(c.serieName));
    if (!serie) { serie = { id: uid(), name: c.serieName.trim(), category: '', despiece: '', models: [] }; st.D.series.push(serie); res.serie = serie.name; }
    c.serie = serie.id;
  }
  // modelos
  const modelOf = {};
  mains.forEach(m => {
    const x = c.models[m.code];
    let mm = x.map !== 'new' ? st.D.models.find(o => o.id === x.map) : null;
    if (!mm) {
      const codes = m.code.split('/');
      mm = st.D.models.find(o => nrm(o.name) === nrm(m.name)) || null;
      if (!mm) { mm = { id: uid(), name: m.name, codes, platform: '', franja: '', despiece: '' }; st.D.models.push(mm); res.modelos++; }
      x.map = mm.id;
    }
    // un modelo nuevo o suelto pasa a la serie; uno que ya está en otra serie no se mueve
    if (!st.D.series.some(s => s.models.includes(mm.id))) serie.models.push(mm.id);
    modelOf[m.code] = mm;
  });
  // piezas
  const byRef = new Map(st.D.parts.map(p => [nrm(p.ref), p]));
  rows.forEach(r => {
    const t = targetsOf(r).map(code => modelOf[code]).filter(Boolean).map(m => ({ k: 'm', id: m.id }));
    if (!t.length) return;
    const type = typeOf(r) || '';
    if (type && !st.D.types.some(x => x.name === type)) { st.D.types.push({ name: type, system: TYPE_SYSTEM[type] || 'Otros', channel: '', common: false, alias: [] }); res.tipos++; }
    const note = [NOTE_TAG + ': ' + [r.unit, r.unitName].filter(Boolean).join(' '), r.dest && !D.length ? 'destino ' + r.dest.join('/') : ''].filter(Boolean).join(' · ');
    const ex = byRef.get(nrm(r.ref));
    if (ex) {
      t.forEach(x => { if (!ex.t.some(y => y.k === x.k && y.id === x.id)) ex.t.push(x); });
      ex.old = [...new Set([...ex.old, ...r.olds.filter(o => nrm(o) !== nrm(ex.ref))])];
      if (!ex.name) ex.name = r.name;
      if (!ex.type && type) ex.type = type;
      if (ex.gen) ex.gen = false;
      res.ampliadas++;
    } else {
      const np = { id: uid(), ref: r.ref, type, cl: false, img: '', name: r.name, note, hab: r.pm || !!type, chk: false, gen: false, old: [...r.olds], t };
      st.D.parts.push(np); byRef.set(nrm(r.ref), np); res.nuevas++;
    }
  });
  save();
  PC.last = `Importado en «${esc(serie.name)}»: ${res.nuevas} referencias nuevas, ${res.ampliadas} ya existentes ampliadas${res.modelos ? `, ${res.modelos} modelos creados` : ''}${res.serie ? ', serie creada' : ''}${res.tipos ? `, ${res.tipos} tipos nuevos` : ''}. Se puede deshacer desde «Editar» hasta publicar. <a href="#/s/${encodeURIComponent(serie.name)}">Ver la serie</a>`;
  saveCfg();
  return res;
}

/* ---------- eventos ---------- */

let rerenderAll = () => {};
export function bindPdf(rerender) {
  rerenderAll = rerender;
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-pcfile]')) { const f = t.files[0]; t.value = ''; if (f) openPdf(f, rerender); return; }
    if (!PC.cat || !t.closest('#main')) return;
    if (t.matches('[data-pcs]')) { t.checked ? PC.sel.add(t.dataset.pcs) : PC.sel.delete(t.dataset.pcs); swapRow(t.dataset.pcs); refreshBar(); return; }
    if (t.matches('[data-pcty]')) { const r = PC.byRef.get(t.dataset.pcty); if (t.value === r.type) PC.types.delete(r.ref); else PC.types.set(r.ref, t.value); saveCfg(); return; }
    if (t.matches('[data-pcu]')) { PC.f.u = t.value; PC.f.limit = 150; refreshList(); return; }
    if (t.matches('[data-pcf]')) { PC.f[t.dataset.pcf] = t.checked; PC.f.limit = 150; refreshList(); return; }
    if (t.matches('[data-pcm]')) { PC.cfg.models[t.dataset.pcm].on = t.checked; refreshList(true); return; }
    if (t.matches('[data-pcmap]')) { PC.cfg.models[t.dataset.pcmap].map = t.value; refreshList(true); return; }
    if (t.matches('[data-pcd]')) { const d = t.dataset.pcd; PC.cfg.dest = t.checked ? [...new Set([...PC.cfg.dest, d])].sort() : PC.cfg.dest.filter(x => x !== d); refreshList(true); return; }
    if (t.matches('[data-pcc=serie]')) { PC.cfg.serie = t.value; refreshList(true); return; }
    if (t.matches('[data-pcc=serieName]')) { PC.cfg.serieName = t.value.trim() || PC.cfg.serieName; refreshList(true); }
  });
  let qT;
  document.addEventListener('input', e => {
    if (!e.target.matches('[data-pcq]')) return;
    clearTimeout(qT); qT = setTimeout(() => { PC.f.q = e.target.value; PC.f.limit = 150; refreshList(); }, 150);
  });
  document.addEventListener('click', e => {
    if (!PC.cat) return;
    const el = e.target.closest('[data-pc],[data-pct],[data-pcp]'); if (!el || !el.closest('#main')) return;
    if (el.dataset.pct) { if (e.target.closest('a,button,select')) return; const ref = el.dataset.pct; PC.sel.has(ref) ? PC.sel.delete(ref) : PC.sel.add(ref); swapRow(ref); refreshBar(); return; }
    if (el.dataset.pcp) { showPage(el.dataset.pcp); return; }
    const a = el.dataset.pc;
    if (a === 'close') { if (confirm('¿Cerrar el catálogo? Las piezas marcadas se recuerdan en este dispositivo.')) { closePdf(); rerender(); } }
    else if (a === 'more') { PC.f.limit += 300; refreshList(); }
    else if (a === 'all') { visible().forEach(r => PC.sel.add(r.ref)); refreshList(); }
    else if (a === 'none') { visible().forEach(r => PC.sel.delete(r.ref)); refreshList(); }
    else if (a === 'pre') { if (confirm('Se sustituirán las marcas actuales por la preselección (mantenimiento, tipos conocidos y las de tu inventario). ¿Continuar?')) { PC.sel = new Set(PC.rows.filter(preselect).map(r => r.ref)); PC.types.clear(); refreshList(); } }
    else if (a === 'import') {
      const n = PC.rows.filter(r => PC.sel.has(r.ref) && targetsOf(r).length).length;
      if (!confirm(`Se importarán ${n} referencias al borrador. ¿Continuar?`)) return;
      const res = doImport();
      if (res) { rerender(); scrollTo(0, 0); toast(`${res.nuevas} nuevas, ${res.ampliadas} ampliadas`); }
    }
  });
}
function swapRow(ref) {
  const cb = $$('[data-pcs]', $('#pcxList') || document).find(x => x.dataset.pcs === ref);
  const row = cb?.closest('.cr'); if (!row) return;
  const tmp = document.createElement('div'); tmp.innerHTML = rowHTML(PC.byRef.get(ref));
  row.replaceWith(tmp.firstElementChild);
}

/** Para las pruebas y la consola: estado sin el PDF. */
export const _test = { appliesTo, targetsOf, preselect, doImport };
