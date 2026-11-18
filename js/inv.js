// Inventario personal del técnico. Solo vive en este dispositivo (localStorage); no se publica.
//   tengo:    [{ref, qty, uso:'hab'|'ocas'|''}]
//   pedir:    [{ref, qty}]
//   devolver: [{ref, qty}]

import { K } from './store.js';
import { lsGet, lsSet, cleanRef, nrm } from './util.js';

export const LISTS = { tengo: 'Tengo', pedir: 'Pedir', devolver: 'Devolver' };

export function invGet() {
  const v = lsGet(K.inv, {}), out = {};
  for (const k of Object.keys(LISTS)) {
    out[k] = (Array.isArray(v[k]) ? v[k] : [])
      .filter(x => x && x.ref)
      .map(x => ({ ref: cleanRef(x.ref), qty: Math.max(1, parseInt(x.qty, 10) || 1), uso: ['hab', 'ocas'].includes(x.uso) ? x.uso : '' }));
  }
  return out;
}
const put = v => lsSet(K.inv, v);
const find = (l, ref) => l.find(x => nrm(x.ref) === nrm(ref));

export function invAdd(list, ref, qty = 1, uso = '') {
  ref = cleanRef(ref); if (!ref) return;
  const v = invGet(), it = find(v[list], ref);
  if (it) { it.qty += qty; if (uso) it.uso = uso; }
  else v[list].unshift({ ref, qty: Math.max(1, qty), uso });
  put(v);
}
export function invQty(list, ref, delta) {
  const v = invGet(), it = find(v[list], ref);
  if (!it) return;
  it.qty += delta;
  if (it.qty < 1) v[list] = v[list].filter(x => x !== it);
  put(v);
}
export function invRemove(list, ref) { const v = invGet(); v[list] = v[list].filter(x => nrm(x.ref) !== nrm(ref)); put(v); }
export function invUso(ref) { // rota: sin marcar → habitual → ocasional
  const v = invGet(), it = find(v.tengo, ref); if (!it) return;
  it.uso = it.uso === '' ? 'hab' : it.uso === 'hab' ? 'ocas' : ''; put(v);
}
/** Pasa todo el artículo de una lista a otra (p. ej. pedido recibido → tengo). */
export function invMove(from, to, ref) {
  const v = invGet(), it = find(v[from], ref); if (!it) return;
  v[from] = v[from].filter(x => x !== it);
  const t = find(v[to], ref);
  if (t) t.qty += it.qty; else v[to].unshift({ ref: it.ref, qty: it.qty, uso: '' });
  put(v);
}
export function invClear(list) { const v = invGet(); v[list] = []; put(v); }
export const invQtyOf = (list, ref) => find(invGet()[list], ref)?.qty || 0;
export const invCount = list => invGet()[list].length;

export function invExport() { return JSON.stringify({ app: 'refcom-inventario', v: 1, fecha: new Date().toISOString(), ...invGet() }, null, 1); }
export function invImport(text) {
  const d = JSON.parse(text);
  if (!d || !Object.keys(LISTS).some(k => Array.isArray(d[k]))) throw new Error('Archivo no válido');
  const v = {}; for (const k of Object.keys(LISTS)) v[k] = Array.isArray(d[k]) ? d[k] : [];
  put(v); return invGet();
}
