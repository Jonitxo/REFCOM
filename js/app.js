// Arranque, rutas (#/…), pintado y eventos globales.

import { $, $$, esc, lsGet, lsSet, copyText, toast, download, nrm, cmp } from './util.js';
import { st, K, ix, reindex, setOnChange, M, SR, P, modelByName, serieByName, partByRef, modelsOfSerie, undo } from './store.js';
import { loadPublished, pollData, login, savedToken, savedRepo, clearToken } from './github.js';
import * as V from './views.js';
import { setRefresh, close, editMenu, loginForm, partForm, modelForm, serieForm, exportCsv } from './forms.js';
import { invAdd, invQty, invRemove, invUso, invMove, invClear, invCount, invExport, invImport, invGet } from './inv.js';

const mobile = () => matchMedia('(max-width: 760px)').matches;
let serieView = lsGet(K.view, '') || (mobile() ? 'models' : 'matrix');
let cat = lsGet(K.cat, '');
let route = { v: 'home' }, lastNonSearch = '#/';

/* ---------- rutas ---------- */

function parse(hash) {
  const h = hash.replace(/^#/, '');
  if (!h.startsWith('/')) { // enlaces de la versión anterior (#m=…&g=…&q=…)
    const q = new URLSearchParams(h);
    if (q.get('m')) return { v: 'm', id: q.get('m') };
    if (q.get('g')) return { v: 's', id: q.get('g') };
    if (q.get('r')) return { v: 'r', id: q.get('r') };
    if (q.get('q')) return { v: 'q', id: q.get('q') };
    return { v: 'home' };
  }
  const [, a = '', ...rest] = h.split('/');
  const id = rest.length ? decodeURIComponent(rest.join('/')) : '';
  const map = { '': 'home', s: 's', m: 'm', r: 'r', buscar: 'q', general: 'ov', inv: 'inv', gen: 'gen', un: 'un', rev: 'rev' };
  return { v: map[a] || 'home', id };
}

function render() {
  reindex();
  route = parse(location.hash);
  const main = $('#main');
  let html = '', title = 'Referencias';
  const ctx = {};
  if (route.v !== 'q' && $('#q').value && document.activeElement !== $('#q')) $('#q').value = '';
  switch (route.v) {
    case 's': {
      const s = serieByName(route.id);
      if (s) { ctx.serie = s; html = V.serieView(s, serieView); title = s.name; } else html = notFound();
      break;
    }
    case 'm': {
      const m = modelByName(route.id);
      if (m) { ctx.model = m; html = V.modelView(m); title = m.name; pushRecent(m.id); } else html = notFound();
      break;
    }
    case 'r': html = V.refView(route.id); title = route.id; break;
    case 'q': html = V.searchView(route.id); title = 'Buscar'; if ($('#q').value !== route.id && document.activeElement !== $('#q')) $('#q').value = route.id; break;
    case 'ov': html = V.overviewView(cat); title = 'Vista general'; break;
    case 'inv': html = V.invView(['tengo', 'pedir', 'devolver'].includes(route.id) ? route.id : 'pedir'); title = 'Mi inventario'; break;
    case 'gen': case 'un': html = V.genView(route.v); break;
    case 'rev': html = st.editing ? V.reviewView() : notFound(); title = 'Revisión'; break;
    default: html = V.homeView(cat);
  }
  if (route.v !== 'q') lastNonSearch = location.hash || '#/';
  const banner = st.loadErr && !st.editing
    ? '<div class="banner">No se han podido cargar los datos publicados (data.json). Si estás sin conexión, se muestra la última copia guardada; si has abierto el archivo desde el disco, usa la dirección web publicada.</div>' : '';
  main.innerHTML = banner + html;
  main.dataset.route = route.v;
  render.ctx = ctx;
  document.title = title === 'Referencias' ? 'Referencias por modelo' : title + ' · Referencias';
  renderChrome();
  // Lista de referencias para el autocompletado del inventario
  $('#dlRefs').innerHTML = st.D.parts.slice(0, 3000).map(p => `<option value="${esc(p.ref)}">${esc([p.type, p.name].filter(Boolean).join(' · '))}</option>`).join('');
}
render.ctx = {};

function notFound() { return '<div class="empty"><p>No encontrado. Puede haberse renombrado o borrado.</p><p><a href="#/">Volver al inicio</a></p></div>'; }

function renderChrome() {
  document.body.classList.toggle('auth', st.editing);
  $('#dirty').hidden = !(st.editing && st.dirty);
  $('#btnAcc').textContent = st.editing ? 'Editar' : 'Acceso';
  $('#btnAcc').classList.toggle('pri', st.editing);
  const act = { home: 'home', s: 'home', m: 'home', r: 'home', ov: 'ov', inv: 'inv' }[route.v] || '';
  $$('#nav [data-nav]').forEach(a => { const on = a.dataset.nav === act; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  const n = invCount('pedir');
  $('#invN').textContent = n || ''; $('#invN').hidden = !n;
  $('#navEdit').hidden = !st.editing;
}

function pushRecent(id) { const r = lsGet(K.rec, []).filter(x => x !== id); r.unshift(id); lsSet(K.rec, r.slice(0, 8)); }
function toggleFav(k, id) { const f = V.favs(), a = f[k], i = a.indexOf(id); i >= 0 ? a.splice(i, 1) : a.unshift(id); lsSet(K.fav, f); }

/* ---------- eventos ---------- */

let qT;
$('#q').addEventListener('input', e => {
  clearTimeout(qT);
  qT = setTimeout(() => {
    const v = e.target.value.trim();
    const target = v ? '#/buscar/' + encodeURIComponent(v) : lastNonSearch;
    if (location.hash === target) return;
    if (route.v === 'q' || !v) history.replaceState(null, '', target); else history.pushState(null, '', target);
    render();
  }, 150);
});
$('#q').addEventListener('keydown', e => {
  if (e.key === 'Enter') { const p = partByRef(e.target.value); if (p) { location.hash = V.linkR(p.ref); e.target.blur(); } else e.target.blur(); }
  if (e.key === 'Escape') { e.target.value = ''; e.target.dispatchEvent(new Event('input')); }
});
$('#qx').addEventListener('click', () => { $('#q').value = ''; $('#q').dispatchEvent(new Event('input')); $('#q').focus(); });

$('#btnAcc').addEventListener('click', () => (st.editing ? editMenu(render.ctx) : loginForm()));
$('#navEdit').addEventListener('click', () => editMenu(render.ctx));

window.addEventListener('hashchange', () => { render(); if (!location.hash.startsWith('#/buscar')) window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); });

document.addEventListener('click', e => {
  const t = e.target;
  const q = s => t.closest(s);
  let el;
  if ((el = q('[data-copy]'))) {
    const r = el.dataset.copy; copyText(r);
    toast('Copiada ' + r, route.v === 'r' ? null : { label: 'Detalle', href: V.linkR(r) });
    return;
  }
  if ((el = q('[data-inv]'))) {
    invAdd(el.dataset.inv, el.dataset.ref, 1);
    toast(`${el.dataset.ref} → ${{ pedir: 'Pedir', tengo: 'Tengo', devolver: 'Devolver' }[el.dataset.inv]}`, { label: 'Ver lista', href: '#/inv/' + el.dataset.inv });
    keepScroll(render); return;
  }
  if ((el = q('[data-iq]'))) { invQty(route.id || 'pedir', el.dataset.ref, +el.dataset.iq); keepScroll(render); return; }
  if ((el = q('[data-iuso]'))) { invUso(el.dataset.iuso); keepScroll(render); return; }
  if ((el = q('[data-imove]'))) { const [a, b] = el.dataset.imove.split(':'); invMove(a, b, el.dataset.ref); toast(el.dataset.ref + ' pasa a Tengo'); keepScroll(render); return; }
  if ((el = q('[data-idel]'))) { invRemove(el.dataset.idel, el.dataset.ref); keepScroll(render); return; }
  if ((el = q('[data-iclear]'))) { if (confirm('¿Vaciar esta lista?')) { invClear(el.dataset.iclear); render(); } return; }
  if ((el = q('[data-ishare]'))) { shareList(el.dataset.ishare); return; }
  if (q('[data-iexp]')) { download('mi-inventario-' + new Date().toISOString().slice(0, 10) + '.json', invExport(), 'application/json'); return; }
  if (q('[data-iimp]')) { $('#invFile').click(); return; }
  if ((el = q('[data-fav]'))) { toggleFav(el.dataset.fav, el.dataset.id); keepScroll(render); return; }
  if ((el = q('[data-view]'))) { serieView = el.dataset.view; lsSet(K.view, serieView); render(); return; }
  if ((el = q('[data-cat]'))) { cat = el.dataset.cat; lsSet(K.cat, cat); render(); return; }
  if ((el = q('[data-jump]'))) { document.getElementById(el.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if ((el = q('[data-ovall]'))) { $$('details.ovs').forEach(d => { d.open = el.dataset.ovall === '1'; }); return; }
  if ((el = q('[data-act]'))) { act(el.dataset.act, el.dataset.id); return; }
});

function act(a, id) {
  if (a === 'share') { copyText(location.href); toast('Enlace copiado'); return; }
  if (a === 'csv') { const s = SR(id.slice(2)); if (s) exportCsv(s.models, 'referencias-' + s.name.replace(/[^\w-]+/g, '_') + '.csv'); return; }
  if (!st.editing) return;
  if (a === 'editSerie') serieForm(SR(id));
  else if (a === 'editModel') modelForm(M(id));
  else if (a === 'editPart') partForm(P(id));
  else if (a === 'newModel') modelForm(null, id);
  else if (a === 'newPart') partForm(null, [{ k: id[0], id: id.slice(2) }]);
}

document.addEventListener('change', e => {
  const f = e.target.dataset.filter;
  if (!f) return;
  V.F[f] = f === 'hab' ? e.target.checked : e.target.value;
  keepScroll(render);
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.dataset.form !== 'invadd') return;
  e.preventDefault();
  const ref = f.elements.ref.value.trim(), qty = Math.max(1, parseInt(f.elements.qty.value, 10) || 1);
  if (!ref) return;
  invAdd(f.dataset.list, ref, qty);
  render();
  const inp = $('form[data-form=invadd] input[name=ref]'); if (inp && !mobile()) inp.focus();
});
$('#invFile').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try { if (confirm('Se reemplazará tu inventario de este dispositivo por el del archivo. ¿Continuar?')) { invImport(await file.text()); render(); toast('Inventario importado'); } }
  catch { alert('Archivo no válido'); }
  e.target.value = '';
});

async function shareList(list) {
  const text = V.invText(list);
  if (!invGet()[list].length) return;
  if (navigator.share) { try { await navigator.share({ title: 'Referencias', text }); return; } catch (x) { if (x && x.name === 'AbortError') return; } }
  copyText(text); toast('Lista copiada: pégala en Teams o en el pedido');
}

function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }

document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#q').focus(); $('#q').select(); return; }
  if (!typing && e.key === '/') { e.preventDefault(); $('#q').focus(); return; }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && st.editing && !typing && !$('#dlg').open) {
    e.preventDefault(); if (undo()) { render(); toast('Cambio deshecho'); }
  }
});
window.addEventListener('beforeunload', e => { if (st.editing && st.dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- conexión y datos nuevos ---------- */

const online = () => { $('#offline').hidden = navigator.onLine; };
window.addEventListener('online', () => { online(); poll(); });
window.addEventListener('offline', online);
async function poll() { if (await pollData()) { keepScroll(render); toast('Datos actualizados'); } }
setInterval(poll, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

/* ---------- arranque ---------- */

setRefresh(() => keepScroll(render));
setOnChange(renderChrome);

(async function boot() {
  online();
  await loadPublished();
  const tok = savedToken(), repo = savedRepo();
  if (tok && repo) {
    try { await login(repo, tok, null, true); }
    catch (err) { if (err.fatal) clearToken(); else toast('Sin conexión con GitHub: modo consulta'); }
  }
  render();
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
