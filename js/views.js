// Vistas: cada función devuelve HTML a partir del estado. Sin manejadores de eventos (ver app.js).

import { esc, fmtRef, cmp, nrm, color, franjaColor, lsGet, isUrl } from './util.js';
import {
  st, K, ix, M, SR, TY, serieOf, mo, partsOf, partByRef, tIdx, sIdx, sysOf, chOf, colsOf, byTypeRef,
  modelsOfSerie, isCommon, originOf, despieceOf, categories, supersededBy, techOf, techMo
} from './store.js';
import { LISTS, invGet, invQtyOf } from './inv.js';
import { stockView, stockGet } from './stock.js';

/* ---------- enlaces y piezas pequeñas ---------- */

export const linkM = m => '#/m/' + encodeURIComponent(m.name);
export const linkS = s => '#/s/' + encodeURIComponent(s.name);
export const linkR = r => '#/r/' + encodeURIComponent(r);
const ed = () => st.editing;

export const refBtn = (ref, cls = '') =>
  `<button type="button" class="ref ${cls}" data-copy="${esc(ref)}" aria-label="Copiar referencia ${esc(ref)}">${fmtRef(ref)}</button>`;
const typeTag = t => { const ch = chOf(t); return `<span class="tt ${ch ? 'ch-' + ch : ''}">${esc(t || 'Sin tipo')}</span>`; };
const badges = p => { const n = supersededBy(p.ref); return (n ? `<a class="bd w" href="${linkR(n.ref)}">sustituida por ${esc(n.ref)}</a>` : '') + (p.hab ? '' : '<span class="bd o">poco habitual</span>') + (p.chk ? '<span class="bd w">verificar</span>' : ''); };
const oldNote = p => (p.old.length ? `<span>Sustituye a ${p.old.map(esc).join(', ')}</span>` : '');
/** Botón «Avisar»: abre un correo (o compartir) con el contexto ya escrito. */
export const reportBtn = (subject, body) => `<button type="button" class="sm ghost" data-report="${esc(subject)}" data-body="${esc(body)}">Avisar de un error</button>`;
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
  const f = [p.ref, p.name, p.type, p.note, ...p.old];
  if (terms.length > 1) mo(p).forEach(id => { const m = M(id); if (m) f.push(m.name, m.platform, ...m.codes, serieOf(id)?.name); });
  return matchAll(f, terms);
}
const modelMatches = (m, terms) => matchAll([m.name, m.platform, m.franja, ...m.codes, serieOf(m.id)?.name], terms);
const serieMatches = (s, terms) => matchAll([s.name, s.category], terms);
const techMatches = (x, terms) => matchAll([x.code, x.code.replace(/^SC/i, ''), x.title, x.causes, x.steps, x.note, ...x.refs], terms);

/* ---------- mis series (por dispositivo) ---------- */

export const mine = () => { const v = lsGet(K.mine, []); return Array.isArray(v) ? v.filter(id => ix.S.has(id)) : []; };
export const UI = { all: false };   // «Todas» frente a «Mis series»
const mineFilter = s => { const m = mine(); return UI.all || !m.length || m.includes(s.id); };
function mineBar() {
  const m = mine();
  if (!m.length) return st.D.series.length > 1 ? `<p class="small"><button type="button" class="sm ghost" data-act="mine">Elegir mis series</button> <span class="mut">para ver solo las que atiendes</span></p>` : '';
  return `<div class="seg" role="group" aria-label="Series visibles"><button type="button" class="${UI.all ? '' : 'on'}" data-all="0">Mis series <small>${m.length}</small></button><button type="button" class="${UI.all ? 'on' : ''}" data-all="1">Todas</button><button type="button" data-act="mine" aria-label="Elegir mis series">Elegir…</button></div>`;
}

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
  h += mineBar();
  const series = D.series.filter(s => (!cat || s.category === cat) && mineFilter(s)).sort((a, b) => cmp(a.name, b.name));
  h += `<section class="blk"><h2 class="h">Series <span class="mut">${series.length}</span></h2><div class="cards">` + series.map(s => {
    const ms = modelsOfSerie(s), n = new Set(ms.flatMap(m => partsOf(m.id).map(p => p.id))).size;
    return `<a class="card" href="${linkS(s)}" style="--c:${color(s.name)}"><div class="card-h"><b>${esc(s.name)}</b>${s.category ? `<span class="cat">${esc(s.category)}</span>` : ''}</div><div class="card-m">${ms.map(m => `<span>${esc(m.name)}${m.codes.length ? ' <small>' + esc(m.codes[0]) + '</small>' : ''}</span>`).join('') || '<span class="mut">Sin modelos</span>'}</div><div class="card-f">${ms.length} modelo${ms.length === 1 ? '' : 's'} · ${n} referencia${n === 1 ? '' : 's'}</div></a>`;
  }).join('') + '</div></section>';
  const free = D.models.filter(m => !serieOf(m.id));
  if (free.length && !cat) h += `<section class="blk"><h2 class="h">Modelos sin serie</h2><div class="list">${free.map(modelRow).join('')}</div></section>`;
  const gen = D.parts.filter(p => p.gen).length, un = D.parts.filter(p => !p.gen && !mo(p).size).length;
  h += `<p class="small"><a href="#/ayuda">Cómo se usa</a></p>`;
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
    <div class="acts">${dsp && isUrl(dsp) ? `<a class="btn pri" href="${esc(dsp)}" target="_blank" rel="noopener">Despiece</a>` : ''}<button type="button" class="sm ghost ${fv ? 'on' : ''}" data-fav="m" data-id="${esc(m.id)}" aria-pressed="${fv}">${fv ? '★ Favorito' : '☆ Favorito'}</button><button type="button" class="sm ghost" data-act="share">Enlace</button>${reportBtn('Referencias ' + m.name, `Modelo: ${m.name}${m.codes.length ? ' (' + m.codes.join(' / ') + ')' : ''}\nEnlace: ${location.origin + location.pathname + linkM(m)}\n\nFalta o error: `)}${editBtn('editModel', m.id)}${ed() ? `<button type="button" class="sm ghost" data-act="newPart" data-id="m:${esc(m.id)}">+ Pieza</button>` : ''}</div></header>`;
  const tech = techOf(m.id);
  const techBlk = tech.length || ed() ? `<section class="blk" id="tec"><h2 class="h">Técnico <span class="mut">${tech.length}</span></h2>${tech.length ? techRows(tech) : ''}${ed() ? `<button type="button" class="sm ghost" data-act="newTech" data-id="m:${esc(m.id)}">+ SC o consulta</button>` : ''}</section>` : '';
  if (!all.length) return h + empty('Sin referencias para este modelo.' + (ed() ? ' Usa «+ Pieza».' : '')) + techBlk;
  const bySys = new Map();
  list.forEach(p => { const k = sysOf(p.type); (bySys.get(k) || bySys.set(k, []).get(k)).push(p); });
  const systems = [...bySys.keys()].sort((a, b) => ix.sys.indexOf(a) - ix.sys.indexOf(b));
  if (systems.length > 1 || tech.length) h += `<div class="jump scroll">${systems.map((x, i) => `<button type="button" data-jump="sys${i}">${esc(x)} <small>${bySys.get(x).length}</small></button>`).join('')}${tech.length ? `<button type="button" data-jump="tec">Técnico <small>${tech.length}</small></button>` : ''}</div>`;
  h += filtersHTML(false);
  if (!list.length) return h + empty('Ninguna referencia con el filtro actual.') + techBlk;
  return h + systems.map((x, i) => `<section class="blk" id="sys${i}"><h2 class="h">${esc(x)}</h2><div class="parts">${bySys.get(x).map(p => partCard(p, m, s)).join('')}</div></section>`).join('') + techBlk;
}

function partCard(p, m, s) {
  const others = [...mo(p)].filter(id => id !== m?.id).length;
  const meta = [originNote(p, m?.id), oldNote(p), others ? `<a href="${linkR(p.ref)}">Compartida con ${others} modelo${others > 1 ? 's' : ''}</a>` : '', s && isCommon(p, s) ? '<span>Común a la serie</span>' : ''].filter(Boolean).join(' · ');
  return `<article class="pc"><div class="pc-h">${typeTag(p.type)}${badges(p)}</div>${refBtn(p.ref, 'big')}${p.name || p.note ? `<div class="pc-d">${esc(p.name)}${p.name && p.note ? ' · ' : ''}<span class="mut">${esc(p.note)}</span></div>` : ''}${meta ? `<div class="pc-m">${meta}</div>` : ''}<div class="pc-a">${invBtn('pedir', p.ref)}${invBtn('tengo', p.ref)}<a class="sm ghost btn" href="${linkR(p.ref)}">Detalle</a>${editBtn('editPart', p.id)}</div></article>`;
}

/* ---------- REFERENCIA ---------- */

export function refView(ref) {
  const p = partByRef(ref), nw = supersededBy(ref);
  if (!p && nw) {
    return `<header class="ph" style="--c:var(--warn)"><div class="crumb"><span class="bd w">sustituida</span></div><h1 class="refh">${fmtRef(ref)}</h1><div class="meta">Referencia anterior. La vigente es:</div><div class="acts"><a class="btn pri" href="${linkR(nw.ref)}">${esc(nw.ref)} · ${esc(nw.type)}</a></div></header>`;
  }
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
    <div class="pc-m">${[originNote(p), oldNote(p)].filter(Boolean).join(' · ')}</div>
    <div class="acts"><button type="button" class="btn pri" data-copy="${esc(p.ref)}">Copiar</button>${invBtn('pedir', p.ref)}${invBtn('tengo', p.ref)}${invBtn('devolver', p.ref)}<button type="button" class="sm ghost ${fv ? 'on' : ''}" data-fav="p" data-id="${esc(p.id)}" aria-pressed="${fv}">${fv ? '★' : '☆'} Favorita</button>${reportBtn('Referencia ' + p.ref, `Referencia: ${p.ref} (${p.type})\nEnlace: ${location.origin + location.pathname + linkR(p.ref)}\n\nError detectado: `)}${editBtn('editPart', p.id)}</div></header>
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
  const ts = st.D.tech.filter(x => techMatches(x, t));
  // Una referencia exacta (o la que la sustituye) va directa arriba
  const exact = partByRef(q) || supersededBy(q);
  let h = `<div class="meta sr">«${esc(q)}» · ${ms.length} modelos · ${ps.length} referencias</div>`;
  if (!ms.length && !ss.length && !ps.length && !ts.length) return h + empty('Sin resultados. La búsqueda ignora mayúsculas, acentos, espacios y guiones.', reportBtn('No encuentro: ' + q, `He buscado «${q}» y no aparece.\n\nEquipo / modelo: \nQué necesitaba: `));
  if (exact) h += `<a class="row hl" href="${linkR(exact.ref)}"><span class="rm"><b>${esc(exact.ref)}</b><span class="mut">${nrm(exact.ref) !== nrm(q) ? 'Sustituye a ' + esc(q.toUpperCase()) + ' · ' : ''}${esc(exact.type)} ${esc(exact.name)}</span></span><span class="n">›</span></a>`;
  if (ts.length) h += `<section class="blk"><h2 class="h">Técnico</h2>${techRows(ts.slice(0, 20))}</section>`;
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

/** Cuerpo de una serie en la vista general (también se pinta bajo demanda al desplegar). */
export function overviewBody(s, ms) {
  const parts = [...new Set(ms.flatMap(m => partsOf(m.id)))].filter(p => !p.gen && pass(p));
  const com = s ? parts.filter(p => isCommon(p, s)) : [];
  const cs = new Set(com.map(p => p.id));
  const rows = ms.map(m => {
    const l = parts.filter(p => mo(p).has(m.id) && !cs.has(p.id)).sort(byTypeRef);
    return `<div class="ovm" style="--fr:${franjaColor(m.franja)}"><a class="ovh" href="${linkM(m)}"><b>${esc(m.name)}</b>${codes(m)}${frTag(m.franja)}</a><div class="wrap">${l.map(chip).join('') || '<span class="mut">Sin referencias</span>'}</div></div>`;
  }).join('');
  return `${com.length ? `<div class="ovcom"><span class="lbl">Común a la serie</span><div class="wrap">${com.sort(byTypeRef).map(chip).join('')}</div></div>` : ''}${rows || '<div class="ovm mut">Sin modelos</div>'}`;
}
function overviewSerie(s, ms, collapsible = true, open = true) {
  if (!collapsible) return `<div class="ovs">${overviewBody(s, ms)}</div>`;
  // Con muchos modelos las series se pintan plegadas y su contenido se genera al desplegarlas
  const body = open ? overviewBody(s, ms) : '';
  return `<details class="ovs" ${open ? 'open' : `data-lazy="${s ? esc(s.id) : '-'}"`} style="--c:${s ? color(s.name) : 'var(--bd)'}"><summary><b>${s ? esc(s.name) : 'Modelos sin serie'}</b><small>${ms.length} modelos</small>${s ? `<a href="${linkS(s)}" class="mut">Abrir</a>` : ''}</summary>${body}</details>`;
}

export function overviewView(cat) {
  const cats = categories();
  let h = `<header class="ph"><h1>Vista general</h1><div class="meta">Todos los modelos y sus referencias. Toca una referencia para copiarla.</div><div class="acts"><button type="button" class="sm ghost" data-ovall="1">Desplegar todo</button><button type="button" class="sm ghost" data-ovall="0">Plegar todo</button></div></header><!--mine-->`;
  if (cats.length > 1) h += `<div class="seg scroll" role="group" aria-label="Categoría">${['', ...cats].map(c => `<button type="button" class="${(cat || '') === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c || 'Todas')}</button>`).join('')}</div>`;
  h += filtersHTML();
  const series = st.D.series.filter(s => (!cat || s.category === cat) && mineFilter(s)).sort((a, b) => cmp(a.name, b.name));
  h = h.replace('<!--mine-->', mineBar());
  const free = st.D.models.filter(m => !serieOf(m.id));
  const nModels = series.reduce((n, s) => n + s.models.length, 0) + (cat ? 0 : free.length);
  const open = nModels <= 40 || series.length <= 1;
  if (!open) h += '<p class="mut small">Hay muchos modelos: despliega cada serie para ver sus referencias.</p>';
  h += series.map(s => overviewSerie(s, modelsOfSerie(s), true, open)).join('');
  if (free.length && !cat) h += overviewSerie(null, free, true, open);
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
  const v = invGet(), items = v[list] || [], sk = stockGet();
  const tabs = Object.entries(LISTS).map(([k, l]) => `<a href="#/inv/${k}" class="${k === list ? 'on' : ''}" ${k === list ? 'aria-current="page"' : ''}>${l} <small>${v[k].length}</small></a>`).join('')
    + `<a href="#/inv/stock" class="${list === 'stock' ? 'on' : ''}" ${list === 'stock' ? 'aria-current="page"' : ''}>Stock rule${sk ? ` <small>${sk.rows.length + sk.added.length}</small>` : ''}</a>`;
  if (list === 'stock') return `<header class="ph"><h1>Mi inventario</h1><div class="meta">Se guarda solo en este dispositivo.</div></header><nav class="seg tabs scroll" aria-label="Listas">${tabs}</nav>` + stockView();
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
    return `<div class="ii"><div class="ii-i">${refBtn(it.ref)}<div class="mut small">${supersededBy(it.ref) ? `<a class="bd w" href="${linkR(supersededBy(it.ref).ref)}">sustituida por ${esc(supersededBy(it.ref).ref)}</a> ` : ''}${p ? esc([p.type, p.name].filter(Boolean).join(' · ')) : supersededBy(it.ref) ? '' : 'Fuera del catálogo'}${first ? ' · ' + esc(first.name) + (mo(p).size > 1 ? ' +' + (mo(p).size - 1) : '') : ''}</div></div>
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
    dupCodes: [...ix.byCode.entries()].filter(([, a]) => a.length > 1),
    stale: D.parts.filter(p => supersededBy(p.ref)),
    techRefs: D.tech.filter(x => x.refs.some(r => !partByRef(r)))
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
  h += sec('Referencias sustituidas que siguen en el catálogo (informativo)', d.stale, partRows(d.stale), 'Se muestran con el aviso «sustituida por». Bórralas si ya no se deben pedir.');
  h += sec('SC o consultas con piezas fuera del catálogo (informativo)', d.techRefs, techRows(d.techRefs));
  h += sec('Códigos repetidos en varios modelos', d.dupCodes, d.dupCodes.map(([c, a]) => `<div class="list"><div class="lh">${esc(c.toUpperCase())}</div>${a.map(modelRow).join('')}</div>`).join(''));
  return h + (n || d.origin.length ? '' : empty('Sin incidencias.'));
}

/* ---------- TÉCNICO: códigos SC y consultas ---------- */

export const KIND = { sc: 'Códigos SC', guia: 'Consultas' };
function techApplies(x) {
  if (!x.t.length) return 'Todos los equipos';
  return x.t.map(t => (t.k === 's' ? SR(t.id)?.name : M(t.id)?.name)).filter(Boolean).join(', ');
}
export function techRows(list) {
  return `<div class="list">${list.map(x => `<a class="row" href="#/t/${encodeURIComponent(x.id)}" data-s="${esc(nrm([x.code, x.title, techApplies(x), x.causes, x.steps].join(' ')))}"><span class="rm">${x.kind === 'sc' ? `<b class="code sc">${esc(x.code || 'SC')}</b>` : ''}<b>${esc(x.title || x.code)}</b><span class="mut small">${esc(techApplies(x))}</span></span><span class="n"></span></a>`).join('')}</div>`;
}
export function techListView(kind) {
  kind = kind === 'guia' ? 'guia' : 'sc';
  const m = mine();
  const list = st.D.tech.filter(x => x.kind === kind && (UI.all || !m.length || !x.t.length || m.some(sid => [...techMo(x)].some(id => serieOf(id)?.id === sid))))
    .sort((a, b) => cmp(a.code || a.title, b.code || b.title));
  const tabs = Object.entries(KIND).map(([k, l]) => `<a href="#/tec/${k}" class="${k === kind ? 'on' : ''}" ${k === kind ? 'aria-current="page"' : ''}>${l} <small>${st.D.tech.filter(x => x.kind === k).length}</small></a>`).join('');
  let h = `<header class="ph"><h1>Técnico</h1><div class="meta">${kind === 'sc' ? 'Códigos SC: causas posibles, solución y piezas relacionadas.' : 'Procedimientos y consultas: modo SP, ajustes, comprobaciones.'}</div>${ed() ? `<div class="acts"><button type="button" class="sm ghost" data-act="newTech" data-id="k:${kind}">+ ${kind === 'sc' ? 'Código SC' : 'Consulta'}</button><button type="button" class="sm ghost" data-act="techTable">Importar tabla</button><button type="button" class="sm ghost" data-act="techCsv">Exportar CSV</button></div>` : ''}</header>
    <nav class="seg tabs" aria-label="Tipo">${tabs}</nav>${m.length ? mineBar() : ''}`;
  if (!list.length) return h + empty(ed() ? 'Vacío. Añade entradas con el botón superior o importa una tabla desde Excel.' : 'Todavía no hay entradas.');
  return h + `<input type="search" class="tf" placeholder="Filtrar por código, texto o equipo" aria-label="Filtrar">` + techRows(list);
}
const lines = t => String(t || '').split('\n').map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
export function techView(x) {
  if (!x) return empty('No encontrado.');
  const ms = [...techMo(x)].map(M).filter(Boolean);
  const applies = !x.t.length ? '<span class="mut">Todos los equipos</span>' : x.t.map(t => { const s = t.k === 's' ? SR(t.id) : null, m = t.k === 'm' ? M(t.id) : null; return s ? `<a class="mc s" href="${linkS(s)}">${esc(s.name)} <small>serie</small></a>` : m ? mchip(m) : ''; }).join('');
  const parts = x.refs.map(r => { const p = partByRef(r), nw = supersededBy(r), cur = p || nw;
    return `<div class="pr"><div class="pr-h">${cur ? typeTag(cur.type) : '<span class="tt">Fuera del catálogo</span>'}${nw && !p ? `<span class="bd w">sustituida por ${esc(nw.ref)}</span>` : ''}</div><div class="pr-r">${refBtn(cur ? cur.ref : r)}<a class="go" href="${linkR(cur ? cur.ref : r)}" aria-label="Detalle">›</a></div>${cur?.name ? `<div class="pc-d">${esc(cur.name)}</div>` : ''}<div class="pc-a">${invBtn('pedir', cur ? cur.ref : r)}${invBtn('tengo', cur ? cur.ref : r)}</div></div>`; }).join('');
  const cs = lines(x.causes), st_ = lines(x.steps);
  return `<header class="ph" style="--c:${x.kind === 'sc' ? 'var(--bad)' : 'var(--pri)'}"><div class="crumb"><a href="#/tec/${x.kind}">${KIND[x.kind]}</a></div>
    <h1>${x.kind === 'sc' ? `<span class="code sc big">${esc(x.code)}</span> ` : ''}${esc(x.title)}</h1>
    <div class="wrap" style="margin-top:6px">${applies}</div>
    <div class="acts">${reportBtn((x.code ? x.code + ' ' : '') + x.title, `Entrada técnica: ${x.code} ${x.title}\nEnlace: ${location.origin + location.pathname}#/t/${x.id}\n\nCorrección o aporte: `)}${editBtn('editTech', x.id)}</div></header>
    ${cs.length ? `<section class="blk"><h2 class="h">${x.kind === 'sc' ? 'Causas posibles' : 'Cuándo aplica'}</h2><ul class="steps-l">${cs.map(l => `<li>${esc(l)}</li>`).join('')}</ul></section>` : ''}
    ${st_.length ? `<section class="blk"><h2 class="h">${x.kind === 'sc' ? 'Solución' : 'Pasos'}</h2><ol class="steps-l">${st_.map(l => `<li>${esc(l)}</li>`).join('')}</ol></section>` : ''}
    ${parts ? `<section class="blk"><h2 class="h">Piezas relacionadas</h2><div class="plist">${parts}</div></section>` : ''}
    ${x.note ? `<section class="blk"><h2 class="h">Notas</h2><div class="pc note">${esc(x.note).replace(/\n/g, '<br>')}</div></section>` : ''}
    ${ms.length && x.t.length ? '' : ''}`;
}

/* ---------- AYUDA ---------- */

export function helpView() {
  const tip = (t, d) => `<div class="pc"><b>${t}</b><div class="pc-d">${d}</div></div>`;
  return `<header class="ph"><div class="crumb"><a href="#/">Series</a></div><h1>Cómo se usa</h1><div class="meta">Guía rápida para el técnico.</div></header>
  <div class="parts">
    ${tip('Buscar', 'Escribe una referencia, un modelo, un código (D0DY) o un SC. No importan mayúsculas, espacios ni guiones. Una referencia antigua te lleva a la que la sustituye.')}
    ${tip('Copiar una referencia', 'Toca la referencia: queda copiada para pegarla en el pedido.')}
    ${tip('Pedir', '«+ Pedir» la añade a tu lista. En Inventario → Pedir, «Compartir lista» la envía por Teams o correo con referencia, descripción y cantidad.')}
    ${tip('Mis series', 'En Series, «Elegir mis series» muestra solo las que atiendes.')}
    ${tip('Técnico', 'Códigos SC con causas, solución y piezas; y consultas como el acceso a modo SP. Cada modelo muestra al final los suyos.')}
    ${tip('Excel', 'Abre un Excel compartido y míralo en tarjetas: búsqueda, filtros, teléfonos y «Cómo llegar». No se sube a ningún sitio.')}
    ${tip('Stock rule', 'Inventario → Stock rule: marca lo que quitar, cambiar o añadir y genera el Excel con los colores para el jefe de equipo.')}
    ${tip('Sin cobertura', 'La web funciona sin conexión con la última versión cargada. Instálala como app desde el menú del navegador («Añadir a pantalla de inicio»).')}
    ${tip('Algo falta o está mal', '«Avisar de un error» en el modelo o la referencia envía el aviso al responsable con el enlace.')}
  </div>`;
}
