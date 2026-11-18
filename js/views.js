// Vistas: cada función devuelve HTML a partir del estado. Sin manejadores de eventos (ver app.js).

import { esc, fmtRef, cmp, nrm, color, franjaColor, lsGet, isUrl } from './util.js';
import {
  st, K, ix, M, SR, TY, serieOf, mo, partsOf, partByRef, tIdx, sIdx, sysOf, chOf, colsOf, byTypeRef,
  modelsOfSerie, isCommon, originOf, despieceOf, categories
} from './store.js';
import { LISTS, invGet, invQtyOf } from './inv.js';

/* ---------- enlaces y piezas pequeñas ---------- */

export const linkM = m => '#/m/' + encodeURIComponent(m.name);
export const linkS = s => '#/s/' + encodeURIComponent(s.name);
export const linkR = r => '#/r/' + encodeURIComponent(r);
const ed = () => st.editing;

export const refBtn = (ref, cls = '') =>
  `<button type="button" class="ref ${cls}" data-copy="${esc(ref)}" aria-label="Copiar referencia ${esc(ref)}">${fmtRef(ref)}</button>`;
const typeTag = t => { const ch = chOf(t); return `<span class="tt ${ch ? 'ch-' + ch : ''}">${esc(t || 'Sin tipo')}</span>`; };
const badges = p => (p.hab ? '' : '<span class="bd o">poco habitual</span>') + (p.chk ? '<span class="bd w">verificar</span>' : '');
const frTag = f => (f ? `<span class="fr" style="--c:${franjaColor(f)}">${esc(f)}</span>` : '');
const codes = m => (m.codes.length ? `<span class="code">${esc(m.codes.join(' / '))}</span>` : '');
export const pl = (n, a, b) => n + ' ' + (n === 1 ? a : b);
const empty = (msg, extra = '') => `<div class="empty"><p>${msg}</p>${extra}</div>`;
const mchip = m => `<a class="mc" href="${linkM(m)}">${esc(m.name)}${m.codes.length ? ' <small>' + esc(m.codes[0]) + '</small>' : ''}</a>`;
const editBtn = (act, id, label = 'Editar') => (ed() ? `<button type="button" class="sm ghost" data-act="${act}" data-id="${esc(id)}">${label}</button>` : '');

function invBtn(list, ref) {
  const q = invQtyOf(list, ref);
  return `<button type="button" class="sm ${q ? 'on' : ''}" data-inv="${list}" data-ref="${esc(ref)}" aria-label="Añadir ${esc(ref)} a ${LISTS[list]}">${q ? LISTS[list] + ' · ' + q : '+ ' + LISTS[list]}</button>`;
}

/** Resumen de los modelos de una pieza: series completas como una etiqueta, el resto por modelo. */
function appliesTo(p, max = 6) {
  const set = mo(p), left = new Set(set), out = [];
  st.D.series.forEach(s => {
    if (s.models.length > 1 && s.models.every(id => set.has(id))) { out.push(`<a class="mc s" href="${linkS(s)}">${esc(s.name)} <small>serie</small></a>`); s.models.forEach(id => left.delete(id)); }
  });
  [...left].map(M).filter(Boolean).sort((a, b) => cmp(a.name, b.name)).forEach(m => out.push(mchip(m)));
  if (!out.length) return '<span class="mut">—</span>';
  return out.slice(0, max).join('') + (out.length > max ? `<span class="mut">+${out.length - max}</span>` : '');
}
function originNote(p, exceptId) {
  const o = originOf(p.ref).filter(m => m.id !== exceptId);
  return o.length ? `<span class="org">Origen: ${o.map(m => `<a href="${linkM(m)}">${esc(m.name)}</a>`).join(', ')}</span>` : '';
}

/* ---------- favoritos y recientes (por dispositivo) ---------- */

export const favs = () => { const f = lsGet(K.fav, {}); return { m: Array.isArray(f.m) ? f.m : [], p: Array.isArray(f.p) ? f.p : [] }; };
export const isFav = (k, id) => favs()[k].includes(id);

/* ---------- búsqueda tolerante ---------- */

export const termsOf = q => String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
const has = (f, t, nt) => { f = String(f || ''); return f.toLowerCase().includes(t) || (nt.length > 1 && nrm(f).includes(nt)); };
const matchAll = (fields, terms) => terms.every(t => { const nt = nrm(t); return fields.some(f => has(f, t, nt)); });
export function partMatches(p, terms) {
  if (!terms.length) return true;
  const f = [p.ref, p.name, p.type, p.note];
  if (terms.length > 1) mo(p).forEach(id => { const m = M(id); if (m) f.push(m.name, m.platform, ...m.codes, serieOf(id)?.name); });
  return matchAll(f, terms);
}
const modelMatches = (m, terms) => matchAll([m.name, m.platform, m.franja, ...m.codes, serieOf(m.id)?.name], terms);
const serieMatches = (s, terms) => matchAll([s.name, s.category], terms);

/* ---------- filtros ---------- */

export const F = { hab: false, type: '' };
const pass = p => (!F.hab || p.hab) && (!F.type || p.type === F.type);
function filtersHTML(withType = true) {
  return `<div class="filters"><label class="sw"><input type="checkbox" data-filter="hab" ${F.hab ? 'checked' : ''}><span>Solo habituales</span></label>${withType ? `<select data-filter="type" aria-label="Filtrar por tipo"><option value="">Todos los tipos</option>${st.D.types.map(t => `<option ${t.name === F.type ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : ''}</div>`;
}

/* ---------- INICIO ---------- */

export function homeView(cat) {
  const D = st.D, cats = categories();
  let h = '';
  const f = favs(), fm = f.m.map(M).filter(Boolean), fp = f.p.map(id => ix.P.get(id)).filter(Boolean);
  const rec = lsGet(K.rec, []).map(M).filter(Boolean);
  if (fm.length || fp.length) h += `<section class="blk"><h2 class="h">Favoritos</h2><div class="wrap">${fm.map(mchip).join('')}${fp.map(p => `<span class="chip">${typeTag(p.type)}${refBtn(p.ref)}</span>`).join('')}</div></section>`;
  if (rec.length) h += `<section class="blk"><h2 class="h">Recientes</h2><div class="wrap">${rec.map(mchip).join('')}</div></section>`;

  if (!D.series.length && !D.models.length) {
    return h + empty(ed() ? '<b>Inventario vacío.</b> Empieza creando una serie y sus modelos.' : 'Todavía no hay datos publicados.',
      ed() ? `<ol class="steps"><li><b>Serie</b>: «Editar» → «+ Serie» (p. ej. METIS MF4).</li><li><b>Modelos</b>: dentro de la serie, «+ Modelo» con nombre y código (IM C2010 · D0DY).</li><li><b>Piezas</b>: en el modelo, «+ Pieza»; o «Importar tabla» desde Excel.</li></ol>` : '');
  }
  if (cats.length > 1) h += `<div class="seg scroll" role="group" aria-label="Categoría">${['', ...cats].map(c => `<button type="button" class="${(cat || '') === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c || 'Todas')}</button>`).join('')}</div>`;
  const series = D.series.filter(s => !cat || s.category === cat).sort((a, b) => cmp(a.name, b.name));
  h += `<section class="blk"><h2 class="h">Series <span class="mut">${series.length}</span></h2><div class="cards">` + series.map(s => {
    const ms = modelsOfSerie(s), n = new Set(ms.flatMap(m => partsOf(m.id).map(p => p.id))).size;
    return `<a class="card" href="${linkS(s)}" style="--c:${color(s.name)}"><div class="card-h"><b>${esc(s.name)}</b>${s.category ? `<span class="cat">${esc(s.category)}</span>` : ''}</div><div class="card-m">${ms.map(m => `<span>${esc(m.name)}${m.codes.length ? ' <small>' + esc(m.codes[0]) + '</small>' : ''}</span>`).join('') || '<span class="mut">Sin modelos</span>'}</div><div class="card-f">${ms.length} modelo${ms.length === 1 ? '' : 's'} · ${n} referencia${n === 1 ? '' : 's'}</div></a>`;
  }).join('') + '</div></section>';
  const free = D.models.filter(m => !serieOf(m.id));
  if (free.length && !cat) h += `<section class="blk"><h2 class="h">Modelos sin serie</h2><div class="list">${free.map(modelRow).join('')}</div></section>`;
  const gen = D.parts.filter(p => p.gen).length, un = D.parts.filter(p => !p.gen && !mo(p).size).length;
  if (gen || un) h += `<section class="blk"><div class="list">${gen ? `<a class="row" href="#/gen"><b>Generales y consumibles</b><span class="n">${gen}</span></a>` : ''}${un && ed() ? `<a class="row" href="#/un"><b>Sin asignar</b><span class="n">${un}</span></a>` : ''}</div></section>`;
  return h;
}

function modelRow(m) {
  const n = partsOf(m.id).length;
  return `<a class="row" href="${linkM(m)}" style="--fr:${franjaColor(m.franja)}"><span class="rm"><b>${esc(m.name)}</b>${codes(m)}</span>${frTag(m.franja)}<span class="n">${n}</span></a>`;
}

/* ---------- SERIE ---------- */

export function serieView(s, view) {
  const ms = modelsOfSerie(s);
  const parts = st.D.parts.filter(p => !p.gen && ms.some(m => mo(p).has(m.id)));
  const com = parts.filter(p => isCommon(p, s)).sort(byTypeRef);
  let h = `<header class="ph" style="--c:${color(s.name)}"><div class="crumb"><a href="#/">Series</a>${s.category ? ' · ' + esc(s.category) : ''}</div><h1>${esc(s.name)}</h1>
    <div class="meta">${pl(ms.length, 'modelo', 'modelos')} · ${pl(parts.length, 'referencia', 'referencias')}${com.length ? ` · ${pl(com.length, 'común', 'comunes')}` : ''}</div>
    <div class="acts">${s.despiece && isUrl(s.despiece) ? `<a class="btn" href="${esc(s.despiece)}" target="_blank" rel="noopener">Despiece</a>` : ''}${editBtn('editSerie', s.id, 'Editar serie')}${ed() ? `<button type="button" class="sm ghost" data-act="newModel" data-id="${esc(s.id)}">+ Modelo</button>` : ''}<button type="button" class="sm ghost" data-act="csv" data-id="s:${esc(s.id)}">CSV</button></div></header>`;
  h += `<div class="seg" role="group" aria-label="Vista">${[['models', 'Modelos'], ['ov', 'Resumen'], ['matrix', 'Matriz']].map(([k, l]) => `<button type="button" class="${view === k ? 'on' : ''}" data-view="${k}" aria-pressed="${view === k}">${l}</button>`).join('')}</div>`;
  if (view === 'ov') return h + filtersHTML() + overviewSerie(s, ms, false);
  if (view === 'matrix') return h + filtersHTML() + matrixHTML(ms, s);
  h += ms.length ? `<div class="list">${ms.map(modelRow).join('')}</div>` : empty('Sin modelos.' + (ed() ? ' Usa «+ Modelo».' : ''));
  if (com.length) h += `<section class="blk"><h2 class="h">Común a toda la serie</h2><div class="wrap">${com.map(p => `<span class="chip">${typeTag(p.type)}${refBtn(p.ref)}</span>`).join('')}</div></section>`;
  return h;
}

/* ---------- MODELO ---------- */

export function modelView(m) {
  const s = serieOf(m.id), dsp = despieceOf(m), fv = isFav('m', m.id);
  const all = partsOf(m.id), list = all.filter(pass).sort(byTypeRef);
  let h = `<header class="ph" style="--c:${s ? color(s.name) : 'var(--pri)'}">
    <div class="crumb">${s ? `<a href="${linkS(s)}">${esc(s.name)}</a>` : '<span>Sin serie</span>'}${m.franja ? ' · ' + frTag(m.franja) : ''}</div>
    <h1>${esc(m.name)}</h1>
    <div class="ids">${m.codes.length ? `<div><span>Código</span><b>${esc(m.codes.join(' / '))}</b></div>` : ''}${m.platform ? `<div><span>Plataforma</span><b>${esc(m.platform)}</b></div>` : ''}<div><span>Referencias</span><b>${all.length}</b></div></div>
    <div class="acts">${dsp && isUrl(dsp) ? `<a class="btn pri" href="${esc(dsp)}" target="_blank" rel="noopener">Despiece</a>` : ''}<button type="button" class="sm ghost ${fv ? 'on' : ''}" data-fav="m" data-id="${esc(m.id)}" aria-pressed="${fv}">${fv ? '★ Favorito' : '☆ Favorito'}</button><button type="button" class="sm ghost" data-act="share">Enlace</button>${editBtn('editModel', m.id)}${ed() ? `<button type="button" class="sm ghost" data-act="newPart" data-id="m:${esc(m.id)}">+ Pieza</button>` : ''}</div></header>`;
  if (!all.length) return h + empty('Sin referencias para este modelo.' + (ed() ? ' Usa «+ Pieza».' : ''));
  const bySys = new Map();
  list.forEach(p => { const k = sysOf(p.type); (bySys.get(k) || bySys.set(k, []).get(k)).push(p); });
  const systems = [...bySys.keys()].sort((a, b) => ix.sys.indexOf(a) - ix.sys.indexOf(b));
  if (systems.length > 1) h += `<div class="jump scroll">${systems.map((x, i) => `<button type="button" data-jump="sys${i}">${esc(x)} <small>${bySys.get(x).length}</small></button>`).join('')}</div>`;
  h += filtersHTML(false);
  if (!list.length) return h + empty('Ninguna referencia con el filtro actual.');
  return h + systems.map((x, i) => `<section class="blk" id="sys${i}"><h2 class="h">${esc(x)}</h2><div class="parts">${bySys.get(x).map(p => partCard(p, m, s)).join('')}</div></section>`).join('');
}

function partCard(p, m, s) {
  const others = [...mo(p)].filter(id => id !== m?.id).length;
  const meta = [originNote(p, m?.id), others ? `<a href="${linkR(p.ref)}">Compartida con ${others} modelo${others > 1 ? 's' : ''}</a>` : '', s && isCommon(p, s) ? '<span>Común a la serie</span>' : ''].filter(Boolean).join(' · ');
  return `<article class="pc"><div class="pc-h">${typeTag(p.type)}${badges(p)}</div>${refBtn(p.ref, 'big')}${p.name || p.note ? `<div class="pc-d">${esc(p.name)}${p.name && p.note ? ' · ' : ''}<span class="mut">${esc(p.note)}</span></div>` : ''}${meta ? `<div class="pc-m">${meta}</div>` : ''}<div class="pc-a">${invBtn('pedir', p.ref)}${invBtn('tengo', p.ref)}<a class="sm ghost btn" href="${linkR(p.ref)}">Detalle</a>${editBtn('editPart', p.id)}</div></article>`;
}

/* ---------- REFERENCIA ---------- */

export function refView(ref) {
  const p = partByRef(ref);
  if (!p) {
    return `<header class="ph"><div class="crumb"><a href="#/">Series</a></div><h1 class="refh">${fmtRef(ref)}</h1><div class="meta">No está en el catálogo.</div><div class="acts"><button type="button" class="btn pri" data-copy="${esc(ref)}">Copiar</button>${invBtn('pedir', ref)}${invBtn('tengo', ref)}${invBtn('devolver', ref)}</div></header>`;
  }
  const set = mo(p), fv = isFav('p', p.id);
  const groups = new Map();
  [...set].map(M).filter(Boolean).forEach(m => { const s = serieOf(m.id); const k = s ? s.id : ''; (groups.get(k) || groups.set(k, []).get(k)).push(m); });
  const blocks = [...groups.entries()].sort((a, b) => cmp(SR(a[0])?.name || '~', SR(b[0])?.name || '~')).map(([sid, ms]) => {
    const s = SR(sid), whole = s && s.models.length > 1 && s.models.length === ms.length;
    return `<div class="list"><div class="lh">${s ? `<a href="${linkS(s)}">${esc(s.name)}</a>${whole ? ' <span class="bd c">toda la serie</span>' : ''}` : 'Sin serie'}</div>${ms.sort((a, b) => cmp(a.name, b.name)).map(modelRow).join('')}</div>`;
  }).join('');
  return `<header class="ph"><div class="crumb">${typeTag(p.type)} ${badges(p)}</div>
    <h1 class="refh">${refBtn(p.ref, 'huge')}</h1>
    ${p.name ? `<div class="pc-d big">${esc(p.name)}</div>` : ''}${p.note ? `<div class="mut">${esc(p.note)}</div>` : ''}
    <div class="pc-m">${originNote(p)}</div>
    <div class="acts"><button type="button" class="btn pri" data-copy="${esc(p.ref)}">Copiar</button>${invBtn('pedir', p.ref)}${invBtn('tengo', p.ref)}${invBtn('devolver', p.ref)}<button type="button" class="sm ghost ${fv ? 'on' : ''}" data-fav="p" data-id="${esc(p.id)}" aria-pressed="${fv}">${fv ? '★' : '☆'} Favorita</button>${editBtn('editPart', p.id)}</div></header>
    <section class="blk"><h2 class="h">${p.gen ? 'Pieza general (sin modelo)' : `Aplica a ${set.size} modelo${set.size === 1 ? '' : 's'}`}</h2>${blocks || (p.gen ? '' : empty('Sin modelos asignados'))}</section>`;
}

/* ---------- LISTA DE PIEZAS (búsqueda, generales, revisión) ---------- */

function partRows(list, limit = 150) {
  const total = list.length;
  list = [...list].sort(byTypeRef).slice(0, limit);
  return `<div class="plist">${list.map(p => `<div class="pr"><div class="pr-h">${typeTag(p.type)}${badges(p)}${editBtn('editPart', p.id)}</div><div class="pr-r">${refBtn(p.ref)}<a class="go" href="${linkR(p.ref)}" aria-label="Detalle de ${esc(p.ref)}">›</a></div>${p.name ? `<div class="pc-d">${esc(p.name)}</div>` : ''}${p.gen ? '' : `<div class="pr-m">${appliesTo(p)}</div>`}</div>`).join('')}</div>${total > limit ? `<p class="mut">Mostrando ${limit} de ${total}. Afina la búsqueda.</p>` : ''}`;
}

export function searchView(q) {
  const t = termsOf(q);
  if (!t.length) return empty('Escribe una referencia, un modelo o un código.');
  const ms = st.D.models.filter(m => modelMatches(m, t)).sort((a, b) => cmp(a.name, b.name));
  const ss = st.D.series.filter(s => serieMatches(s, t));
  const ps = st.D.parts.filter(p => partMatches(p, t) && pass(p));
  // Una referencia exacta va directa arriba
  const exact = partByRef(q);
  let h = `<div class="meta sr">«${esc(q)}» · ${ms.length} modelos · ${ps.length} referencias</div>`;
  if (!ms.length && !ss.length && !ps.length) return h + empty('Sin resultados. La búsqueda ignora mayúsculas, acentos, espacios y guiones.');
  if (exact) h += `<a class="row hl" href="${linkR(exact.ref)}"><span class="rm"><b>${esc(exact.ref)}</b><span class="mut">${esc(exact.type)} ${esc(exact.name)}</span></span><span class="n">›</span></a>`;
  if (ss.length) h += `<section class="blk"><h2 class="h">Series</h2><div class="list">${ss.map(s => `<a class="row" href="${linkS(s)}"><span class="rm"><b>${esc(s.name)}</b><span class="mut">${esc(s.category)}</span></span><span class="n">${s.models.length}</span></a>`).join('')}</div></section>`;
  if (ms.length) h += `<section class="blk"><h2 class="h">Modelos</h2><div class="list">${ms.slice(0, 30).map(modelRow).join('')}</div></section>`;
  if (ps.length) h += `<section class="blk"><h2 class="h">Referencias</h2>${filtersHTML()}${partRows(ps)}</section>`;
  return h;
}

export function genView(kind) {
  const list = st.D.parts.filter(p => (kind === 'gen' ? p.gen : !p.gen && !mo(p).size) && pass(p));
  return `<header class="ph"><div class="crumb"><a href="#/">Series</a></div><h1>${kind === 'gen' ? 'Generales y consumibles' : 'Sin asignar'}</h1><div class="meta">${kind === 'gen' ? 'Piezas que no dependen de un modelo' : 'Referencias sin modelo: edítalas para asignarlas'}</div></header>` +
    (list.length ? partRows(list) : empty('Vacío.'));
}

/* ---------- VISTA GENERAL ---------- */

function chip(p) { return `<span class="chip ${chOf(p.type) ? 'ch-' + chOf(p.type) : ''}"><i>${esc(p.type)}</i>${refBtn(p.ref)}</span>`; }

function overviewSerie(s, ms, collapsible = true) {
  const parts = st.D.parts.filter(p => !p.gen && pass(p) && ms.some(m => mo(p).has(m.id)));
  const com = s ? parts.filter(p => isCommon(p, s)) : [];
  const cs = new Set(com.map(p => p.id));
  const rows = ms.map(m => {
    const l = parts.filter(p => mo(p).has(m.id) && !cs.has(p.id)).sort(byTypeRef);
    return `<div class="ovm" style="--fr:${franjaColor(m.franja)}"><a class="ovh" href="${linkM(m)}"><b>${esc(m.name)}</b>${codes(m)}${frTag(m.franja)}</a><div class="wrap">${l.map(chip).join('') || '<span class="mut">Sin referencias</span>'}</div></div>`;
  }).join('');
  const body = `${com.length ? `<div class="ovcom"><span class="lbl">Común a la serie</span><div class="wrap">${com.sort(byTypeRef).map(chip).join('')}</div></div>` : ''}${rows || '<div class="ovm mut">Sin modelos</div>'}`;
  if (!collapsible) return `<div class="ovs">${body}</div>`;
  return `<details class="ovs" open style="--c:${s ? color(s.name) : 'var(--bd)'}"><summary><b>${s ? esc(s.name) : 'Modelos sin serie'}</b><small>${ms.length} modelos</small>${s ? `<a href="${linkS(s)}" class="mut">Abrir</a>` : ''}</summary>${body}</details>`;
}

export function overviewView(cat) {
  const cats = categories();
  let h = `<header class="ph"><h1>Vista general</h1><div class="meta">Todos los modelos y sus referencias. Toca una referencia para copiarla.</div><div class="acts"><button type="button" class="sm ghost" data-ovall="1">Desplegar todo</button><button type="button" class="sm ghost" data-ovall="0">Plegar todo</button></div></header>`;
  if (cats.length > 1) h += `<div class="seg scroll" role="group" aria-label="Categoría">${['', ...cats].map(c => `<button type="button" class="${(cat || '') === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c || 'Todas')}</button>`).join('')}</div>`;
  h += filtersHTML();
  const series = st.D.series.filter(s => !cat || s.category === cat).sort((a, b) => cmp(a.name, b.name));
  h += series.map(s => overviewSerie(s, modelsOfSerie(s))).join('');
  const free = st.D.models.filter(m => !serieOf(m.id));
  if (free.length && !cat) h += overviewSerie(null, free);
  return h + (series.length || free.length ? '' : empty('Sin datos.'));
}

/* ---------- MATRIZ (pantallas anchas) ---------- */

function matrixHTML(ms, serie) {
  if (!ms.length) return empty('Sin modelos.');
  const parts = st.D.parts.filter(p => !p.gen && pass(p) && ms.some(m => mo(p).has(m.id)));
  const common = [], mx = [];
  parts.forEach(p => (isCommon(p, serie) ? common : mx).push(p));
  const set = new Set(); mx.forEach(p => colsOf(p).forEach(t => set.add(t)));
  const types = [...set].sort((a, b) => sIdx(a) - sIdx(b) || tIdx(a) - tIdx(b) || cmp(a, b));
  const sys = []; types.forEach(t => { const s = sysOf(t); if (sys.length && sys[sys.length - 1].s === s) sys[sys.length - 1].n++; else sys.push({ s, n: 1 }); });
  const cols = types.map(t => ms.map(m => mx.filter(p => mo(p).has(m.id) && colsOf(p).includes(t)).sort((a, b) => cmp(a.ref, b.ref))));
  const key = l => l.map(p => p.id).join(',');
  const skip = types.map(() => ms.map(() => false));
  let h = `<div class="tw"><table class="mtx"><caption class="vh">Matriz de referencias de ${esc(serie?.name || '')}</caption><thead><tr><th class="stk" rowspan="2" scope="col">Modelo</th><th rowspan="2" scope="col">Código</th>${sys.map(x => `<th class="sysh" colspan="${x.n}" scope="colgroup">${esc(x.s)}</th>`).join('')}</tr><tr>${types.map(t => `<th class="${chOf(t) ? 'ch-' + chOf(t) : ''}" scope="col">${esc(t)}</th>`).join('')}</tr></thead><tbody>`;
  ms.forEach((m, i) => {
    h += `<tr><th class="stk" scope="row" style="box-shadow:inset 5px 0 0 ${franjaColor(m.franja)}"><a href="${linkM(m)}">${esc(m.name)}</a></th><td class="mut">${esc(m.codes.join(' / '))}</td>`;
    types.forEach((t, j) => {
      if (skip[j][i]) return;
      const l = cols[j][i], ch = chOf(t);
      if (!l.length) { h += '<td class="emp"></td>'; return; }
      let n = 1; while (i + n < ms.length && key(cols[j][i + n]) === key(l)) { skip[j][i + n] = true; n++; }
      h += `<td rowspan="${n}" class="${ch ? 'ch-' + ch : ''}">${l.map(p => refBtn(p.ref)).join('<br>')}</td>`;
    });
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  if (common.length) h += `<section class="blk"><h2 class="h">Común a toda la serie</h2><div class="wrap">${common.sort(byTypeRef).map(chip).join('')}</div></section>`;
  return h + '<p class="mut small">Celdas combinadas: una misma referencia compartida por varios modelos. Cabeceras K, C, M, Y: unidades reveladoras. Barra de la fila: franja.</p>';
}

/* ---------- INVENTARIO PERSONAL ---------- */

export function invView(list) {
  const v = invGet(), items = v[list];
  const tabs = Object.entries(LISTS).map(([k, l]) => `<a href="#/inv/${k}" class="${k === list ? 'on' : ''}" ${k === list ? 'aria-current="page"' : ''}>${l} <small>${v[k].length}</small></a>`).join('');
  const hint = { tengo: 'Piezas que llevas. Marca si son de uso habitual u ocasional.', pedir: 'Piezas que necesitas pedir. «Recibida» la pasa a «Tengo».', devolver: 'Piezas que vas a devolver.' }[list];
  let h = `<header class="ph"><h1>Mi inventario</h1><div class="meta">Se guarda solo en este dispositivo.</div></header><nav class="seg tabs" aria-label="Listas">${tabs}</nav>
  <form class="invadd" data-form="invadd" data-list="${list}" autocomplete="off"><input name="ref" list="dlRefs" placeholder="Referencia" aria-label="Referencia" required><input name="qty" type="number" min="1" value="1" inputmode="numeric" aria-label="Cantidad"><button class="pri">Añadir</button></form>
  <p class="mut small">${hint}</p>`;
  if (!items.length) return h + empty('Lista vacía. Añade desde aquí o con «+ ' + LISTS[list] + '» en cualquier referencia.');
  const sorted = list === 'tengo' ? [...items].sort((a, b) => (a.uso === 'hab' ? 0 : a.uso === 'ocas' ? 1 : 2) - (b.uso === 'hab' ? 0 : b.uso === 'ocas' ? 1 : 2) || cmp(a.ref, b.ref)) : items;
  h += `<div class="inv">${sorted.map(it => {
    const p = partByRef(it.ref), first = p ? [...mo(p)].map(M).filter(Boolean)[0] : null;
    const uso = list === 'tengo' ? `<button type="button" class="sm uso ${it.uso}" data-iuso="${esc(it.ref)}" aria-label="Cambiar uso">${it.uso === 'hab' ? 'Habitual' : it.uso === 'ocas' ? 'Ocasional' : 'Uso…'}</button>` : '';
    const mv = list === 'pedir' ? `<button type="button" class="sm" data-imove="pedir:tengo" data-ref="${esc(it.ref)}">Recibida</button>` : list === 'devolver' ? `<button type="button" class="sm" data-idel="devolver" data-ref="${esc(it.ref)}">Devuelta</button>` : '';
    return `<div class="ii"><div class="ii-i">${refBtn(it.ref)}<div class="mut small">${p ? esc([p.type, p.name].filter(Boolean).join(' · ')) : 'Fuera del catálogo'}${first ? ' · ' + esc(first.name) + (mo(p).size > 1 ? ' +' + (mo(p).size - 1) : '') : ''}</div></div>
      <div class="ii-a">${uso}${mv}<div class="step"><button type="button" data-iq="-1" data-ref="${esc(it.ref)}" aria-label="Restar">−</button><span aria-live="polite">${it.qty}</span><button type="button" data-iq="1" data-ref="${esc(it.ref)}" aria-label="Sumar">+</button></div><button type="button" class="sm ghost x" data-idel="${list}" data-ref="${esc(it.ref)}" aria-label="Quitar ${esc(it.ref)}">✕</button></div></div>`;
  }).join('')}</div>`;
  h += `<div class="acts bottom"><button type="button" class="btn pri" data-ishare="${list}">Compartir lista</button><button type="button" class="sm ghost" data-iexp>Exportar copia</button><button type="button" class="sm ghost" data-iimp>Importar copia</button><button type="button" class="sm ghost bad" data-iclear="${list}">Vaciar</button></div>`;
  return h;
}

export function invText(list) {
  const items = invGet()[list];
  const head = LISTS[list] + ' · ' + new Date().toLocaleDateString('es-ES');
  return head + '\n' + items.map(it => { const p = partByRef(it.ref); return `${it.ref}${p ? ' · ' + [p.type, p.name].filter(Boolean).join(' · ') : ''} — ${it.qty} ud`; }).join('\n');
}

/* ---------- REVISIÓN (editor) ---------- */

export function reviewData() {
  const D = st.D, used = new Set(); D.parts.forEach(p => mo(p).forEach(id => used.add(id)));
  const refs = new Map(); D.parts.forEach(p => { const k = nrm(p.ref); (refs.get(k) || refs.set(k, []).get(k)).push(p); });
  return {
    dupRefs: [...refs.values()].filter(a => a.length > 1).flat(),
    unassigned: D.parts.filter(p => !p.gen && !mo(p).size),
    chk: D.parts.filter(p => p.chk),
    badRef: D.parts.filter(p => !p.gen && !/^[A-Z0-9]{8}$/.test(p.ref)),
    noType: D.parts.filter(p => !p.type || !TY(p.type)),
    origin: D.parts.filter(p => { const o = originOf(p.ref); return o.length && !p.gen && mo(p).size && !o.some(m => mo(p).has(m.id)); }),
    noParts: D.models.filter(m => !used.has(m.id)),
    noSerie: D.models.filter(m => !serieOf(m.id)),
    noCode: D.models.filter(m => !m.codes.length),
    emptyS: D.series.filter(s => !s.models.length),
    dupCodes: [...ix.byCode.entries()].filter(([, a]) => a.length > 1)
  };
}
export const blocking = d => d.dupRefs.length + d.noType.filter(p => p.type && !TY(p.type)).length;
export const issueCount = d => d.dupRefs.length + d.unassigned.length + d.chk.length + d.badRef.length + d.noType.length + d.noParts.length + d.noSerie.length + d.noCode.length + d.emptyS.length + d.dupCodes.length;

export function reviewView() {
  const d = reviewData(), n = issueCount(d);
  const sec = (title, arr, body, note = '') => (arr.length ? `<section class="blk"><h2 class="h">${title} <span class="mut">${arr.length}</span></h2>${note ? `<p class="mut small">${note}</p>` : ''}${body}</section>` : '');
  const ml = a => `<div class="list">${a.map(modelRow).join('')}</div>`;
  let h = `<header class="ph"><h1>Revisión</h1><div class="meta">${n} incidencias. Las marcadas como bloqueantes impiden publicar.</div></header>`;
  h += sec('Referencias duplicadas (bloqueante)', d.dupRefs, partRows(d.dupRefs));
  h += sec('Piezas sin modelo asignado', d.unassigned, partRows(d.unassigned));
  h += sec('Por verificar', d.chk, partRows(d.chk));
  h += sec('Formato inusual (no son 8 caracteres)', d.badRef, partRows(d.badRef));
  h += sec('Tipo vacío o fuera del catálogo', d.noType, partRows(d.noType));
  h += sec('Origen no asignado (informativo)', d.origin, partRows(d.origin), 'El prefijo coincide con el código de un modelo al que la pieza no está asignada. Puede ser correcto.');
  h += sec('Modelos sin referencias', d.noParts, ml(d.noParts));
  h += sec('Modelos sin serie', d.noSerie, ml(d.noSerie));
  h += sec('Modelos sin código', d.noCode, ml(d.noCode));
  h += sec('Series sin modelos', d.emptyS, `<div class="list">${d.emptyS.map(s => `<a class="row" href="${linkS(s)}"><b>${esc(s.name)}</b></a>`).join('')}</div>`);
  h += sec('Códigos repetidos en varios modelos', d.dupCodes, d.dupCodes.map(([c, a]) => `<div class="list"><div class="lh">${esc(c.toUpperCase())}</div>${a.map(modelRow).join('')}</div>`).join(''));
  return h + (n || d.origin.length ? '' : empty('Sin incidencias.'));
}
