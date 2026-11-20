// Modelo de datos, migraciones, índices y deshacer.
//
// Estructura (versión 6):
//   types:  [{name, system, channel:'K'|'C'|'M'|'Y'|'', common:bool, alias:[name]}]
//   series: [{id, name, category, despiece, models:[modelId]}]   (orden manual)
//   models: [{id, name, codes:[], platform, franja, despiece}]
//   parts:  [{id, ref, type, name, note, hab, chk, gen, cl, img, old:[ref], t:[{k:'s'|'m', id}]}]
//           cl: producto de limpieza. img: foto en img/ («REF.webp?v=…»).
//           old: referencias anteriores a las que sustituye esta pieza.
//   tech:   [{id, kind:'sc'|'guia', code, title, causes, steps, note, refs:[ref], t:[...] }]
//           Códigos SC y consultas técnicas. t vacío = aplica a todos los equipos.
//   config: {contacto}  correo al que el equipo envía avisos de faltas o errores.
// Una pieza asignada a una serie ({k:'s'}) aplica a todos sus modelos, incluidos los futuros.

import { uid, nrm, cmp, refPrefix, lsDel, cleanRef, askPersist } from './util.js';
import { idbGet, idbSet, idbDel } from './idb.js';
import { sanitizeToner } from './toner.js';

export const VERSION = 7;
export const K = {
  draft: 'refcom_draft_v6', tok: 'ref_piezas_token', repo: 'ref_piezas_repo',
  fav: 'ref_piezas_fav', mine: 'refcom_mine', rec: 'ref_piezas_rec', view: 'refcom_view', cat: 'refcom_cat', inv: 'refcom_inv_v1',
  oldDraft: 'ref_piezas_draft_v5'
};

export function defTypes() {
  const t = (name, system, channel = '', common = false, alias = []) => ({ name, system, channel, common, alias });
  return [
    t('PCU K', 'PCU'), t('PCU COL', 'PCU'), t('PCU K+COL', 'PCU', '', false, ['PCU K', 'PCU COL']), t('PCU', 'PCU'),
    t('PCDU K', 'PCDU', 'K'), t('PCDU C', 'PCDU', 'C'), t('PCDU M', 'PCDU', 'M'), t('PCDU Y', 'PCDU', 'Y'),
    t('Revelador K', 'Reveladoras', 'K'), t('Revelador C', 'Reveladoras', 'C'), t('Revelador M', 'Reveladoras', 'M'), t('Revelador Y', 'Reveladoras', 'Y'),
    t('Revelador', 'Reveladoras'), t('Sleeve', 'Sleeve'),
    t('ITB unit', 'Transferencia'), t('Banda transferencia', 'Transferencia', '', true), t('Limpieza ITB', 'Transferencia', '', true),
    t('Fusor', 'Fusión'), t('Rodillo presión', 'Fusión', '', true),
    t('Feed roller', 'Alimentación'), t('Separate roller', 'Alimentación'),
    t('Tambor', 'Otros', '', true), t('Cuchilla', 'Otros', '', true), t('Carga', 'Otros', '', true), t('Sellos', 'Otros', '', true),
    t('Consumible', 'Consumibles')
  ];
}
export const emptyData = () => ({ version: VERSION, updated: '', types: defTypes(), series: [], models: [], parts: [], tech: [], config: { contacto: '' }, templates: [], toner: { delegs: [] } });

/* ---------- migraciones ---------- */

/** v5 (familia > serie > franja/grupo) → v6 (serie > modelo, con categoría y franja como etiquetas). */
function fromV5(d) {
  const groups = Array.isArray(d.groups) ? d.groups : [];
  const gmap = new Map(groups.map(g => [g.id, g]));
  const models = (d.models || []).map(m => ({ ...m, franja: '', despiece: '' }));
  const mmap = new Map(models.map(m => [m.id, m]));
  groups.filter(g => g.kind === 'franja').forEach(f =>
    (f.models || []).forEach(id => { const m = mmap.get(id); if (m && !m.franja) m.franja = f.name; }));
  const series = groups.filter(g => g.kind === 'serie')
    .map(g => ({ id: g.id, name: g.name, category: g.family || '', despiece: '', models: [...(g.models || [])] }));
  const sids = new Set(series.map(s => s.id));
  const parts = (d.parts || []).map(p => {
    const t = [];
    const add = x => { if (!t.some(y => y.k === x.k && y.id === x.id)) t.push(x); };
    (p.t || []).forEach(x => {
      if (x.k === 'm') add(x);
      else if (sids.has(x.id)) add({ k: 's', id: x.id });
      else (gmap.get(x.id)?.models || []).forEach(id => add({ k: 'm', id })); // franja o grupo libre → modelos
    });
    return { ...p, t };
  });
  return { version: VERSION, updated: d.updated || '', types: d.types, series, models, parts };
}

/** Acepta cualquier versión conocida; devuelve datos v6 saneados o null si no es válido. */
export function migrate(d) {
  if (!d || typeof d !== 'object') return null;
  if (!Array.isArray(d.series) && Array.isArray(d.groups)) d = fromV5(d);
  if (!Array.isArray(d.series) || !Array.isArray(d.models) || !Array.isArray(d.parts)) return null;
  return sanitize(d);
}

function sanitize(d) {
  const s = v => String(v ?? '').trim();
  d.version = VERSION;
  d.updated = s(d.updated);
  if (!Array.isArray(d.types) || !d.types.length) d.types = defTypes();
  d.types = d.types.filter(t => t && s(t.name)).map(t => ({
    name: s(t.name), system: s(t.system) || 'Otros', channel: ['K', 'C', 'M', 'Y'].includes(t.channel) ? t.channel : '',
    common: !!t.common, alias: Array.isArray(t.alias) ? t.alias.map(s).filter(Boolean) : []
  }));
  d.models = d.models.filter(m => m && m.id && s(m.name)).map(m => ({
    id: String(m.id), name: s(m.name), codes: Array.isArray(m.codes) ? m.codes.map(s).filter(Boolean) : [],
    platform: s(m.platform), franja: s(m.franja), despiece: s(m.despiece)
  }));
  const mids = new Set(d.models.map(m => m.id)), taken = new Set();
  d.series = d.series.filter(x => x && x.id && s(x.name)).map(x => ({
    id: String(x.id), name: s(x.name), category: s(x.category), despiece: s(x.despiece),
    // un modelo pertenece como mucho a una serie
    models: (Array.isArray(x.models) ? x.models : []).filter(id => mids.has(id) && !taken.has(id) && taken.add(id))
  }));
  const sids = new Set(d.series.map(x => x.id));
  const okT = t => (Array.isArray(t) ? t : []).filter(x => x && ((x.k === 'm' && mids.has(x.id)) || (x.k === 's' && sids.has(x.id))));
  d.parts = d.parts.filter(p => p && p.id && s(p.ref)).map(p => ({
    id: String(p.id), ref: s(p.ref), type: s(p.type), name: s(p.name), note: s(p.note),
    hab: p.hab !== false, chk: !!p.chk, gen: !!p.gen && !p.cl,
    // producto de limpieza: apartado propio, sin modelos
    cl: !!p.cl,
    // foto: «ARCHIVO.webp?v=…» dentro de img/ (solo nombres seguros)
    img: /^[A-Za-z0-9._-]+\.(webp|jpg)(\?v=[a-z0-9]+)?$/.test(s(p.img)) ? s(p.img) : '',
    old: (Array.isArray(p.old) ? p.old : []).map(cleanRef).filter(Boolean),
    t: p.cl ? [] : okT(p.t)
  }));
  d.tech = (Array.isArray(d.tech) ? d.tech : []).filter(x => x && x.id && (s(x.title) || s(x.code))).map(x => ({
    id: String(x.id), kind: x.kind === 'sc' ? 'sc' : 'guia', code: s(x.code).toUpperCase(), title: s(x.title),
    causes: String(x.causes ?? '').trim(), steps: String(x.steps ?? '').trim(), note: String(x.note ?? '').trim(),
    refs: (Array.isArray(x.refs) ? x.refs : []).map(cleanRef).filter(Boolean),
    // si todos sus equipos han desaparecido no se convierte en «todos los equipos»: queda sin equipo (aviso en Revisión)
    t: okT(x.t).length || !(Array.isArray(x.t) && x.t.length) ? okT(x.t) : x.t.filter(y => y && (y.k === 'm' || y.k === 's') && y.id).map(y => ({ k: y.k, id: String(y.id) }))
  }));
  d.config = { contacto: s(d.config?.contacto) };
  // vistas de Excel publicadas para el equipo (solo estructura de columnas)
  const sa = v => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);
  d.templates = (Array.isArray(d.templates) ? d.templates : []).filter(t => t && t.id && Array.isArray(t.sig) && t.sig.length).map(t => ({
    id: s(t.id), name: s(t.name), sig: sa(t.sig), title: s(t.title), sub: sa(t.sub), main: sa(t.main), hide: sa(t.hide), group: s(t.group), sort: s(t.sort),
    flag: t.flag && t.flag.col ? { col: s(t.flag.col), op: ['gt0', 'lt1', 'filled'].includes(t.flag.op) ? t.flag.op : 'gt0', label: s(t.flag.label) } : null
  }));
  d.toner = sanitizeToner(d.toner);
  return d;
}

/* ---------- estado compartido ---------- */

export const st = {
  D: emptyData(),
  editing: false, mode: '', dirty: false,
  repo: '', token: '', baseSha: null, pubStr: '', lastText: '', loadErr: false,
  snap: null, idx: null, undo: [], undoSize: 0, saveErr: false
};

/* ---------- índices ---------- */

export const ix = { M: new Map(), S: new Map(), P: new Map(), T: new Map(), serieOf: new Map(), mo: new Map(), byModel: new Map(), byCode: new Map(), byRef: new Map(), supBy: new Map(), techMo: new Map(), sys: [] };

export function reindex() {
  const D = st.D;
  ix.M = new Map(D.models.map(m => [m.id, m]));
  ix.S = new Map(D.series.map(s => [s.id, s]));
  ix.P = new Map(D.parts.map(p => [p.id, p]));
  ix.T = new Map(D.types.map((t, i) => [t.name, { ...t, i }]));
  ix.sys = [...new Set(D.types.map(t => t.system))];
  ix.serieOf = new Map();
  D.series.forEach(s => s.models.forEach(id => ix.serieOf.set(id, s)));
  ix.byCode = new Map();
  D.models.forEach(m => m.codes.forEach(c => { const k = nrm(c); if (k) (ix.byCode.get(k) || ix.byCode.set(k, []).get(k)).push(m); }));
  ix.byRef = new Map(D.parts.map(p => [nrm(p.ref), p]));
  ix.supBy = new Map();
  D.parts.forEach(p => p.old.forEach(o => { if (nrm(o) !== nrm(p.ref)) ix.supBy.set(nrm(o), p); }));
  const expand = t => { const set = new Set(); t.forEach(x => { if (x.k === 'm') { if (ix.M.has(x.id)) set.add(x.id); } else (ix.S.get(x.id)?.models || []).forEach(id => set.add(id)); }); return set; };
  ix.techMo = new Map(D.tech.map(x => [x.id, expand(x.t)]));
  ix.mo = new Map(); ix.byModel = new Map();
  D.parts.forEach(p => {
    const set = new Set();
    p.t.forEach(t => {
      if (t.k === 'm') { if (ix.M.has(t.id)) set.add(t.id); }
      else (ix.S.get(t.id)?.models || []).forEach(id => set.add(id));
    });
    ix.mo.set(p.id, set);
    set.forEach(id => (ix.byModel.get(id) || ix.byModel.set(id, []).get(id)).push(p));
  });
}

export const M = id => ix.M.get(id);
export const SR = id => ix.S.get(id);
export const P = id => ix.P.get(id);
export const TY = n => ix.T.get(n);
export const serieOf = mid => ix.serieOf.get(mid);
export const mo = p => ix.mo.get(p.id) || new Set();
export const partsOf = mid => ix.byModel.get(mid) || [];
export const partByRef = r => ix.byRef.get(nrm(r));
/** Pieza vigente que sustituye a la referencia dada (siguiendo la cadena), o undefined. */
export function supersededBy(r) {
  let p = ix.supBy.get(nrm(r)), n = 0;
  while (p && ix.supBy.has(nrm(p.ref)) && n++ < 10) p = ix.supBy.get(nrm(p.ref));
  return p;
}
export const techMo = x => ix.techMo.get(x.id) || new Set();
/** Entradas técnicas aplicables a un modelo: las suyas, las de su serie y las generales. */
export const techOf = mid => st.D.tech.filter(x => !x.t.length || techMo(x).has(mid));
export const TECH = id => st.D.tech.find(x => x.id === id);
export const modelByName = n => st.D.models.find(m => nrm(m.name) === nrm(n));
export const serieByName = n => st.D.series.find(s => nrm(s.name) === nrm(n));

export const tIdx = n => TY(n)?.i ?? 9999;
export const sysOf = n => TY(n)?.system || 'Otros';
export const sIdx = n => { const i = ix.sys.indexOf(sysOf(n)); return i < 0 ? 9999 : i; };
export const chOf = n => TY(n)?.channel || '';
export const colsOf = p => { const t = TY(p.type); return t && t.alias.length ? t.alias : [p.type || 'Sin tipo']; };
export const byTypeRef = (a, b) => sIdx(a.type) - sIdx(b.type) || tIdx(a.type) - tIdx(b.type) || cmp(a.ref, b.ref);
export const modelsOfSerie = s => s.models.map(M).filter(Boolean);
export const modelLabel = m => m.name + (m.codes.length ? ' · ' + m.codes.join(' / ') : '');
export const categories = () => [...new Set(st.D.series.map(s => s.category).filter(Boolean))].sort(cmp);

/** La pieza cubre todos los modelos de la serie y su tipo está marcado como común. */
export function isCommon(p, serie) {
  const t = TY(p.type), ms = serie ? serie.models : [];
  return !!(t && t.common && ms.length > 1 && ms.every(id => mo(p).has(id)));
}
/** Modelos cuyo código coincide con el prefijo de la referencia (D0DZ2205 → modelo con código D0DZ). */
export const originOf = ref => { const pf = refPrefix(ref); return pf ? ix.byCode.get(nrm(pf)) || [] : []; };
/** Enlace al despiece del modelo o, si no tiene, el de su serie. */
export const despieceOf = m => m.despiece || serieOf(m.id)?.despiece || '';

export function ensureType(name) {
  if (name && !st.D.types.some(t => t.name === name)) st.D.types.push({ name, system: 'Otros', channel: '', common: false, alias: [] });
}
export const addT = (p, ts) => ts.forEach(t => { if (!p.t.some(x => x.k === t.k && x.id === t.id)) p.t.push(t); });

/** Asigna el modelo a una serie (o a ninguna), retirándolo de la anterior. */
export function setSerie(mid, sid) {
  st.D.series.forEach(s => { if (s.id !== sid) s.models = s.models.filter(x => x !== mid); });
  const s = st.D.series.find(x => x.id === sid);
  if (s && !s.models.includes(mid)) s.models.push(mid);
}
export function newModel(f) {
  const m = { id: uid(), name: f.name, codes: f.codes || [], platform: f.platform || '', franja: f.franja || '', despiece: f.despiece || '' };
  st.D.models.push(m); return m;
}

/* ---------- borrador, deshacer ---------- */

let onChange = () => {};
export const setOnChange = fn => { onChange = fn; };

/*
 * Borrador: se guarda en IndexedDB (cupo de una fracción del disco) con un retardo corto, para no
 * reescribir todo el catálogo en cada cambio. Si IndexedDB no está disponible, se intenta localStorage
 * (cupo de unos 5 MiB compartido). Las escrituras van en cola: la última refleja siempre el estado actual.
 */
const DRAFT_DELAY = 400;
let draftTimer = null, draftQueue = Promise.resolve(), draftBusy = 0;
const draftVal = () => (st.dirty ? { repo: st.repo, base: st.baseSha, at: Date.now(), data: st.snap } : null);

function draftLS(val) {
  try {
    if (val) localStorage.setItem(K.draft, `{"repo":${JSON.stringify(val.repo)},"base":${JSON.stringify(val.base)},"at":${val.at || 0},"data":${val.data}}`);
    else localStorage.removeItem(K.draft);
    return true;
  } catch { return false; }
}

/** Escribe el borrador ya (sin esperar al retardo). Devuelve la promesa de la escritura. */
export function flushDraft() {
  if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }
  if (!st.editing) return draftQueue;
  const val = draftVal();
  draftBusy++;
  draftQueue = draftQueue.then(async () => {
    let ok;
    try {
      if (val) await idbSet(K.draft, val); else await idbDel(K.draft);
      lsDel(K.draft); // borrador de versiones anteriores, ya pasado a IndexedDB
      ok = true;
    } catch { ok = draftLS(val); }
    draftBusy--;
    const err = !ok && !!val;
    if (err !== !!st.saveErr) { st.saveErr = err; onChange(); }
  });
  return draftQueue;
}

/**
 * Al cerrar o recargar la página: IndexedDB es asíncrona y el navegador puede cortar la escritura,
 * así que, si hay algo sin escribir, se deja además una copia síncrona en localStorage (si cabe).
 * readDraft se queda con la más reciente.
 */
export function flushDraftNow() {
  if (!st.editing || !(draftTimer || draftBusy)) return;
  const val = draftVal();
  flushDraft();
  draftLS(val);
}

export function persist() {
  st.dirty = st.snap !== st.pubStr;
  if (st.dirty) askPersist();
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(flushDraft, DRAFT_DELAY);
  onChange();
}

/** Borrador guardado: IndexedDB y, si no hay, los de versiones anteriores en localStorage. */
export async function readDraft() {
  await draftQueue;
  let idb = null, ls = null;
  try {
    const d = await idbGet(K.draft);
    if (d && typeof d.data === 'string') idb = { ...d, data: JSON.parse(d.data) };
  } catch { /* sin IndexedDB */ }
  try { ls = JSON.parse(localStorage.getItem(K.draft)); } catch { /* */ }
  // la copia de localStorage es la de emergencia (cierre de página) o la de versiones anteriores
  if (idb && ls) return (ls.at || 0) > (idb.at || 0) ? ls : idb;
  if (idb || ls) return idb || ls;
  try {
    const o = JSON.parse(localStorage.getItem(K.oldDraft)); // borrador de la versión 5
    if (o) { lsDel(K.oldDraft); return o; }
  } catch { /* */ }
  return null;
}

/*
 * Deshacer por diferencias: cada paso guarda solo las entidades (piezas, modelos, series…) que cambiaron,
 * con su estado anterior, en vez de una copia completa de los datos. Las colecciones sin id (tipos,
 * tóner, configuración) se guardan enteras si cambian. Límite: 40 pasos y UNDO_CHARS caracteres en total.
 */
const UNDO_MAX = 40, UNDO_CHARS = 8e6;

const isEnt = v => Array.isArray(v) && v.every(x => x && typeof x === 'object' && !Array.isArray(x) && typeof x.id === 'string')
  && new Set(v.map(x => x.id)).size === v.length;

/** Índice de los datos: por clave, la cadena JSON o, para colecciones con id, {ids, map: id → JSON}. */
export function snapIndex(D) {
  const idx = new Map();
  for (const k of Object.keys(D)) {
    const v = D[k];
    if (v === undefined || typeof v === 'function') continue;
    idx.set(k, isEnt(v) ? { ids: v.map(x => x.id), map: new Map(v.map(x => [x.id, JSON.stringify(x)])) } : JSON.stringify(v));
  }
  return idx;
}
/** JSON compacto a partir del índice: idéntico a JSON.stringify(D). */
export const buildSnap = idx => '{' + [...idx].map(([k, v]) =>
  JSON.stringify(k) + ':' + (typeof v === 'string' ? v : '[' + v.ids.map(i => v.map.get(i)).join(',') + ']')).join(',') + '}';

const sizeOf = v => v === undefined ? 0 : typeof v === 'string' ? v.length : [...v.map.values()].reduce((n, s) => n + s.length, 0);

/** Paso de deshacer: lo necesario para volver de `nw` a `old`. */
function diffSnap(old, nw) {
  const e = [];
  let size = 0;
  for (const k of new Set([...old.keys(), ...nw.keys()])) {
    const a = old.get(k), b = nw.get(k);
    if (a === b) continue;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const back = [];
      for (const [id, s] of a.map) if (b.map.get(id) !== s) { back.push([id, s]); size += s.length; }
      for (const id of b.map.keys()) if (!a.map.has(id)) back.push([id, null]);
      const ord = a.ids.length === b.ids.length && a.ids.every((x, i) => x === b.ids[i]) ? null : a.ids;
      if (back.length || ord) { e.push({ k, back, ord }); size += ord ? ord.length * 10 : 0; }
    } else { e.push({ k, whole: true, v: a }); size += sizeOf(a); }
  }
  return { e, size };
}

function applyBack(cur, step) {
  const idx = new Map(cur);
  for (const x of step.e) {
    if (x.whole) { if (x.v === undefined) idx.delete(x.k); else idx.set(x.k, x.v); continue; }
    const c = idx.get(x.k), map = new Map(c.map);
    x.back.forEach(([id, s]) => (s === null ? map.delete(id) : map.set(id, s)));
    idx.set(x.k, { ids: x.ord || c.ids, map });
  }
  return idx;
}

export function resetUndo() { st.idx = snapIndex(st.D); st.snap = buildSnap(st.idx); st.undo = []; st.undoSize = 0; }

/** Registrar un cambio del editor: guarda borrador y apila para deshacer. */
export function save() {
  if (!st.editing) return;
  const idx = snapIndex(st.D), cur = buildSnap(idx);
  if (cur === st.snap) return;
  if (st.idx) {
    const step = diffSnap(st.idx, idx);
    st.undo.push(step); st.undoSize = (st.undoSize || 0) + step.size;
    while (st.undo.length > 1 && (st.undo.length > UNDO_MAX || st.undoSize > UNDO_CHARS)) st.undoSize -= st.undo.shift().size;
  }
  st.idx = idx; st.snap = cur; persist();
}
export function undo() {
  if (!st.editing || !st.undo.length || !st.idx) return false;
  const step = st.undo.pop();
  st.undoSize -= step.size;
  st.D = migrate(JSON.parse(buildSnap(applyBack(st.idx, step))));
  st.idx = snapIndex(st.D); st.snap = buildSnap(st.idx); persist();
  return true;
}
