// Stock de seguridad de tóner por delegación.
// Datos en data.json (st.D.toner); los edita el editor y los consulta todo el equipo.
//   toner: { delegs: [{ id, name, counted:'AAAA-MM-DD', items: [{ id, tipo, cat, model, edp, edp2, color, a, n, note }] }] }
//   a = stock actual, n = stock necesario. Reponer = n − a (si es positivo).

import { $, $$, esc, nrm, cmp, uid, lsGet, lsSet, toast, copyText, download } from './util.js';
import { st, save, modelByName } from './store.js';
import { loadZip } from './stock.js';

const KDEL = 'refcom_toner_deleg';
const COLORS = ['K', 'C', 'M', 'Y'];
const CORD = { K: 0, C: 1, M: 2, Y: 3 };
export const TS = { q: '', only: false, count: null }; // count: {delegId, vals:{itemId:n}} en modo recuento

/* ---------- datos ---------- */

export function sanitizeToner(t) {
  const s = v => String(v ?? '').trim();
  const n = v => { const x = parseInt(v, 10); return Number.isFinite(x) && x >= 0 ? x : 0; };
  const delegs = (t && Array.isArray(t.delegs) ? t.delegs : []).filter(d => d && d.id && s(d.name)).map(d => ({
    id: String(d.id), name: s(d.name), counted: /^\d{4}-\d{2}-\d{2}$/.test(d.counted || '') ? d.counted : '',
    items: (Array.isArray(d.items) ? d.items : []).filter(i => i && i.id && s(i.model)).map(i => ({
      id: String(i.id), tipo: s(i.tipo), cat: s(i.cat), model: s(i.model), edp: s(i.edp), edp2: s(i.edp2),
      color: COLORS.includes(s(i.color).toUpperCase()) ? s(i.color).toUpperCase() : s(i.color), a: n(i.a), n: n(i.n), note: s(i.note)
    }))
  }));
  return { delegs };
}
const T = () => st.D.toner || (st.D.toner = { delegs: [] });
export const delegs = () => T().delegs;
const D = id => delegs().find(d => d.id === id);
const need = i => Math.max(0, i.n - i.a);
export const myDeleg = () => { const id = lsGet(KDEL, ''); return D(id) ? id : ''; };
export const setMyDeleg = id => lsSet(KDEL, id);
const sortItems = l => [...l].sort((x, y) => cmp(x.model, y.model) || (CORD[x.color] ?? 9) - (CORD[y.color] ?? 9) || cmp(x.color, y.color));

/* ---------- vista ---------- */

const fmtDate = d => (d ? d.split('-').reverse().join('/') : '');
const colorTag = c => `<span class="tt ${CORD[c] !== undefined ? 'ch-' + c : ''}">${esc(c || '—')}</span>`;

function itemRow(d, i) {
  const r = need(i), pct = i.n ? Math.min(100, Math.round(i.a / i.n * 100)) : 100;
  const s = nrm([i.model, i.edp, i.edp2, i.color, i.cat, i.tipo].join(' '));
  const ed = st.editing;
  const counting = TS.count && TS.count.delegId === d.id;
  const cv = counting ? TS.count.vals[i.id] : null;
  return `<div class="tr ${r ? 'low' : 'ok'}" data-s="${esc(s)}">
    <div class="tr-i">${colorTag(i.color)}<div class="tr-c"><button type="button" class="ref sm" data-copy="${esc(i.edp)}" aria-label="Copiar EDP ${esc(i.edp)}">${esc(i.edp || '—')}</button>${i.edp2 ? `<span class="mut small">${esc(i.edp2)}</span>` : ''}</div></div>
    <div class="tr-b" title="${i.a} de ${i.n}"><span style="width:${pct}%"></span></div>
    ${counting
      ? `<label class="tr-cnt"><span class="mut small">Contado</span><input type="number" min="0" inputmode="numeric" data-tcount="${esc(i.id)}" value="${cv ?? ''}" placeholder="${i.a}" aria-label="Cantidad contada de ${esc(i.model)} ${esc(i.color)}"></label>`
      : `<div class="tr-q">${ed ? `<div class="step"><button type="button" data-tq="-1" data-d="${esc(d.id)}" data-i="${esc(i.id)}" aria-label="Restar uno">−</button><span><b>${i.a}</b>/${i.n}</span><button type="button" data-tq="1" data-d="${esc(d.id)}" data-i="${esc(i.id)}" aria-label="Sumar uno">+</button></div>` : `<span class="tr-n"><b>${i.a}</b> / ${i.n}</span>`}
        ${r ? `<span class="bd w">Reponer ${r}</span>` : '<span class="bd ok">Completo</span>'}${ed ? `<button type="button" class="sm ghost" data-tedit="${esc(i.id)}" data-d="${esc(d.id)}" aria-label="Editar fila">✎</button>` : ''}</div>`}
    ${i.note ? `<div class="mut small tr-note">${esc(i.note)}</div>` : ''}
  </div>`;
}

export function tonerView(delegName) {
  const ds = delegs(), ed = st.editing;
  if (!ds.length) {
    return `<header class="ph"><h1>Stock de tóner</h1><div class="meta">Stock de seguridad de tóner de cada delegación.</div>${ed ? '<div class="acts"><button type="button" class="btn pri" data-t="import">Importar Excel del stock</button><button type="button" class="sm ghost" data-t="newdeleg">+ Delegación</button></div>' : ''}</header>
      <div class="empty"><p>${ed ? 'Importa el Excel actual (una hoja por delegación) o crea las delegaciones a mano.' : 'Todavía no hay datos de stock publicados.'}</p></div>`;
  }
  const d = ds.find(x => nrm(x.name) === nrm(delegName)) || D(myDeleg()) || ds[0];
  const mine = myDeleg() === d.id;
  const items = sortItems(d.items);
  const nLow = items.filter(need).length, units = items.reduce((n, i) => n + need(i), 0);
  const counting = TS.count && TS.count.delegId === d.id;
  let h = `<header class="ph"><div class="crumb">Stock de tóner${d.counted ? ` · último recuento ${fmtDate(d.counted)}` : ''}</div><h1>${esc(d.name)}</h1>
    <div class="meta">${items.length} referencias · <b>${nLow}</b> a reponer (${units} ud)</div>
    <div class="acts">${mine ? '<span class="bd c">Mi delegación</span>' : `<button type="button" class="sm ghost" data-t="mine" data-d="${esc(d.id)}">Fijar como mi delegación</button>`}
      <button type="button" class="sm ${nLow ? 'pri' : 'ghost'}" data-t="order" data-d="${esc(d.id)}" ${nLow ? '' : 'disabled'}>Pedido de reposición</button>
      <button type="button" class="sm ghost" data-t="export">Exportar Excel</button>
      ${ed ? `<button type="button" class="sm ghost" data-t="count" data-d="${esc(d.id)}">${counting ? 'Cancelar recuento' : 'Recuento'}</button><button type="button" class="sm ghost" data-t="add" data-d="${esc(d.id)}">+ Fila</button><button type="button" class="sm ghost" data-t="deleg" data-d="${esc(d.id)}">Delegación…</button><button type="button" class="sm ghost" data-t="import">Importar Excel</button>` : ''}</div></header>`;
  // delegaciones con su número de referencias a reponer
  h += `<div class="seg scroll" role="group" aria-label="Delegación">${ds.map(x => { const n = x.items.filter(need).length; return `<a href="#/toner/${encodeURIComponent(x.name)}" class="${x.id === d.id ? 'on' : ''}" ${x.id === d.id ? 'aria-current="page"' : ''}>${esc(x.name)}${n ? ` <small class="lowc">${n}</small>` : ''}</a>`; }).join('')}</div>`;
  if (counting) {
    const done = Object.keys(TS.count.vals).length;
    h += `<div class="banner cnt">Modo recuento: escribe lo que hay en la estantería. Las filas en blanco no cambian. <b>${done}</b> contadas.<div class="acts"><button type="button" class="btn pri" data-t="countok">Revisar diferencias</button></div></div>`;
  }
  h += `<div class="filters"><label class="sw"><input type="checkbox" data-tonly ${TS.only ? 'checked' : ''}><span>Solo a reponer (${nLow})</span></label></div>
    <input type="search" class="tf tq" placeholder="Buscar modelo o código EDP" aria-label="Buscar modelo o código EDP" value="${esc(TS.q)}">`;
  const list = TS.only && !counting ? items.filter(need) : items;
  if (!list.length) return h + `<div class="empty"><p>${TS.only ? 'No hay nada que reponer.' : 'Sin referencias.'}</p></div>`;
  const groups = new Map();
  list.forEach(i => (groups.get(i.model) || groups.set(i.model, []).get(i.model)).push(i));
  h += [...groups.entries()].map(([model, l]) => {
    const m = modelByName(model), r = l.filter(need).length;
    return `<section class="tg" data-tg><h2 class="tg-h">${m ? `<a href="#/m/${encodeURIComponent(m.name)}">${esc(model)}</a>` : `<b>${esc(model)}</b>`}<span class="mut small">${esc([l[0].tipo, l[0].cat].filter(Boolean).join(' · '))}</span>${r ? `<span class="bd w">${r}</span>` : ''}</h2>${l.map(i => itemRow(d, i)).join('')}</section>`;
  }).join('');
  return h;
}

/** Filtro de texto aplicado en el propio DOM (sin repintar). */
export function applyFilter() {
  const v = nrm(TS.q);
  $$('#main .tr[data-s]').forEach(r => { r.hidden = !!v && !r.dataset.s.includes(v); });
  $$('#main .tg[data-tg]').forEach(g => { g.hidden = !g.querySelector('.tr:not([hidden])'); });
}

/* ---------- edición (editor) ---------- */

export function changeQty(did, iid, delta) {
  const it = D(did)?.items.find(x => x.id === iid); if (!it) return;
  it.a = Math.max(0, it.a + delta); save();
}
export function setMine(id) { setMyDeleg(id); }

export function itemFormHTML(it) {
  const f = (label, name, val, type = 'text', extra = '') => `<label class="fld"><span>${label}</span><input name="${name}" type="${type}" value="${esc(val ?? '')}" ${extra}></label>`;
  return `${f('Modelo', 'model', it?.model, 'text', 'required')}
    <div class="two">${f('Código EDP', 'edp', it?.edp, 'text', 'inputmode="numeric"')}${f('Código EDP II', 'edp2', it?.edp2, 'text', 'inputmode="numeric"')}</div>
    <div class="two"><label class="fld"><span>Color</span><select name="color">${['', ...COLORS].map(c => `<option value="${c}" ${(it?.color || '') === c ? 'selected' : ''}>${c || '—'}</option>`).join('')}</select></label>${f('Tipo', 'tipo', it?.tipo, 'text', 'list="dlTTipo" placeholder="Color, B/N"')}</div>
    <div class="two">${f('Stock actual', 'a', it?.a ?? 0, 'number', 'min="0" inputmode="numeric"')}${f('Stock necesario', 'n', it?.n ?? 1, 'number', 'min="0" inputmode="numeric"')}</div>
    ${f('Categoría', 'cat', it?.cat, 'text', 'placeholder="MFP, Impresora…"')}${f('Nota', 'note', it?.note)}
    <datalist id="dlTTipo"><option value="Color"><option value="B/N"></datalist>`;
}
export function saveItem(did, iid, f) {
  const d = D(did); if (!d) return;
  const v = n => f.elements[n].value.trim(), num = n => Math.max(0, parseInt(v(n), 10) || 0);
  const data = { model: v('model'), edp: v('edp'), edp2: v('edp2'), color: v('color'), tipo: v('tipo'), cat: v('cat'), note: v('note'), a: num('a'), n: num('n') };
  if (!data.model) throw new Error('Indica el modelo');
  const it = iid && d.items.find(x => x.id === iid);
  if (it) Object.assign(it, data); else d.items.push({ id: uid(), ...data });
  save();
}
export function deleteItem(did, iid) { const d = D(did); if (!d) return; d.items = d.items.filter(x => x.id !== iid); save(); }

export function addDeleg(name) {
  name = String(name || '').trim().toUpperCase(); if (!name) return null;
  if (delegs().some(d => nrm(d.name) === nrm(name))) throw new Error('Ya existe esa delegación');
  const d = { id: uid(), name, counted: '', items: [] }; delegs().push(d); save(); return d;
}
export function renameDeleg(id, name) {
  name = String(name || '').trim().toUpperCase(); const d = D(id); if (!d || !name) return;
  if (delegs().some(x => x.id !== id && nrm(x.name) === nrm(name))) throw new Error('Ya existe esa delegación');
  d.name = name; save();
}
export function copyItemsFrom(id, fromId) {
  const d = D(id), f = D(fromId); if (!d || !f) return 0;
  const have = new Set(d.items.map(i => nrm(i.model + '|' + i.edp + '|' + i.color)));
  let n = 0;
  f.items.forEach(i => { if (!have.has(nrm(i.model + '|' + i.edp + '|' + i.color))) { d.items.push({ ...i, id: uid(), a: 0 }); n++; } });
  save(); return n;
}
export function deleteDeleg(id) { T().delegs = delegs().filter(d => d.id !== id); save(); }

/* ---------- recuento ---------- */

export function startCount(did) { TS.count = TS.count && TS.count.delegId === did ? null : { delegId: did, vals: {} }; }
export function setCount(iid, val) {
  if (!TS.count) return;
  if (val === '' || val == null) delete TS.count.vals[iid];
  else TS.count.vals[iid] = Math.max(0, parseInt(val, 10) || 0);
}
export function countDiffs() {
  const d = TS.count && D(TS.count.delegId); if (!d) return [];
  return sortItems(d.items).filter(i => TS.count.vals[i.id] !== undefined && TS.count.vals[i.id] !== i.a).map(i => ({ i, to: TS.count.vals[i.id] }));
}
export function applyCount() {
  const d = TS.count && D(TS.count.delegId); if (!d) return 0;
  const diffs = countDiffs();
  diffs.forEach(({ i, to }) => { i.a = to; });
  d.counted = new Date().toISOString().slice(0, 10);
  TS.count = null; save(); return diffs.length;
}

/* ---------- pedido de reposición ---------- */

export function orderText(did) {
  const d = D(did); if (!d) return '';
  const l = sortItems(d.items).filter(need);
  return `Reposición de tóner · ${d.name} · ${new Date().toLocaleDateString('es-ES')}\n` +
    l.map(i => `${i.model} · ${i.color || '-'} · EDP ${i.edp || '-'}${i.edp2 ? ' / ' + i.edp2 : ''} — ${need(i)} ud`).join('\n') +
    `\nTotal: ${l.reduce((n, i) => n + need(i), 0)} ud`;
}

/* ---------- importar desde el Excel actual ---------- */

/** sheets: hojas leídas por el visor de Excel (xls.js). Devuelve un resumen. */
export function importSheets(sheets) {
  const req = ['modelo', 'stockactual', 'stocknecesario'];
  const ok = sheets.filter(s => !s.hidden && req.every(k => s.cols.some(c => c.key === k)));
  if (!ok.length) throw new Error('No se reconoce el formato: hacen falta hojas visibles con las columnas Modelo, STOCK ACTUAL y STOCK NECESARIO.');
  const num = v => { const x = parseInt(String(v || '').replace(/\./g, ''), 10); return Number.isFinite(x) && x >= 0 ? x : 0; };
  const res = [];
  ok.forEach(s => {
    const name = s.name.trim().toUpperCase();
    let d = delegs().find(x => nrm(x.name) === nrm(name));
    if (!d) { d = { id: uid(), name, counted: '', items: [] }; delegs().push(d); }
    const items = s.rows.filter(r => r.v.modelo && !/^n\/?a$/i.test(r.v.modelo)).map(r => ({
      id: uid(), tipo: r.v.tipo || '', cat: r.v.categoria || '', model: r.v.modelo, edp: r.v.edpcode || '', edp2: r.v.edpcodeii || '',
      color: String(r.v.color || '').toUpperCase(), a: num(r.v.stockactual), n: num(r.v.stocknecesario), note: r.v.ultimafechainventario || ''
    }));
    d.items = items;
    res.push(`${name}: ${items.length}`);
  });
  T().delegs = sanitizeToner(T()).delegs;
  save();
  return res;
}

/* ---------- exportar a .xlsx (mismas hojas y columnas que el archivo actual) ---------- */

const xmlEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
export async function exportXlsx() {
  const JSZip = await loadZip(), zip = new JSZip();
  const ds = delegs();
  const sheetName = n => n.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Hoja';
  // estilos: 0 normal, 1 título, 2 cabecera, 3-6 color K C M Y, 7 reponer > 0, 8 nota
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
    ...['002060', '000000', '66FFFF', 'FF99FF', 'FFFFCC', 'FFC7CE'].map(c => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`)];
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="${fills.length}">${fills.join('')}</fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  const cS = { K: 3, C: 4, M: 5, Y: 6 };
  const str = (ref, v, s = 0) => `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  const num = (ref, v, s = 0) => `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
  const code = (ref, v) => (/^\d{1,15}$/.test(v) ? num(ref, v) : v ? str(ref, v) : `<c r="${ref}" s="0"/>`);
  const head = ['Tipo', 'Categoria', 'Modelo', 'EDP      Code', 'EDP      Code II', 'Color', 'STOCK ACTUAL', 'STOCK NECESARIO', '', 'REPONER', '', 'ULTIMA FECHA INVENTARIO'];
  const sheets = ds.map(d => {
    let r = 2;
    const rows = [`<row r="1">${str('A1', d.name, 1)}${d.counted ? str('L1', 'Último recuento: ' + fmtDate(d.counted), 8) : ''}</row>`,
      `<row r="2" ht="30" customHeight="1">${head.map((h, i) => (h ? str(String.fromCharCode(65 + i) + 2, h, 2) : '')).join('')}</row>`];
    sortItems(d.items).forEach(i => {
      r++;
      rows.push(`<row r="${r}">${str('A' + r, i.tipo)}${str('B' + r, i.cat)}${str('C' + r, i.model)}${code('D' + r, i.edp)}${code('E' + r, i.edp2)}${str('F' + r, i.color, cS[i.color] ?? 0)}${num('G' + r, i.a)}${num('H' + r, i.n)}<c r="J${r}" s="${need(i) ? 7 : 0}"><f>H${r}-G${r}</f><v>${i.n - i.a}</v></c>${i.note ? str('L' + r, i.note, 8) : ''}</row>`);
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:L${Math.max(r, 2)}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="2" width="11" customWidth="1"/><col min="3" max="3" width="20" customWidth="1"/><col min="4" max="5" width="12" customWidth="1"/><col min="6" max="6" width="7" customWidth="1"/><col min="7" max="8" width="11" customWidth="1"/><col min="9" max="9" width="3" customWidth="1"/><col min="10" max="10" width="10" customWidth="1"/><col min="11" max="11" width="3" customWidth="1"/><col min="12" max="12" width="30" customWidth="1"/></cols>
<sheetData>${rows.join('')}</sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells><autoFilter ref="A2:L${Math.max(r, 2)}"/></worksheet>`;
  });
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  const used = new Set(); const names = ds.map(d => { let n = sheetName(d.name), k = 2; while (used.has(n.toLowerCase())) n = sheetName(d.name).slice(0, 28) + ' ' + k++; used.add(n.toLowerCase()); return n; });
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames>${names.map((n, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xmlEsc(n).replace(/'/g, "''")}'!$A$2:$L$${Math.max(ds[i].items.length + 2, 2)}</definedName>`).join('')}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', styles);
  sheets.forEach((x, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, x));
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  return { blob, name: `Stock_Seguridad_Toner_${new Date().toISOString().slice(0, 10)}.xlsx` };
}
