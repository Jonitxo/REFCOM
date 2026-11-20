// Arranque, rutas (#/…), pintado y eventos globales.

import { $, $$, esc, lsGet, lsSet, copyText, toast, download, nrm, cmp } from './util.js';
import { st, K, ix, reindex, setOnChange, M, SR, P, TECH, modelByName, serieByName, partByRef, supersededBy, modelsOfSerie, undo, flushDraft, flushDraftNow } from './store.js';
import { loadPublished, pollData, login, savedToken, savedRepo, clearToken } from './github.js';
import * as V from './views.js';
import * as X from './xls.js';
import * as TN from './toner.js';
import { loadPending } from './img.js';
import { cleanForm, cleanBulkForm, bulkPhotosForm, sheetToCatalogForm, openDialog, setRefresh, close, editMenu, loginForm, partForm, modelForm, serieForm, exportCsv, mineForm, techForm, techTableForm, exportTechCsv } from './forms.js';
import { importStock, exportStock, stockClear, stockGet, stockToggleDel, stockQty, stockReset, stockAdd, stockFinal, SF } from './stock.js';
import { invAdd, invQty, invRemove, invUso, invMove, invMoveOne, invClear, invCount, invExport, invImport, invGet } from './inv.js';

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
    if (!h.includes('=') && h) return route; // anclas internas (#main): se queda en la vista actual
    return { v: 'home' };
  }
  const [, a = '', ...rest] = h.split('/');
  let id = rest.join('/');
  try { id = decodeURIComponent(id); } catch { /* enlace mal formado (p. ej. «100%»): se usa tal cual */ }
  const map = { '': 'home', s: 's', m: 'm', r: 'r', buscar: 'q', general: 'ov', inv: 'inv', gen: 'gen', un: 'un', rev: 'rev', tec: 'tec', t: 't', excel: 'xls', ayuda: 'help', toner: 'toner', limpieza: 'clean' };
  return { v: map[a] || 'home', id };
}

function render() {
  if (st.D !== render.lastD || st.snap !== render.lastSnap) { // índices y autocompletado solo si cambian los datos
    reindex(); render.lastD = st.D; render.lastSnap = st.snap; render.refsDirty = true;
  }
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
    case 'tec': html = V.techListView(route.id); title = 'Técnico'; break;
    case 'clean': html = V.cleanView(); title = 'Productos de limpieza'; break;
    case 'help': html = V.helpView(); title = 'Cómo se usa'; break;
    case 'toner': html = TN.tonerView(route.id); title = 'Stock de tóner'; break;
    case 'xls': html = X.xlsView(); title = X.XS.file ? X.XS.file.name : 'Abrir Excel'; break;
    case 't': { const x = TECH(route.id); html = x ? V.techView(x) : notFound(); title = x ? (x.code || x.title) : 'Técnico'; break; }
    case 'inv': html = V.invView(['tengo', 'pedir', 'devolver', 'stock'].includes(route.id) ? route.id : 'pedir'); title = 'Mi inventario'; break;
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
  if (render.refsDirty) { render.refsDirty = false; $('#dlRefs').innerHTML = st.D.parts.slice(0, 3000).map(p => `<option value="${esc(p.ref)}">${esc([p.type, p.name].filter(Boolean).join(' · '))}</option>`).join(''); }
}
render.ctx = {};

function notFound() { return '<div class="empty"><p>No encontrado. Puede haberse renombrado o borrado.</p><p><a href="#/">Volver al inicio</a></p></div>'; }

function renderChrome() {
  document.body.classList.toggle('auth', st.editing);
  $('#dirty').hidden = !(st.editing && st.dirty);
  $('#dirty').textContent = st.saveErr ? 'Sin publicar · borrador NO guardado' : 'Sin publicar';
  $('#btnAcc').textContent = st.editing ? 'Editar' : 'Acceso';
  $('#btnAcc').classList.toggle('pri', st.editing);
  const act = { home: 'home', s: 'home', m: 'home', r: 'home', ov: 'ov', inv: 'inv', tec: 'tec', t: 'tec', xls: 'xls', toner: 'toner', clean: 'home' }[route.v] || '';
  $$('#nav [data-nav]').forEach(a => { const on = a.dataset.nav === act; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  const n = invCount('pedir');
  $('#invN').textContent = n || ''; $('#invN').hidden = !n;
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
  if (e.key === 'Enter') { const p = partByRef(e.target.value) || supersededBy(e.target.value); if (p) { location.hash = V.linkR(p.ref); e.target.blur(); } else e.target.blur(); }
  if (e.key === 'Escape') { e.target.value = ''; e.target.dispatchEvent(new Event('input')); }
});
$('#qx').addEventListener('click', () => { $('#q').value = ''; $('#q').dispatchEvent(new Event('input')); $('#q').focus(); });

document.querySelector('.skip').addEventListener('click', e => { e.preventDefault(); $('#main').focus(); });
$('#btnAcc').addEventListener('click', () => (st.editing ? editMenu(render.ctx) : loginForm()));

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
  if ((el = q('[data-ione]'))) { const [a, b] = el.dataset.ione.split(':'); invMoveOne(a, b, el.dataset.ref); toast(`1 ud de ${el.dataset.ref} → ${{ tengo: 'Tengo', devolver: 'Devolver' }[b]}`, { label: 'Ver lista', href: '#/inv/' + b }); keepScroll(render); return; }
  if ((el = q('[data-imove]'))) { const [a, b] = el.dataset.imove.split(':'); invMove(a, b, el.dataset.ref); toast(el.dataset.ref + ' pasa a Tengo'); keepScroll(render); return; }
  if ((el = q('[data-idel]'))) { invRemove(el.dataset.idel, el.dataset.ref); keepScroll(render); return; }
  if ((el = q('[data-tq]'))) { TN.changeQty(el.dataset.d, el.dataset.i, +el.dataset.tq); keepScroll(render); return; }
  if ((el = q('[data-tedit]'))) { tonerItemForm(el.dataset.d, el.dataset.tedit); return; }
  if ((el = q('button[data-t]'))) { tonerAction(el.dataset.t, el.dataset.d); return; }
  if ((el = q('[data-xsheet]'))) { Object.assign(X.XS, { si: +el.dataset.xsheet, fcol: '', fval: '', flagOnly: false, limit: 150 }); render(); window.scrollTo(0, 0); return; }
  if ((el = q('[data-xmode]'))) { X.XS.mode = el.dataset.xmode; render(); return; }
  if ((el = q('[data-xrec]'))) { X.openRecent(+el.dataset.xrec).then(render).catch(x => alert(x.message)); return; }
  if ((el = q('[data-xforget]'))) { X.forgetRecent(+el.dataset.xforget); render(); return; }
  if ((el = q('button[data-x]'))) { xAction(el.dataset.x); return; }
  if ((el = q('[data-sk]'))) { stockAction(el.dataset.sk, el); return; }
  if ((el = q('[data-skf]'))) { SF.f = el.dataset.skf; render(); return; }
  if ((el = q('[data-skq]'))) { stockQty(el.dataset.k, +el.dataset.skq); keepScroll(render); return; }
  if ((el = q('[data-skd]'))) { stockToggleDel(el.dataset.skd); keepScroll(render); return; }
  if ((el = q('[data-skr]'))) { stockReset(el.dataset.skr); keepScroll(render); return; }
  if ((el = q('[data-iclear]'))) { if (confirm('¿Vaciar esta lista?')) { invClear(el.dataset.iclear); render(); } return; }
  if ((el = q('[data-ishare]'))) { shareList(el.dataset.ishare); return; }
  if (q('[data-iexp]')) { download('mi-inventario-' + new Date().toISOString().slice(0, 10) + '.json', invExport(), 'application/json'); return; }
  if (q('[data-iimp]')) { $('#invFile').click(); return; }
  if ((el = q('[data-fav]'))) { toggleFav(el.dataset.fav, el.dataset.id); keepScroll(render); return; }
  if ((el = q('[data-view]'))) { serieView = el.dataset.view; lsSet(K.view, serieView); render(); return; }
  if ((el = q('[data-all]'))) { V.UI.all = el.dataset.all === '1'; render(); return; }
  if ((el = q('[data-report]'))) { report(el.dataset.report, el.dataset.body); return; }
  if ((el = q('[data-cat]'))) { cat = el.dataset.cat; lsSet(K.cat, cat); render(); return; }
  if ((el = q('[data-jump]'))) { document.getElementById(el.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if ((el = q('[data-ovall]'))) { $$('details.ovs').forEach(d => { d.open = el.dataset.ovall === '1'; }); return; }

  if ((el = q('[data-act]'))) { act(el.dataset.act, el.dataset.id); return; }
});

function act(a, id) {
  if (a === 'share') { copyText(location.href); toast('Enlace copiado'); return; }
  if (a === 'mine') { mineForm(); return; }
  if (a === 'csv') { const s = SR(id.slice(2)); if (s) exportCsv(s.models, 'referencias-' + s.name.replace(/[^\w-]+/g, '_') + '.csv'); return; }
  if (!st.editing) return;
  if (a === 'editSerie') serieForm(SR(id));
  else if (a === 'editModel') modelForm(M(id));
  else if (a === 'editPart') partForm(P(id));
  else if (a === 'newModel') modelForm(null, id);
  else if (a === 'newPart') partForm(null, [{ k: id[0], id: id.slice(2) }]);
  else if (a === 'newClean') cleanForm(null);
  else if (a === 'bulkClean') cleanBulkForm();
  else if (a === 'bulkPhotos') bulkPhotosForm();
  else if (a === 'newTech') id.startsWith('k:') ? techForm(null, [], id.slice(2)) : techForm(null, [{ k: id[0], id: id.slice(2) }]);
  else if (a === 'editTech') techForm(TECH(id));
  else if (a === 'techTable') techTableForm();
  else if (a === 'techCsv') exportTechCsv();
}

document.addEventListener('change', e => {
  const xf = e.target.dataset.xf;
  if (xf) { if (xf === 'col') { X.XS.fcol = e.target.value; X.XS.fval = ''; } else X.XS.fval = e.target.value; render(); return; }
  if (e.target.hasAttribute('data-tonly')) { TN.TS.only = e.target.checked; keepScroll(render); return; }
  if (e.target.dataset.tcount) { TN.setCount(e.target.dataset.tcount, e.target.value); return; }
  if (e.target.dataset.x === 'flag') { X.XS.flagOnly = e.target.checked; render(); return; }
  const f = e.target.dataset.filter;
  if (!f) return;
  V.F[f] = f === 'hab' ? e.target.checked : e.target.value;
  keepScroll(render);
});
document.addEventListener('input', e => {
  if (!e.target.classList.contains('tf')) return;
  const v = nrm(e.target.value);
  $$('.list .row[data-s], .inv .ii[data-s], .xc[data-s], .xtbl tr[data-s], .cc[data-s]', $('#main')).forEach(r => { r.hidden = !!v && !r.dataset.s.includes(v); });
  $$('.xgrp', $('#main')).forEach(g => { g.hidden = !g.querySelector('.xc:not([hidden])'); });
  if (e.target.classList.contains('sk-q')) SF.q = e.target.value;
  if (e.target.classList.contains('tq')) { TN.TS.q = e.target.value; TN.applyFilter(); }
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.dataset.form === 'skadd') {
    e.preventDefault();
    const ref = f.elements.ref.value.trim(), qty = Math.max(1, parseInt(f.elements.qty.value, 10) || 1);
    const p = partByRef(ref);
    const r = stockAdd(ref, qty, f.elements.desc.value.trim() || (p ? p.name || p.type : ''));
    toast({ ok: 'Añadida (verde)', more: 'Cantidad sumada', exists: 'Ya está en el stock rule' }[r] || '');
    render(); return;
  }
  if (f.dataset.form !== 'invadd') return;
  e.preventDefault();
  const ref = f.elements.ref.value.trim(), qty = Math.max(1, parseInt(f.elements.qty.value, 10) || 1);
  if (!ref) return;
  invAdd(f.dataset.list, ref, qty);
  render();
  const inp = $('form[data-form=invadd] input[name=ref]'); if (inp && !mobile()) inp.focus();
});
/* ---------- stock de tóner ---------- */
async function shareOrCopy(title, text, okMsg) {
  if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (x) { if (x && x.name === 'AbortError') return; } }
  copyText(text); toast(okMsg);
}
function tonerItemForm(did, iid) {
  const d = TN.delegs().find(x => x.id === did), it = iid ? d?.items.find(x => x.id === iid) : null;
  if (!d) return;
  openDialog(it ? 'Editar fila' : 'Nueva fila · ' + d.name, TN.itemFormHTML(it), {
    extra: it ? '<button type="button" class="ghost bad" data-del>Borrar fila</button>' : '',
    mount(f) { f.querySelector('[data-del]')?.addEventListener('click', () => { if (confirm(`¿Borrar ${it.model} ${it.color}?`)) { TN.deleteItem(did, iid); close(); keepScroll(render); } }); },
    submit(f) { TN.saveItem(did, iid, f); keepScroll(render); toast('Guardado'); }
  });
}
function delegForm(did) {
  const d = TN.delegs().find(x => x.id === did), others = TN.delegs().filter(x => x.id !== did);
  openDialog(d ? 'Delegación ' + d.name : 'Nueva delegación', `<label class="fld"><span>Nombre</span><input name="name" required value="${esc(d?.name || '')}" placeholder="VITORIA"></label>
    ${others.length ? `<label class="fld"><span>Copiar las filas de otra delegación (stock actual a 0)</span><select name="from"><option value="">— no copiar —</option>${others.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>` : ''}`, {
    extra: d ? '<button type="button" class="ghost bad" data-del>Borrar delegación</button><button type="button" class="ghost" data-new>+ Nueva</button>' : '',
    mount(f) {
      f.querySelector('[data-del]')?.addEventListener('click', () => { if (confirm(`¿Borrar la delegación ${d.name} y sus ${d.items.length} filas? Se puede deshacer hasta publicar.`)) { TN.deleteDeleg(d.id); close(); location.hash = '#/toner'; render(); } });
      f.querySelector('[data-new]')?.addEventListener('click', () => { close(); delegForm(null); });
    },
    submit(f) {
      const name = f.elements.name.value;
      let x = d;
      if (d) TN.renameDeleg(d.id, name); else x = TN.addDeleg(name);
      const from = f.elements.from?.value;
      const n = from ? TN.copyItemsFrom(x.id, from) : 0;
      location.hash = '#/toner/' + encodeURIComponent(x.name); render();
      toast(n ? `${n} filas copiadas` : 'Guardado');
    }
  });
}
async function tonerAction(a, did) {
  if (a === 'mine') { TN.setMine(did); render(); toast('Se abrirá siempre esta delegación'); return; }
  if (a === 'order') { await shareOrCopy('Reposición de tóner', TN.orderText(did), 'Pedido copiado: pégalo en Teams o en el correo'); return; }
  if (a === 'export') {
    try {
      const { blob, name } = await TN.exportXlsx(), file = new File([blob], name, { type: blob.type });
      if (mobile() && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (x) { if (x && x.name === 'AbortError') return; } }
      const u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = name; l.click(); setTimeout(() => URL.revokeObjectURL(u), 2000);
    } catch (x) { alert('No se pudo generar el Excel: ' + x.message); }
    return;
  }
  if (!st.editing) return;
  if (a === 'import') { $('#tnFile').click(); return; }
  if (a === 'newdeleg') { delegForm(null); return; }
  if (a === 'deleg') { delegForm(did); return; }
  if (a === 'add') { tonerItemForm(did, null); return; }
  if (a === 'count') { TN.startCount(did); render(); return; }
  if (a === 'countok') {
    const diffs = TN.countDiffs();
    if (!diffs.length) { if (confirm('No hay diferencias con el stock registrado. ¿Guardar la fecha de recuento y salir del modo recuento?')) { TN.applyCount(); render(); toast('Recuento guardado'); } return; }
    openDialog('Diferencias del recuento', `<p class="mut small">Se actualizará el stock actual de estas filas y la fecha del último recuento.</p><ul class="ul">${diffs.map(({ i, to }) => `<li><b>${esc(i.model)} ${esc(i.color)}</b> (${esc(i.edp)}): ${i.a} → <b>${to}</b> <span class="mut">(${to - i.a > 0 ? '+' : ''}${to - i.a})</span></li>`).join('')}</ul>`, {
      label: 'Aplicar', submit() { const n = TN.applyCount(); keepScroll(render); toast(`${n} filas actualizadas`); }
    });
  }
}
$('#tnFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const sheets = await X.readXlsx(await f.arrayBuffer());
    if (TN.delegs().length && !confirm('Las delegaciones del archivo sustituirán a las que tengan el mismo nombre. Se puede deshacer hasta publicar. ¿Continuar?')) return;
    const r = TN.importSheets(sheets); render(); alert('Importado:\n' + r.join('\n') + '\n\nRevisa y pulsa «Publicar» para compartirlo con el equipo.');
  } catch (x) { alert('No se pudo importar: ' + (x.message || x)); }
});

function xAction(a) {
  if (a === 'open') { $('#xFile').click(); return; }
  if (a === 'close') { X.closeFile(); render(); return; }
  if (a === 'hidden') { X.XS.showHidden = !X.XS.showHidden; render(); return; }
  if (a === 'more') { X.XS.limit += 300; keepScroll(render); return; }
  if (a === 'tocat') { sheetToCatalogForm(X.curSheet()); return; }
  if (a === 'tpl') {
    openDialog('Ajustar vista', X.templateDialogHTML(), {
      wide: true,
      mount(f) { f.querySelector('[data-xreset]')?.addEventListener('click', () => { X.resetTemplate(X.curSheet()); close(); render(); toast('Vista por defecto'); }); },
      submit(f) { X.saveTemplate(X.curSheet(), X.readTemplateForm(f), !!f.elements.team?.checked); render(); toast(f.elements.team?.checked ? 'Vista guardada: se publicará con «Publicar»' : 'Vista guardada en este dispositivo'); }
    });
  }
}
async function openX(file) {
  try { await X.openFile(file); if (location.hash !== '#/excel') location.hash = '#/excel'; else render(); }
  catch (x) { alert('No se pudo abrir: ' + (x.message || x)); }
}
$('#xFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) openX(f); });

async function stockAction(a) {
  if (a === 'import') { $('#skFile').click(); return; }
  if (a === 'tocat') {
    const d = stockGet(); if (!d) return;
    sheetToCatalogForm({ name: d.name, cols: [{ key: 'referencia', label: 'Referencia' }, { key: 'descripcion', label: 'Descripción' }],
      rows: [...d.rows.filter(x => x.state !== 'del'), ...d.added].map(x => ({ v: { referencia: x.ref, descripcion: x.desc } })) });
    return;
  }
  if (a === 'clear') { if (confirm('¿Quitar el stock rule de este dispositivo? Se pierden los cambios no exportados.')) { stockClear(); render(); } return; }
  if (a === 'toinv') {
    const fin = stockFinal(stockGet()), have = invGet().tengo;
    const add = fin.filter(x => !have.some(h => nrm(h.ref) === nrm(x.ref)));
    if (!add.length) { toast('Todas ya están en «Tengo»'); return; }
    if (!confirm(`Añadir ${add.length} referencias a «Tengo» con la cantidad del stock rule (marcadas como uso habitual)? Las que ya tienes no se tocan.`)) return;
    add.forEach(x => invAdd('tengo', x.ref, x.qty || 1, 'hab'));
    toast(`${add.length} referencias añadidas a «Tengo»`, { label: 'Ver', href: '#/inv/tengo' }); render(); return;
  }
  if (a === 'export') {
    try {
      const { blob, name } = await exportStock();
      const file = new File([blob], name, { type: blob.type });
      if (mobile() && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name }); return; } catch (x) { if (x && x.name === 'AbortError') return; }
      }
      const u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = name; l.click(); setTimeout(() => URL.revokeObjectURL(u), 2000);
      toast('Excel generado: ' + name);
    } catch (x) { alert('No se pudo generar el Excel: ' + x.message); }
  }
}
$('#skFile').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  if (stockGet() && !confirm('Se reemplazará el stock rule cargado y sus cambios no exportados. ¿Continuar?')) return;
  try { const d = await importStock(file); SF.f = 'all'; SF.q = ''; location.hash = '#/inv/stock'; render(); toast(`${d.rows.length} referencias importadas`); }
  catch (x) { alert('No se pudo leer el archivo: ' + (x.message || x)); }
});
$('#invFile').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try { if (confirm('Se reemplazará tu inventario de este dispositivo por el del archivo. ¿Continuar?')) { invImport(await file.text()); render(); toast('Inventario importado'); } }
  catch { alert('Archivo no válido'); }
  e.target.value = '';
});

/** Aviso al editor: correo si hay dirección configurada; si no, compartir o copiar el texto. */
async function report(subject, body) {
  const to = st.D.config?.contacto;
  if (to) { location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; return; }
  const text = subject + '\n' + body;
  if (navigator.share) { try { await navigator.share({ title: subject, text }); return; } catch (x) { if (x && x.name === 'AbortError') return; } }
  copyText(text); toast('Aviso copiado: pégalo en Teams al responsable');
}

async function shareList(list) {
  const text = V.invText(list);
  if (!invGet()[list].length) return;
  if (navigator.share) { try { await navigator.share({ title: 'Referencias', text }); return; } catch (x) { if (x && x.name === 'AbortError') return; } }
  copyText(text); toast('Lista copiada: pégala en Teams o en el pedido');
}

function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }

// Vista general: el contenido de las series plegadas se genera al desplegarlas
document.addEventListener('toggle', e => {
  const d = e.target;
  if (!d.open || !d.dataset || !d.dataset.lazy) return;
  const s = d.dataset.lazy === '-' ? null : SR(d.dataset.lazy);
  const ms = s ? modelsOfSerie(s) : st.D.models.filter(m => !ix.serieOf.has(m.id));
  d.insertAdjacentHTML('beforeend', V.overviewBody(s, ms));
  delete d.dataset.lazy;
}, true);

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
// el borrador se escribe con un retardo corto: al salir o pasar a segundo plano se escribe ya
window.addEventListener('pagehide', () => { flushDraftNow(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) flushDraft(); });

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
  await loadPending();
  const tok = savedToken(), repo = savedRepo();
  if (tok && repo) {
    try { if (await login(repo, tok, null, true) === 'stale') setTimeout(() => toast('Tu borrador se hizo sobre una versión anterior: al publicar se avisará del conflicto.'), 800); }
    catch (err) { if (err.fatal) clearToken(); else toast('Sin conexión con GitHub: modo consulta'); }
  }
  render();
  if (/[?&]shared=1/.test(location.search + location.hash)) { const f = await X.takeShared(); if (f) { history.replaceState(null, '', location.pathname + '#/excel'); openX(f); } }
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
