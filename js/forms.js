// Diálogos del editor: serie, modelo, pieza, alta masiva, importar tabla, tipos, sesión y publicación.

import { $, $$, esc, uid, cmp, nrm, cleanRef, parseTable, csvLine, download, isUrl, toast, lsSet, decodeText } from './util.js';
import {
  st, K, ix, M, SR, P, TECH, serieOf, mo, partByRef, originOf, sysOf, sIdx, tIdx, modelsOfSerie, categories,
  ensureType, addT, setSerie, newModel, save, undo, migrate, emptyData
} from './store.js';
import { login, enterLocal, localOK, savedRepo, publish, diffLines, discard, logout, historyUrl, photoChanges } from './github.js';
import { loadZip } from './stock.js';
import { reviewData, blocking, mine, UI } from './views.js';
import { compress, previewOf, fileName, imgName, imgSrc, putPending, fmtKB, CFG as IMGCFG } from './img.js';

let refresh = () => {};
export const setRefresh = fn => { refresh = fn; };
const go = h => { location.hash = h; };

/* ---------- diálogo genérico ---------- */

export function openDialog(title, body, o = {}) {
  const d = $('#dlg');
  d.className = o.wide ? 'wide' : '';
  d.innerHTML = `<form class="dl" novalidate><header><h2>${title}</h2><button type="button" class="x" data-close aria-label="Cerrar">✕</button></header>
    <div class="db">${body}</div><div class="err" role="alert"></div>
    <footer>${o.extra || ''}<span class="sp"></span>${o.submit ? `<button type="button" class="ghost" data-close>Cancelar</button><button class="pri" type="submit">${o.label || 'Guardar'}</button>` : '<button type="button" data-close>Cerrar</button>'}</footer></form>`;
  const f = d.querySelector('form');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (!o.submit) return;
    const err = f.querySelector('.err'), btn = f.querySelector('button[type=submit]');
    err.textContent = '';
    for (const el of f.querySelectorAll('[required]')) if (!el.value.trim()) { err.textContent = 'Completa los campos obligatorios'; el.focus(); return; }
    btn.disabled = true;
    try { const r = await o.submit(f); if (r !== false) close(); }
    catch (x) { err.textContent = x.message || String(x); }
    finally { btn.disabled = false; }
  });
  d.querySelectorAll('[data-close]').forEach(b => { b.onclick = close; });
  if (!d.open) d.showModal();
  if (o.mount) o.mount(f);
  const first = f.querySelector('.db input:not([type=hidden]):not([type=checkbox]),.db select,.db textarea');
  if (first && !matchMedia('(pointer:coarse)').matches) first.focus();
  return f;
}
export function close() { const d = $('#dlg'); if (d.open) d.close(); }
const fld = (label, html, cls = '') => `<label class="fld ${cls}"><span>${label}</span>${html}</label>`;
const val = (f, n) => (f.elements[n]?.value ?? '').trim();
const changed = msg => { save(); refresh(); if (msg) toast(msg); };

/* ---------- selector de destinos (series y modelos) ---------- */

function picker(name, checked) {
  const on = (k, id) => checked.some(t => t.k === k && t.id === id);
  const lab = (k, id, text, sub) => `<label data-s="${esc(nrm(text + ' ' + sub))}"><input type="checkbox" name="${name}" value="${k}:${esc(id)}" ${on(k, id) ? 'checked' : ''}><span>${esc(text)}${sub ? ` <small>${esc(sub)}</small>` : ''}</span></label>`;
  const ss = [...st.D.series].sort((a, b) => cmp(a.name, b.name));
  let h = `<input type="search" class="pf" placeholder="Filtrar series o modelos" aria-label="Filtrar">`;
  h += `<div class="pick">`;
  if (ss.length) h += '<div class="pkh">Series completas (incluye modelos futuros)</div>' + ss.map(s => lab('s', s.id, s.name, s.models.length + ' modelos')).join('');
  ss.forEach(s => { const ms = modelsOfSerie(s); if (ms.length) h += `<div class="pkh">${esc(s.name)}</div>` + ms.map(m => lab('m', m.id, m.name, m.codes.join(' / '))).join(''); });
  const free = st.D.models.filter(m => !serieOf(m.id));
  if (free.length) h += '<div class="pkh">Sin serie</div>' + free.map(m => lab('m', m.id, m.name, m.codes.join(' / '))).join('');
  return h + (st.D.models.length ? '' : '<p class="mut">Crea primero un modelo.</p>') + '</div>';
}
const readPick = (f, name) => $$(`input[name=${name}]:checked`, f).map(i => { const k = i.value.indexOf(':'); return { k: i.value.slice(0, k), id: i.value.slice(k + 1) }; });
export function bindPickFilter(root) {
  root.addEventListener('input', e => {
    if (!e.target.classList.contains('pf')) return;
    const v = nrm(e.target.value);
    $$('.pick label', e.target.parentElement).forEach(l => { l.hidden = !!v && !l.dataset.s.includes(v); });
  });
}

/* ---------- SERIE ---------- */

export function serieForm(s) {
  const ms = s ? modelsOfSerie(s) : [];
  const free = st.D.models.filter(m => !serieOf(m.id));
  const order = ms.map((m, i) => `<li data-id="${esc(m.id)}"><span>${esc(m.name)} <small>${esc(m.codes.join(' / '))}</small></span><button type="button" class="sm ghost" data-mv="-1" aria-label="Subir" ${i ? '' : 'disabled'}>↑</button><button type="button" class="sm ghost" data-mv="1" aria-label="Bajar" ${i < ms.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="sm ghost bad" data-rm aria-label="Quitar de la serie">✕</button></li>`).join('');
  openDialog(s ? 'Editar serie' : 'Nueva serie', `
    ${fld('Nombre de la serie', `<input name="name" required value="${esc(s?.name || '')}" placeholder="METIS MF4">`)}
    ${fld('Categoría', `<input name="category" list="dlCat" value="${esc(s?.category || '')}" placeholder="Color, B&N…">`)}
    ${fld('Enlace al despiece de la serie (opcional)', `<input name="despiece" type="url" inputmode="url" value="${esc(s?.despiece || '')}" placeholder="https://…">`)}
    <p class="mut small">Se usa en los modelos que no tengan su propio enlace.</p>
    ${s ? `<div class="fld"><span>Modelos y orden</span><ol class="order">${order || '<li class="mut">Sin modelos</li>'}</ol></div>` : ''}
    ${free.length ? `<div class="fld"><span>Añadir modelos sin serie</span><div class="pick">${free.map(m => `<label><input type="checkbox" name="add" value="${esc(m.id)}"><span>${esc(m.name)}</span></label>`).join('')}</div></div>` : ''}
    <datalist id="dlCat">${categories().map(c => `<option value="${esc(c)}">`).join('')}</datalist>`, {
    extra: s ? '<button type="button" class="ghost bad" data-del>Borrar serie</button>' : '',
    mount(f) {
      const ol = $('.order', f);
      ol?.addEventListener('click', e => {
        const li = e.target.closest('li'); if (!li) return;
        if (e.target.dataset.mv) { const sib = e.target.dataset.mv === '-1' ? li.previousElementSibling : li.nextElementSibling; if (sib) e.target.dataset.mv === '-1' ? sib.before(li) : sib.after(li); }
        else if (e.target.hasAttribute('data-rm')) li.remove();
        $$('li', ol).forEach((x, i, a) => { const b = $$('[data-mv]', x); if (b.length) { b[0].disabled = !i; b[1].disabled = i === a.length - 1; } });
      });
      $('[data-del]', f)?.addEventListener('click', () => {
        if (!confirm(`¿Borrar la serie ${s.name}? Sus modelos y piezas se conservan: los modelos quedan sin serie y las piezas asignadas a la serie pasan a sus modelos.`)) return;
        st.D.parts.forEach(p => { if (p.t.some(t => t.k === 's' && t.id === s.id)) { p.t = p.t.filter(t => !(t.k === 's' && t.id === s.id)); addT(p, s.models.map(id => ({ k: 'm', id }))); } });
        st.D.tech.forEach(x => { if (x.t.some(t => t.k === 's' && t.id === s.id)) { x.t = x.t.filter(t => !(t.k === 's' && t.id === s.id)); addT(x, s.models.map(id => ({ k: 'm', id }))); } });
        st.D.series = st.D.series.filter(x => x.id !== s.id);
        close(); changed('Serie borrada'); go('#/');
      });
    },
    submit(f) {
      const name = val(f, 'name'), dsp = val(f, 'despiece');
      if (st.D.series.some(x => x.id !== s?.id && nrm(x.name) === nrm(name))) throw new Error('Ya existe una serie con ese nombre');
      if (dsp && !isUrl(dsp)) throw new Error('El enlace debe empezar por http:// o https://');
      const kept = s ? $$('.order li[data-id]', f).map(li => li.dataset.id) : [];
      const adds = $$('input[name=add]:checked', f).map(i => i.value);
      let x = s;
      if (!x) { x = { id: uid(), name, category: '', despiece: '', models: [] }; st.D.series.push(x); }
      x.name = name; x.category = val(f, 'category'); x.despiece = dsp;
      x.models = [...kept, ...adds.filter(id => !kept.includes(id))];
      x.models.forEach(id => setSerie(id, x.id));
      changed('Serie guardada'); go('#/s/' + encodeURIComponent(name));
    }
  });
}

/* ---------- MODELO ---------- */

export function modelForm(m, serieId) {
  const cur = m ? serieOf(m.id)?.id : serieId;
  openDialog(m ? 'Editar modelo' : 'Nuevo modelo', `
    ${fld('Nombre comercial', `<input name="name" required value="${esc(m?.name || '')}" placeholder="IM C2010">`)}
    <div class="two">${fld('Código(s)', `<input name="codes" value="${esc((m?.codes || []).join(', '))}" placeholder="D0DY" autocapitalize="characters">`)}
    ${fld('Plataforma', `<input name="platform" value="${esc(m?.platform || '')}" placeholder="METIS-MF4y">`)}</div>
    <div class="two">${fld('Serie', `<select name="serie"><option value="">— sin serie —</option>${[...st.D.series].sort((a, b) => cmp(a.name, b.name)).map(s => `<option value="${esc(s.id)}" ${s.id === cur ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`)}
    ${fld('Franja', `<input name="franja" list="dlFr" value="${esc(m?.franja || '')}" placeholder="Alta, Media, Baja">`)}</div>
    ${fld('Enlace al despiece (opcional)', `<input name="despiece" type="url" inputmode="url" value="${esc(m?.despiece || '')}" placeholder="https://…">`)}
    <p class="mut small">Varios códigos separados por coma. Si no hay enlace propio se usa el de la serie.</p>
    <datalist id="dlFr"><option value="Alta"><option value="Media"><option value="Baja"></datalist>`, {
    extra: m ? '<button type="button" class="ghost bad" data-del>Borrar</button><button type="button" class="ghost" data-clone>Clonar</button>' : '',
    mount(f) {
      $('[data-del]', f)?.addEventListener('click', () => {
        const only = st.D.tech.filter(x => x.t.length && x.t.every(t => t.k === 'm' && t.id === m.id));
        if (!confirm(`¿Borrar ${m.name}? Las referencias que solo le pertenecían pasarán a «Sin asignar».${only.length ? `\n\nTambién se borrarán ${only.length} SC o consultas que solo aplicaban a este modelo.` : ''}`)) return;
        st.D.tech = st.D.tech.filter(x => !only.includes(x));
        st.D.tech.forEach(x => { x.t = x.t.filter(t => !(t.k === 'm' && t.id === m.id)); });
        st.D.parts.forEach(p => { p.t = p.t.filter(t => !(t.k === 'm' && t.id === m.id)); });
        st.D.series.forEach(s => { s.models = s.models.filter(x => x !== m.id); });
        st.D.models = st.D.models.filter(x => x.id !== m.id);
        close(); changed('Modelo borrado'); go('#/');
      });
      $('[data-clone]', f)?.addEventListener('click', () => {
        const name = (prompt(`Nombre del nuevo modelo (copia de ${m.name} con sus referencias)`) || '').trim();
        if (!name) return;
        if (st.D.models.some(x => nrm(x.name) === nrm(name))) { alert('Ya existe un modelo con ese nombre'); return; }
        const n = newModel({ name, platform: m.platform, franja: m.franja });
        const s = serieOf(m.id); if (s) s.models.splice(s.models.indexOf(m.id) + 1, 0, n.id);
        st.D.parts.forEach(p => { if (p.t.some(t => t.k === 'm' && t.id === m.id)) p.t.push({ k: 'm', id: n.id }); });
        close(); changed('Modelo clonado: añade su código'); go('#/m/' + encodeURIComponent(name));
        setTimeout(() => modelForm(n), 50);
      });
    },
    submit(f) {
      const name = val(f, 'name'), dsp = val(f, 'despiece');
      if (st.D.models.some(x => x.id !== m?.id && nrm(x.name) === nrm(name))) throw new Error('Ya existe un modelo con ese nombre');
      if (dsp && !isUrl(dsp)) throw new Error('El enlace debe empezar por http:// o https://');
      const codes = val(f, 'codes').split(/[,;/]/).map(x => x.trim().toUpperCase()).filter(Boolean);
      const dupe = codes.find(c => (ix.byCode.get(nrm(c)) || []).some(x => x.id !== m?.id));
      if (dupe && !confirm(`El código ${dupe} ya lo usa otro modelo. ¿Guardar igualmente?`)) return false;
      const x = m || newModel({ name });
      Object.assign(x, { name, codes, platform: val(f, 'platform'), franja: val(f, 'franja'), despiece: dsp });
      setSerie(x.id, val(f, 'serie'));
      changed('Modelo guardado'); go('#/m/' + encodeURIComponent(name));
    }
  });
}

/* ---------- PIEZA ---------- */

export function partForm(p, preset) {
  if (p?.cl) return cleanForm(p);
  const targets = p ? p.t : (preset || []);
  openDialog(p ? 'Editar pieza' : 'Nueva pieza', `
    <div class="two">${fld('Referencia', `<input name="ref" required value="${esc(p?.ref || '')}" autocapitalize="characters" autocomplete="off" spellcheck="false">`)}
    ${fld('Tipo', `<input name="type" list="dlType" value="${esc(p?.type || '')}" placeholder="Revelador K, Fusor…">`)}</div>
    <div class="sug" hidden></div>
    ${fld('Descripción', `<input name="name" value="${esc(p?.name || '')}">`)}
    ${fld('Notas', `<input name="note" value="${esc(p?.note || '')}">`)}
    ${fld('Sustituye a (referencias anteriores, separadas por coma)', `<input name="old" value="${esc((p?.old || []).join(', '))}" autocapitalize="characters" spellcheck="false" placeholder="Opcional">`)}
    ${photoFieldHTML(p)}
    <div class="checks"><label class="sw"><input type="checkbox" name="hab" ${p && !p.hab ? '' : 'checked'}><span>Habitual</span></label>
    <label class="sw"><input type="checkbox" name="chk" ${p?.chk ? 'checked' : ''}><span>Por verificar</span></label>
    <label class="sw"><input type="checkbox" name="gen" ${p?.gen ? 'checked' : ''}><span>General (sin modelo)</span></label></div>
    <div class="fld tg"><span>Aplica a</span>${picker('pt', targets)}</div>
    <datalist id="dlType">${st.D.types.map(t => `<option value="${esc(t.name)}">`).join('')}</datalist>`, {
    extra: p ? '<button type="button" class="ghost bad" data-del>Borrar</button>' : '',
    mount(f) {
      bindPickFilter(f);
      photoMount(f, p);
      const tg = $('.tg', f), sug = $('.sug', f);
      const gen = () => { tg.hidden = f.elements.gen.checked; };
      f.elements.gen.addEventListener('change', gen); gen();
      const check = () => { // sugerencia por prefijo: D0DZ2205 → modelo con código D0DZ
        const ref = cleanRef(f.elements.ref.value), o = originOf(ref);
        const dup = partByRef(ref);
        let h = '';
        if (dup && dup.id !== p?.id) h += `<p>La referencia ${esc(dup.ref)} ya existe (${esc(dup.type)}). Al guardar se fusionará con ella.</p>`;
        const pend = o.filter(m => !$(`input[name=pt][value="m:${CSS.escape(m.id)}"]`, f)?.checked);
        if (pend.length) h += `<p>El prefijo ${esc(ref.slice(0, 4))} corresponde a ${pend.map(m => `<b>${esc(m.name)}</b>`).join(', ')}. <button type="button" class="sm" data-orig>Marcar</button></p>`;
        sug.innerHTML = h; sug.hidden = !h;
      };
      f.elements.ref.addEventListener('input', check);
      f.addEventListener('change', e => { if (e.target.name === 'pt') check(); });
      sug.addEventListener('click', e => {
        if (!e.target.hasAttribute('data-orig')) return;
        originOf(cleanRef(f.elements.ref.value)).forEach(m => { const i = $(`input[name=pt][value="m:${CSS.escape(m.id)}"]`, f); if (i) i.checked = true; });
        check();
      });
      check();
      $('[data-del]', f)?.addEventListener('click', () => {
        if (!confirm(`¿Borrar la referencia ${p.ref}?`)) return;
        st.D.parts = st.D.parts.filter(x => x.id !== p.id); close(); changed('Referencia borrada');
      });
    },
    async submit(f) {
      const ref = cleanRef(val(f, 'ref')), type = val(f, 'type'), gen = f.elements.gen.checked;
      const t = gen ? [] : readPick(f, 'pt');
      if (!gen && !t.length && !confirm('No has marcado ningún modelo ni serie: quedará en «Sin asignar». ¿Guardar igualmente?')) return false;
      ensureType(type);
      const old = [...new Set(val(f, 'old').split(/[,;\n]+/).map(cleanRef).filter(r => r && nrm(r) !== nrm(ref)))];
      const d = { ref, type, name: val(f, 'name'), note: val(f, 'note'), hab: f.elements.hab.checked, chk: f.elements.chk.checked, gen, old, t };
      const dup = st.D.parts.find(x => nrm(x.ref) === nrm(ref) && x.id !== p?.id);
      if (dup) {
        addT(dup, t); dup.old = [...new Set([...dup.old, ...old])]; dup.name = d.name || dup.name; dup.type = type || dup.type; dup.note = d.note || dup.note;
        if (p) st.D.parts = st.D.parts.filter(x => x.id !== p.id);
      } else if (p) Object.assign(P(p.id), d);
      else st.D.parts.push({ id: uid(), ...d });
      const target = dup || (p ? P(p.id) : st.D.parts[st.D.parts.length - 1]);
      if (dup && p?.img && !dup.img) dup.img = p.img;
      await photoApply(f, target);
      changed(dup ? 'Fusionada con ' + dup.ref : 'Referencia guardada');
    }
  });
}

/* ---------- ALTA MASIVA ---------- */

export function bulkForm(preset) {
  openDialog('Añadir varias referencias', `
    ${fld('Una por línea: REFERENCIA ; descripción ; tipo', '<textarea name="txt" rows="7" required spellcheck="false" placeholder="D0E33060 ; Revelador K ; Revelador K"></textarea>')}
    <div class="two">${fld('Tipo por defecto', '<input name="type" list="dlType">')}
    <label class="sw"><input type="checkbox" name="hab" checked><span>Habitual</span></label></div>
    <div class="fld"><span>Aplica a</span>${picker('bt', preset || [])}</div>
    <p class="mut small">Si una referencia ya existe se le añaden los destinos marcados. «d0e3 3060» y «D0E3-3060» quedan como D0E33060.</p>
    <datalist id="dlType">${st.D.types.map(t => `<option value="${esc(t.name)}">`).join('')}</datalist>`, {
    label: 'Añadir', mount: bindPickFilter,
    submit(f) {
      const t = readPick(f, 'bt'); let n = 0, m = 0;
      val(f, 'txt').split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
        let ref, name = '', type = val(f, 'type');
        const sp = l.split(/\s*[;\t|]\s*/);
        if (sp.length > 1) { ref = sp[0]; name = sp[1] || ''; if (sp[2]) type = sp[2]; }
        else {
          const mm = l.match(/^([A-Za-z0-9]{4}[\s-][A-Za-z0-9]{4})(?:\s+(.*))?$/);
          if (mm) { ref = mm[1]; name = mm[2] || ''; } else { const w = l.split(/\s+/); ref = w[0]; name = w.slice(1).join(' '); }
        }
        ref = cleanRef(ref); if (!ref) return;
        ensureType(type);
        const ex = st.D.parts.find(p => nrm(p.ref) === nrm(ref));
        if (ex) { addT(ex, t); if (!ex.name && name) ex.name = name; if (!ex.type && type) ex.type = type; m++; }
        else { st.D.parts.push({ id: uid(), ref, type, name, note: '', hab: f.elements.hab.checked, chk: false, gen: false, old: [], t: [...t] }); n++; }
      });
      changed(`${n} nuevas, ${m} ampliadas`);
    }
  });
}

/* ---------- IMPORTAR TABLA / EXPORTAR CSV ---------- */

export const FLAT_H = ['Serie', 'Categoría', 'Modelo', 'Códigos', 'Plataforma', 'Franja', 'Despiece', 'Sistema', 'Tipo', 'Referencia', 'Descripción', 'Uso', 'Notas', 'Verificar', 'Sustituye a', 'Asignación'];
export function exportCsv(modelIds, name) {
  const only = modelIds ? new Set(modelIds) : null, rows = [];
  st.D.parts.forEach(p => {
    const tail = [sysOf(p.type), p.type, p.ref, p.name, p.hab ? 'Habitual' : 'Poco habitual', p.note, p.chk ? 'Sí' : '', p.old.join(', ')];
    // «Asignación» permite reimportar sin perder el significado: General, Sin asignar o Toda la serie
    if (p.gen || p.cl || !mo(p).size) { if (!only) rows.push(['', '', '', '', '', '', '', ...tail, p.cl ? 'Limpieza' : p.gen ? 'General' : 'Sin asignar']); return; }
    const viaSerie = new Set();
    p.t.filter(t => t.k === 's').forEach(t => { const s = SR(t.id); if (!s || (only && !s.models.some(id => only.has(id)))) return;
      s.models.forEach(id => viaSerie.add(id)); rows.push([s.name, s.category, '', '', '', '', s.despiece, ...tail, 'Toda la serie']); });
    mo(p).forEach(id => {
      if ((only && !only.has(id)) || viaSerie.has(id)) return;
      const m = M(id), s = serieOf(id);
      rows.push([s?.name || '', s?.category || '', m.name, m.codes.join(' / '), m.platform, m.franja, m.despiece, ...tail, '']);
    });
  });
  rows.sort((a, b) => cmp(a[0], b[0]) || cmp(a[2], b[2]) || sIdx(a[8]) - sIdx(b[8]) || tIdx(a[8]) - tIdx(b[8]) || cmp(a[9], b[9]));
  download(name || 'referencias.csv', '﻿' + [FLAT_H, ...rows].map(csvLine).join('\n'), 'text/csv');
  toast(rows.length + ' filas exportadas');
}

/** opts.noModel: 'gen' (pieza general) o 'none' (queda «Sin asignar»); opts.origin: asignar por prefijo de la referencia. */
export function importRows(rows, create, opts = { noModel: 'gen', origin: false }) {
  const MAP = { serie: 'serie', categoria: 'cat', familia: 'cat', modelo: 'model', codigo: 'codes', codigos: 'codes', plataforma: 'plat', franja: 'franja', despiece: 'dsp', tipo: 'type', referencia: 'ref', descripcion: 'name', uso: 'uso', notas: 'note', verificar: 'chk', sustituyea: 'old', asignacion: 'asg' };
  const hdr = rows[0].map(nrm), hasHdr = hdr.includes('referencia');
  let col = {};
  if (hasHdr) { hdr.forEach((h, i) => { const k = MAP[h]; if (k && col[k] === undefined) col[k] = i; }); rows = rows.slice(1); }
  else col = { model: 0, type: 1, ref: 2, name: 3 };
  const g = (r, k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim());
  const res = { nuevas: 0, ampliadas: 0, modelos: 0, series: 0, omitidas: 0, origen: 0, faltan: new Set() };
  const byRef = new Map(st.D.parts.map(p => [nrm(p.ref), p]));
  rows.forEach(r => {
    const ref = cleanRef(g(r, 'ref')); if (!ref) { res.omitidas++; return; }
    const mname = g(r, 'model'), type = g(r, 'type');
    let targets = [], gen = false;
    const asg = nrm(g(r, 'asg'));
    if (!mname && asg === 'limpieza') { targets = []; }
    else if (!mname && asg === 'todalaserie') {
      const s = st.D.series.find(x => nrm(x.name) === nrm(g(r, 'serie')));
      if (s) targets = [{ k: 's', id: s.id }]; else { res.faltan.add(g(r, 'serie')); res.omitidas++; return; }
    } else if (!mname) {
      const o = opts.origin ? originOf(ref) : [];
      if (o.length) { targets = o.map(m => ({ k: 'm', id: m.id })); res.origen++; }
      else gen = asg === 'general' || (asg !== 'sinasignar' && opts.noModel === 'gen');
    } else {
      let m = st.D.models.find(x => nrm(x.name) === nrm(mname));
      if (!m) {
        if (!create) { res.faltan.add(mname); res.omitidas++; return; }
        m = newModel({ name: mname, codes: g(r, 'codes').split(/[/,;]/).map(x => x.trim().toUpperCase()).filter(Boolean), platform: g(r, 'plat'), franja: g(r, 'franja'), despiece: isUrl(g(r, 'dsp')) ? g(r, 'dsp') : '' });
        res.modelos++;
      }
      const sn = g(r, 'serie');
      if (sn && !serieOf(m.id)) {
        let s = st.D.series.find(x => nrm(x.name) === nrm(sn));
        if (!s && create) { s = { id: uid(), name: sn, category: g(r, 'cat'), despiece: '', models: [] }; st.D.series.push(s); res.series++; }
        if (s) setSerie(m.id, s.id);
      }
      targets = [{ k: 'm', id: m.id }];
    }
    ensureType(type);
    const ex = byRef.get(nrm(ref));
    const old = g(r, 'old').split(/[,;\n]+/).map(cleanRef).filter(x => x && nrm(x) !== nrm(ref));
    if (ex) { addT(ex, targets); ex.old = [...new Set([...ex.old, ...old])]; if (!ex.name && g(r, 'name')) ex.name = g(r, 'name'); if (!ex.type && type) ex.type = type; res.ampliadas++; }
    else { const np = { id: uid(), ref, type: asg === 'limpieza' ? '' : type, cl: asg === 'limpieza', img: '', name: g(r, 'name'), note: g(r, 'note'), hab: !/^poco|^ocas/i.test(g(r, 'uso')), chk: /^(s[ií]|x|1|true)$/i.test(g(r, 'chk')), gen, old, t: targets }; st.D.parts.push(np); byRef.set(nrm(ref), np); res.nuevas++; }
  });
  return res;
}

export function tableForm() {
  openDialog('Importar tabla (Excel o CSV)', `
    <p class="mut small">Pega filas copiadas de Excel o carga un CSV. Con cabecera se reconocen: Serie, Categoría, Modelo, Códigos, Plataforma, Franja, Despiece, Tipo, Referencia, Descripción, Uso, Notas, Verificar y Sustituye a (es el formato de «Exportar CSV»). Sin cabecera: Modelo, Tipo, Referencia, Descripción. Una fila sin modelo es una pieza general. Solo añade o amplía; no borra nada.</p>
    <textarea name="txt" rows="8" spellcheck="false" aria-label="Tabla"></textarea>
    <input type="file" name="file" accept=".csv,.tsv,.txt,text/csv,text/plain" aria-label="Archivo CSV">
    <label class="sw"><input type="checkbox" name="create" checked><span>Crear series y modelos que no existan</span></label>`, {
    wide: true, label: 'Importar',
    mount(f) {
      f.elements.file.addEventListener('change', e => { const x = e.target.files[0]; if (!x) return; x.arrayBuffer().then(b => { f.elements.txt.value = decodeText(b); }); });
    },
    submit(f) {
      const rows = parseTable(f.elements.txt.value);
      if (!rows.length) throw new Error('No hay filas que importar');
      const r = importRows(rows, f.elements.create.checked);
      const out = [`${r.nuevas} nuevas`, `${r.ampliadas} ampliadas`];
      if (r.modelos) out.push(`${r.modelos} modelos creados`);
      if (r.series) out.push(`${r.series} series creadas`);
      if (r.omitidas) out.push(`${r.omitidas} filas omitidas`);
      changed('Importación: ' + out.join(', '));
      if (r.faltan.size) alert('Modelos que no existen (filas omitidas): ' + [...r.faltan].slice(0, 10).join(', '));
    }
  });
}

/* ---------- TIPOS DE PIEZA ---------- */

export function typesForm() {
  let draft = st.D.types.map(t => ({ ...t, orig: t.name, alias: [...t.alias] }));
  const row = (t, i) => `<div class="ty" data-i="${i}">
    <input data-f="name" value="${esc(t.name)}" aria-label="Nombre" placeholder="Tipo">
    <input data-f="system" value="${esc(t.system)}" list="dlSys" aria-label="Sistema" placeholder="Sistema">
    <select data-f="channel" aria-label="Color de tóner">${['', 'K', 'C', 'M', 'Y'].map(c => `<option value="${c}" ${t.channel === c ? 'selected' : ''}>${c || '—'}</option>`).join('')}</select>
    <label class="sw" title="Común de serie"><input type="checkbox" data-f="common" ${t.common ? 'checked' : ''}><span>Común</span></label>
    <input data-f="alias" value="${esc(t.alias.join(', '))}" aria-label="Alias" placeholder="Alias (coma)">
    <span class="tya"><button type="button" class="sm ghost" data-mv="-1" aria-label="Subir">↑</button><button type="button" class="sm ghost" data-mv="1" aria-label="Bajar">↓</button><button type="button" class="sm ghost bad" data-rm aria-label="Eliminar">✕</button></span></div>`;
  const read = f => $$('.ty', f).forEach(el => {
    const t = draft[+el.dataset.i], q = n => $(`[data-f=${n}]`, el);
    t.name = q('name').value.trim(); t.system = q('system').value.trim() || 'Otros'; t.channel = q('channel').value;
    t.common = q('common').checked; t.alias = q('alias').value.split(',').map(x => x.trim()).filter(Boolean);
  });
  const paint = f => { $('.tys', f).innerHTML = draft.map(row).join(''); };
  openDialog('Tipos de pieza', `<p class="mut small">El orden es el de las columnas y secciones. «Sistema» agrupa (PCU, Reveladoras, Fusión…). Color K/C/M/Y: unidades reveladoras. «Común»: va al bloque «Común a toda la serie». Alias: reparte un tipo en varias columnas (PCU K+COL → PCU K, PCU COL).</p>
    <div class="tys"></div><button type="button" class="sm" data-add>+ Tipo</button>
    <datalist id="dlSys">${ix.sys.map(s => `<option value="${esc(s)}">`).join('')}</datalist>`, {
    wide: true,
    mount(f) {
      paint(f);
      f.addEventListener('click', e => {
        const el = e.target.closest('.ty');
        if (e.target.hasAttribute('data-add')) { read(f); draft.push({ name: '', system: 'Otros', channel: '', common: false, alias: [], orig: null }); paint(f); $$('.ty', f).pop().querySelector('input').focus(); return; }
        if (!el) return;
        const i = +el.dataset.i;
        if (e.target.hasAttribute('data-rm')) { read(f); draft.splice(i, 1); paint(f); }
        else if (e.target.dataset.mv) { read(f); const j = i + +e.target.dataset.mv; if (j >= 0 && j < draft.length) { [draft[i], draft[j]] = [draft[j], draft[i]]; paint(f); } }
      });
    },
    submit(f) {
      read(f);
      const names = draft.map(t => t.name);
      if (names.some(n => !n)) throw new Error('Hay tipos sin nombre');
      if (new Set(names.map(nrm)).size !== names.length) throw new Error('Hay nombres de tipo repetidos');
      const ren = {}; draft.forEach(t => { if (t.orig && t.orig !== t.name) ren[t.orig] = t.name; });
      const kept = new Set(draft.map(t => t.orig).filter(Boolean));
      const gone = st.D.types.map(t => t.name).filter(n => !kept.has(n));
      const used = st.D.parts.filter(p => gone.includes(p.type));
      if (used.length && !confirm(`${used.length} piezas usan tipos que vas a eliminar (${[...new Set(used.map(p => p.type))].join(', ')}). Quedarán sin tipo. ¿Continuar?`)) return false;
      used.forEach(p => { p.type = ''; });
      st.D.parts.forEach(p => { if (ren[p.type]) p.type = ren[p.type]; });
      draft.forEach(t => { t.alias = t.alias.map(a => ren[a] || a); });
      st.D.types = draft.map(({ orig, ...t }) => t);
      changed('Tipos guardados');
    }
  });
}

/* ---------- SESIÓN Y PUBLICACIÓN ---------- */

export function loginForm() {
  openDialog('Acceso editor', `
    <p class="mut small">Solo publica quien tenga un token de GitHub con permiso de escritura en el repositorio (ver README).</p>
    ${fld('Repositorio (usuario/repositorio)', `<input name="repo" value="${esc(savedRepo())}" placeholder="usuario/repositorio" autocapitalize="off" spellcheck="false">`)}
    ${fld('Token de acceso personal', '<input name="tok" type="password" autocomplete="off" placeholder="github_pat_…" required>')}
    <label class="sw"><input type="checkbox" name="rem"><span>Recordar en este dispositivo</span></label>`, {
    label: 'Entrar',
    extra: localOK() ? '<button type="button" class="ghost" data-local>Modo local</button>' : '',
    mount(f) { $('[data-local]', f)?.addEventListener('click', async () => { await enterLocal(); close(); refresh(); toast('Modo local: «Publicar» descarga data.json'); }); },
    async submit(f) {
      const r = await login(val(f, 'repo'), val(f, 'tok'), f.elements.rem.checked, false);
      refresh(); toast(r === 'stale' ? 'Borrador recuperado. Hay una versión publicada más reciente: al publicar se avisará del conflicto.' : r === 'draft' ? 'Borrador recuperado' : 'Sesión de editor iniciada');
    }
  });
}

export async function publishForm() {
  const ph = await photoChanges();
  if (st.mode === 'local') {
    st.D.updated = new Date().toISOString(); download('data.json', JSON.stringify(st.D, null, 1), 'application/json');
    if (ph.up.length) { // modo local: las fotos se descargan en un .zip con la carpeta img/
      const JSZip = await loadZip(), z = new JSZip(); ph.up.forEach(x => z.file('img/' + x.name, x.blob));
      download('fotos.zip', await z.generateAsync({ type: 'blob' }), 'application/zip');
    }
    toast('Descargado: súbelo al repositorio' + (ph.up.length ? ' (descomprime fotos.zip en la raíz)' : '')); return;
  }
  const lines = diffLines(JSON.parse(st.pubStr), st.D);
  if (ph.up.length) lines.push(`Fotos: ${ph.up.length} nueva${ph.up.length > 1 ? 's' : ''} (${fmtKB(ph.up.reduce((n, x) => n + x.blob.size, 0))})`);
  if (ph.del.length) lines.push(`Fotos retiradas: ${ph.del.length}`);
  if (!lines.length) { toast('No hay cambios que publicar'); return; }
  const rv = reviewData(), b = blocking(rv);
  openDialog('Publicar cambios', `<ul class="ul">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    ${b ? `<p class="warn">Hay ${b} incidencia(s) bloqueante(s) (referencias duplicadas o tipos inexistentes). Revísalas en «Revisión» antes de publicar.</p>` : ''}
    ${fld('Descripción del cambio', `<input name="msg" value="${esc('Actualización: ' + lines.join('; ').toLowerCase())}">`)}`, {
    label: 'Publicar',
    async submit(f) {
      if (b) { close(); go('#/rev'); return; }
      const r = await publish(val(f, 'msg'));
      if (r === 'conflict') {
        close();
        if (confirm('Alguien ha publicado cambios desde que empezaste a editar; no se ha publicado nada para no sobrescribirlos.\n\n¿Descargar tu versión como copia JSON? Después usa «Descartar cambios» para cargar la versión publicada.')) download('mis-cambios.json', JSON.stringify(st.D, null, 1), 'application/json');
        return;
      }
      refresh(); toast('Publicado. GitHub Pages tarda un momento en actualizar la web.');
    }
  });
}

/* ---------- MENÚ DEL EDITOR ---------- */

export function editMenu(ctx) {
  const hist = historyUrl();
  openDialog('Editar', `
    <div class="grid2">
      <button type="button" class="pri" data-m="part">+ Pieza</button><button type="button" data-m="bulk">+ Varias</button>
      <button type="button" data-m="model">+ Modelo</button><button type="button" data-m="serie">+ Serie</button>
      <button type="button" data-m="tech">+ SC / consulta</button><button type="button" data-m="clean">+ Limpieza</button>
      <button type="button" data-m="photos">Fotos en bloque</button><button type="button" data-m="contact">Correo de avisos</button>
      <button type="button" class="ok" data-m="pub">${st.mode === 'local' ? 'Descargar data.json' : 'Publicar'}</button><button type="button" data-m="undo" ${st.undo.length ? '' : 'disabled'}>Deshacer</button>
      <button type="button" data-m="rev">Revisión</button><button type="button" data-m="table">Importar tabla</button>
      <button type="button" data-m="pdf" class="span2">Procesar catálogo PDF</button>
      <button type="button" data-m="types">Tipos de pieza</button><button type="button" data-m="csv">Exportar CSV</button>
      <button type="button" data-m="json">Exportar JSON</button><button type="button" data-m="ijson">Importar JSON</button>
      <button type="button" data-m="discard" ${st.dirty ? '' : 'disabled'}>Descartar cambios</button><button type="button" class="bad" data-m="out">Cerrar sesión</button>
    </div>
    ${hist ? `<p class="small"><a href="${esc(hist)}" target="_blank" rel="noopener">Historial de publicaciones en GitHub</a></p>` : ''}
    <input type="file" name="ijf" accept="application/json" hidden>`, {
    mount(f) {
      f.addEventListener('click', async e => {
        const a = e.target.closest('[data-m]')?.dataset.m; if (!a) return;
        const pre = ctx.model ? [{ k: 'm', id: ctx.model.id }] : ctx.serie ? [{ k: 's', id: ctx.serie.id }] : [];
        if (a === 'ijson') { f.elements.ijf.click(); return; }
        close();
        if (a === 'part') partForm(null, pre);
        else if (a === 'bulk') bulkForm(pre);
        else if (a === 'model') modelForm(null, ctx.serie?.id || (ctx.model && serieOf(ctx.model.id)?.id));
        else if (a === 'serie') serieForm(null);
        else if (a === 'tech') techForm(null, pre.length ? pre : []);
        else if (a === 'contact') contactForm();
        else if (a === 'clean') cleanForm(null);
        else if (a === 'photos') bulkPhotosForm();
        else if (a === 'pub') publishForm();
        else if (a === 'undo') { if (undo()) { refresh(); toast('Cambio deshecho'); } }
        else if (a === 'rev') go('#/rev');
        else if (a === 'table') tableForm();
        else if (a === 'pdf') go('#/catalogo');
        else if (a === 'types') typesForm();
        else if (a === 'csv') exportCsv(null, 'referencias.csv');
        else if (a === 'json') download('referencias-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(st.D, null, 1), 'application/json');
        else if (a === 'discard') { if (confirm('Se perderán los cambios no publicados. ¿Continuar?')) { try { await discard(); refresh(); toast('Cambios descartados'); } catch (x) { alert(x.message); } } }
        else if (a === 'out') { if (st.dirty && !confirm('Hay cambios sin publicar; el borrador se conserva en este dispositivo. ¿Cerrar sesión?')) return; await logout(); refresh(); toast('Sesión cerrada'); }
      });
      f.elements.ijf.addEventListener('change', async e => {
        const file = e.target.files[0]; if (!file) return;
        try {
          const d = migrate(JSON.parse(await file.text())); if (!d) throw 0;
          if (!confirm(`Se reemplazarán los datos en edición (${d.series.length} series, ${d.models.length} modelos, ${d.parts.length} referencias). Se puede deshacer hasta publicar. ¿Continuar?`)) return;
          st.D = d; close(); changed('Importado'); go('#/');
        } catch { alert('Archivo no válido'); }
      });
    }
  });
}
export { emptyData };

/* ---------- MIS SERIES (cualquier usuario, por dispositivo) ---------- */

export function mineForm() {
  const cur = mine();
  openDialog('Mis series', `<p class="mut small">Marca las series que atiendes. Inicio, vista general y técnico mostrarán primero solo estas; «Todas» sigue disponible. Se guarda en este dispositivo.</p>
    <input type="search" class="pf" placeholder="Filtrar" aria-label="Filtrar"><div class="pick">${[...st.D.series].sort((a, b) => cmp(a.name, b.name)).map(s => `<label data-s="${esc(nrm(s.name + ' ' + s.category))}"><input type="checkbox" name="ms" value="${esc(s.id)}" ${cur.includes(s.id) ? 'checked' : ''}><span>${esc(s.name)} <small>${esc(s.category)}</small></span></label>`).join('')}</div>`, {
    mount: bindPickFilter,
    submit(f) {
      const v = $$('input[name=ms]:checked', f).map(i => i.value);
      lsSet(K.mine, v); UI.all = false; refresh(); toast(v.length ? (v.length === 1 ? "1 serie seleccionada" : `${v.length} series seleccionadas`) : 'Se muestran todas las series');
    }
  });
}

/* ---------- CORREO DE AVISOS (editor) ---------- */

export function contactForm() {
  openDialog('Correo de avisos', `<p class="mut small">Dirección a la que llegan los avisos del botón «Avisar de un error». Se publica en data.json, visible para quien abra la web. Si se deja vacío, el aviso se comparte o se copia para enviarlo por Teams.</p>
    ${fld('Correo', `<input name="mail" type="email" inputmode="email" value="${esc(st.D.config.contacto)}" placeholder="nombre@empresa.com">`)}`, {
    submit(f) {
      const v = val(f, 'mail');
      if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new Error('Correo no válido');
      st.D.config.contacto = v; changed('Guardado');
    }
  });
}

/* ---------- SC Y CONSULTAS TÉCNICAS ---------- */

export function techForm(x, preset, kind) {
  const k = x?.kind || kind || 'sc';
  openDialog(x ? 'Editar entrada técnica' : 'Nueva entrada técnica', `
    <div class="seg" role="radiogroup" aria-label="Tipo"><label class="${k === 'sc' ? 'on' : ''}"><input type="radio" name="kind" value="sc" ${k === 'sc' ? 'checked' : ''} class="vh">Código SC</label><label class="${k === 'guia' ? 'on' : ''}"><input type="radio" name="kind" value="guia" ${k === 'guia' ? 'checked' : ''} class="vh">Consulta</label></div>
    <div class="two">${fld('Código SC', `<input name="code" value="${esc(x?.code || '')}" placeholder="SC542" autocapitalize="characters" spellcheck="false">`, 'codef')}
    ${fld('Título', `<input name="title" required value="${esc(x?.title || '')}" placeholder="Error de temperatura del fusor / Acceso a modo SP">`)}</div>
    ${fld('<span class="lc">Causas posibles</span> (una por línea)', `<textarea name="causes" rows="4">${esc(x?.causes || '')}</textarea>`)}
    ${fld('<span class="ls">Solución</span> (un paso por línea)', `<textarea name="steps" rows="6">${esc(x?.steps || '')}</textarea>`)}
    ${fld('Piezas relacionadas (referencias separadas por coma)', `<input name="refs" value="${esc((x?.refs || []).join(', '))}" autocapitalize="characters" spellcheck="false">`)}
    ${fld('Notas', `<textarea name="note" rows="3">${esc(x?.note || '')}</textarea>`)}
    <div class="fld"><span>Aplica a (sin marcar: todos los equipos)</span>${picker('tt', x ? x.t : (preset || []))}</div>`, {
    wide: true,
    extra: x ? '<button type="button" class="ghost bad" data-del>Borrar</button>' : '',
    mount(f) {
      bindPickFilter(f);
      const sync = () => {
        const sc = f.elements.kind.value === 'sc';
        $$('.seg label', f).forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
        $('.codef', f).hidden = !sc;
        $('.lc', f).textContent = sc ? 'Causas posibles' : 'Cuándo aplica';
        $('.ls', f).textContent = sc ? 'Solución' : 'Pasos';
      };
      f.addEventListener('change', e => { if (e.target.name === 'kind') sync(); });
      sync();
      $('[data-del]', f)?.addEventListener('click', () => {
        if (!confirm('¿Borrar esta entrada?')) return;
        st.D.tech = st.D.tech.filter(y => y.id !== x.id); close(); changed('Entrada borrada'); location.hash = '#/tec/' + x.kind;
      });
    },
    submit(f) {
      const kd = f.elements.kind.value === 'guia' ? 'guia' : 'sc';
      let code = kd === 'sc' ? val(f, 'code').toUpperCase().replace(/\s+/g, '') : '';
      if (kd === 'sc' && code && /^\d/.test(code)) code = 'SC' + code;
      if (kd === 'sc' && !code) throw new Error('Indica el código SC');
      const d = { kind: kd, code, title: val(f, 'title'), causes: f.elements.causes.value.trim(), steps: f.elements.steps.value.trim(), note: f.elements.note.value.trim(),
        refs: [...new Set(val(f, 'refs').split(/[,;\n]+/).map(cleanRef).filter(Boolean))], t: readPick(f, 'tt') };
      let y = x && TECH(x.id);
      if (y) Object.assign(y, d); else { y = { id: uid(), ...d }; st.D.tech.push(y); }
      changed('Entrada guardada'); location.hash = '#/t/' + encodeURIComponent(y.id);
    }
  });
}

const TECH_H = ['Tipo', 'Código', 'Título', 'Serie', 'Modelo', 'Causas', 'Solución', 'Piezas', 'Notas'];
export function exportTechCsv() {
  const rows = st.D.tech.map(x => [x.kind === 'sc' ? 'SC' : 'Consulta', x.code, x.title,
    x.t.filter(t => t.k === 's').map(t => SR(t.id)?.name).filter(Boolean).join(', '),
    x.t.filter(t => t.k === 'm').map(t => M(t.id)?.name).filter(Boolean).join(', '),
    x.causes, x.steps, x.refs.join(', '), x.note]);
  download('tecnico.csv', '﻿' + [TECH_H, ...rows].map(csvLine).join('\n'), 'text/csv');
  toast(rows.length + ' entradas exportadas');
}
export function techTableForm() {
  openDialog('Importar SC y consultas', `<p class="mut small">Pega desde Excel o carga un CSV con cabecera: Tipo (SC o Consulta), Código, Título, Serie, Modelo, Causas, Solución, Piezas, Notas. Varias series o modelos separados por coma; vacío = todos los equipos. En Causas y Solución, cada línea de la celda es un punto (Alt+Intro en Excel). Si el código SC ya existe con los mismos destinos, se actualiza.</p>
    <textarea name="txt" rows="8" spellcheck="false" aria-label="Tabla"></textarea>
    <input type="file" name="file" accept=".csv,.tsv,.txt,text/csv,text/plain" aria-label="Archivo CSV">`, {
    wide: true, label: 'Importar',
    mount(f) { f.elements.file.addEventListener('change', e => { const x = e.target.files[0]; if (!x) return; x.arrayBuffer().then(b => { f.elements.txt.value = decodeText(b); }); }); },
    submit(f) {
      const rows = parseTable(f.elements.txt.value);
      if (rows.length < 2) throw new Error('Hace falta la fila de cabecera y al menos una fila');
      const MAP = { tipo: 'kind', codigo: 'code', titulo: 'title', serie: 'serie', series: 'serie', modelo: 'model', modelos: 'model', causas: 'causes', solucion: 'steps', pasos: 'steps', piezas: 'refs', notas: 'note' };
      const col = {}; rows[0].map(nrm).forEach((h, i) => { if (MAP[h] && col[MAP[h]] === undefined) col[MAP[h]] = i; });
      if (col.title === undefined && col.code === undefined) throw new Error('No se reconoce la cabecera (falta Título o Código)');
      const g = (r, k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim());
      let n = 0, u = 0; const miss = new Set();
      rows.slice(1).forEach(r => {
        const kind = /^consulta|^gu[ií]a|^proc/i.test(g(r, 'kind')) ? 'guia' : (g(r, 'code') || /^sc/i.test(g(r, 'kind')) ? 'sc' : 'guia');
        let code = kind === 'sc' ? g(r, 'code').toUpperCase().replace(/\s+/g, '') : '';
        if (code && /^\d/.test(code)) code = 'SC' + code;
        const title = g(r, 'title') || code; if (!title) return;
        const t = [];
        g(r, 'serie').split(/[,;]/).map(x => x.trim()).filter(Boolean).forEach(nm => { const s = st.D.series.find(x => nrm(x.name) === nrm(nm)); s ? t.push({ k: 's', id: s.id }) : miss.add(nm); });
        g(r, 'model').split(/[,;]/).map(x => x.trim()).filter(Boolean).forEach(nm => { const m = st.D.models.find(x => nrm(x.name) === nrm(nm)); m ? t.push({ k: 'm', id: m.id }) : miss.add(nm); });
        const d = { kind, code, title, causes: g(r, 'causes'), steps: g(r, 'steps'), note: g(r, 'note'), refs: [...new Set(g(r, 'refs').split(/[,;\n]+/).map(cleanRef).filter(Boolean))], t };
        const key = x => x.kind + '|' + (x.code || nrm(x.title)) + '|' + x.t.map(y => y.k + y.id).sort().join(',');
        const ex = st.D.tech.find(x => key(x) === key(d));
        if (ex) { Object.assign(ex, d); u++; } else { st.D.tech.push({ id: uid(), ...d }); n++; }
      });
      changed(`${n} entradas nuevas, ${u} actualizadas`);
      if (miss.size) alert('No existen (se ignoraron como destino): ' + [...miss].slice(0, 10).join(', '));
    }
  });
}

/* ---------- DE UNA HOJA DE EXCEL AL CATÁLOGO (editor) ---------- */

/** sheet: {name, cols:[{key,label}], rows:[{v:{key:valor}}]} del visor de Excel. */
export function sheetToCatalogForm(sheet) {
  const ks = sheet.cols.map(c => c.key);
  const guess = re => ks.find(k => re.test(k)) || '';
  const paren = k => k && sheet.rows.filter(r => /\(([^()]+)\)\s*$/.test(r.v[k] || '')).length > sheet.rows.length / 2;
  const refG = guess(/referencia|^ref|partnumber|edp|codigo|code/) || guess(/^model$/);
  const opts = cur => '<option value="">— ninguna —</option>' + sheet.cols.map(c => `<option value="${esc(c.key)}" ${c.key === cur ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
  openDialog('Añadir al catálogo', `<p class="mut small">Crea en el catálogo las referencias de esta hoja (${sheet.rows.length} filas). Las que ya existen solo se amplían con los modelos indicados; no se borra nada y se puede deshacer hasta publicar.</p>
    <div class="two">${fld('Columna de referencia', `<select name="ref">${opts(refG)}</select>`)}${fld('Columna de descripción', `<select name="desc">${opts(guess(/descrip|nombre|^name/))}</select>`)}</div>
    <label class="sw"><input type="checkbox" name="paren" ${paren(refG) ? 'checked' : ''}><span>La referencia va entre paréntesis al final («DESCRIPCIÓN (REF)»)</span></label>
    <div class="two">${fld('Columna de modelo', `<select name="model">${opts(guess(/^modelo$|^model$/) === refG ? '' : guess(/^modelo$|^model$/))}</select>`)}${fld('Columna de tipo de pieza', `<select name="type">${opts(guess(/^tipodepieza$|^tipopieza$|^parttype$/))}</select>`)}</div>
    ${fld('Tipo para todas (si no hay columna de tipo)', '<input name="ftype" list="dlType" placeholder="Opcional">')}
    <label class="sw"><input type="checkbox" name="origin" checked><span>Sin modelo: asignar al modelo cuyo código coincide con el prefijo (D0DZ… → modelo D0DZ)</span></label>
    <label class="sw"><input type="checkbox" name="gen"><span>Sin modelo ni coincidencia: marcar como generales (si no, quedan en «Sin asignar»)</span></label>
    <label class="sw"><input type="checkbox" name="create"><span>Crear los modelos que no existan</span></label>
    <datalist id="dlType">${st.D.types.map(t => `<option value="${esc(t.name)}">`).join('')}</datalist>`, {
    label: 'Añadir',
    submit(f) {
      const rk = val(f, 'ref'); if (!rk) throw new Error('Elige la columna de referencia');
      const dk = val(f, 'desc'), mk = val(f, 'model'), tk = val(f, 'type'), ft = val(f, 'ftype'), par = f.elements.paren.checked;
      const rows = [['Modelo', 'Tipo', 'Referencia', 'Descripción']];
      sheet.rows.forEach(r => {
        let ref = r.v[rk] || '', desc = dk ? r.v[dk] || '' : '';
        if (par) { const m = ref.match(/^(.*?)\s*\(([^()]+)\)\s*$/); if (m) { ref = m[2]; if (!dk) desc = m[1]; } else if (!/^[A-Za-z0-9-]{5,12}$/.test(ref)) return; }
        rows.push([mk ? r.v[mk] || '' : '', tk ? r.v[tk] || ft : ft, ref, desc]);
      });
      const r = importRows(rows, f.elements.create.checked, { noModel: f.elements.gen.checked ? 'gen' : 'none', origin: f.elements.origin.checked });
      const out = [`${r.nuevas} nuevas`, `${r.ampliadas} ya existían`];
      if (r.origen) out.push(`${r.origen} asignadas por prefijo`);
      if (r.modelos) out.push(`${r.modelos} modelos creados`);
      if (r.omitidas) out.push(`${r.omitidas} omitidas`);
      changed('Catálogo: ' + out.join(', '));
      if (r.faltan.size) alert('Modelos que no existen (filas omitidas): ' + [...r.faltan].slice(0, 10).join(', ') + '. Marca «Crear los modelos que no existan» o créalos antes.');
    }
  });
}

/* ---------- FOTO DE UNA REFERENCIA ---------- */
// Se elige o se hace con la cámara, se pega (Ctrl+V) o se arrastra. Se recorta (automático o a mano),
// se comprime y se nombra con la referencia al guardar. Se sube con «Publicar».

function photoFieldHTML(p) {
  const src = p ? imgSrc(p) : '';
  return `<div class="fld ph-f"><span>Foto (opcional)</span>
    <div class="ph-box" tabindex="0" aria-label="Foto: pulsa para elegir, pega o arrastra una imagen">
      ${src ? `<img class="ph-cur" src="${esc(src)}" alt="Foto actual de ${esc(p.ref)}">` : '<span class="mut small ph-ph">Sin foto. Haz una foto, elígela de la galería, pégala (Ctrl+V) o arrástrala aquí.</span>'}
      <canvas class="ph-cv" hidden></canvas>
    </div>
    <div class="ph-info mut small" aria-live="polite"></div>
    <div class="acts ph-acts"><label class="btn sm"><input type="file" name="photo" accept="image/*" hidden>${src ? 'Cambiar foto' : 'Hacer o elegir foto'}</label>
      <button type="button" class="sm ghost" data-ph="crop" hidden>Recortar a mano</button><button type="button" class="sm ghost" data-ph="full" hidden>Sin recorte</button><button type="button" class="sm ghost" data-ph="auto" hidden>Recorte automático</button>
      ${src ? '<button type="button" class="sm ghost bad" data-ph="del">Quitar foto</button>' : ''}</div></div>`;
}

function photoMount(f, p) {
  const box = $('.ph-box', f), cv = $('.ph-cv', f), info = $('.ph-info', f), S = { file: null, prev: null, crop: null, mode: 'auto', result: null, removed: false, busy: null, drag: null };
  f._photo = S;
  const btn = n => $(`[data-ph="${n}"]`, f);
  const draw = () => {
    if (!S.prev) return;
    const c = S.prev.canvas; cv.width = c.width; cv.height = c.height;
    const x = cv.getContext('2d'); x.drawImage(c, 0, 0);
    const r = S.drag || S.crop;
    if (r) {
      x.fillStyle = 'rgba(0,0,0,.5)';
      const R = { x: r.x * c.width, y: r.y * c.height, w: r.w * c.width, h: r.h * c.height };
      x.fillRect(0, 0, c.width, R.y); x.fillRect(0, R.y + R.h, c.width, c.height - R.y - R.h);
      x.fillRect(0, R.y, R.x, R.h); x.fillRect(R.x + R.w, R.y, c.width - R.x - R.w, R.h);
      x.strokeStyle = '#ffd400'; x.lineWidth = Math.max(2, c.width / 250); x.strokeRect(R.x, R.y, R.w, R.h);
    }
  };
  let tmr;
  const recompress = () => {
    clearTimeout(tmr);
    tmr = setTimeout(async () => {
      if (!S.file) return;
      info.textContent = 'Comprimiendo…';
      const job = compress(S.file, S.crop ? { crop: S.crop } : { trim: false });
      S.busy = job;
      try {
        const r = await job; if (S.busy !== job) return;
        S.result = r;
        info.textContent = `${r.w}×${r.h} px · ${r.ext.toUpperCase()} calidad ${Math.round(r.q * 100)} · ${fmtKB(r.blob.size)} (original ${r.srcW}×${r.srcH}, ${fmtKB(r.srcSize)})`;
      } catch (x) { S.result = null; info.textContent = x.message; }
      finally { if (S.busy === job) S.busy = null; }
    }, 150);
  };
  const setFile = async file => {
    if (!file || !/^image\//.test(file.type || 'image/')) return;
    info.textContent = 'Cargando…';
    try {
      S.file = file; S.removed = false; S.prev = await previewOf(file);
      S.crop = S.prev.trim; S.mode = S.crop ? 'auto' : 'full';
      $('.ph-cur', f)?.remove(); $('.ph-ph', f)?.remove(); cv.hidden = false;
      btn('crop').hidden = false; btn('full').hidden = false; btn('auto').hidden = !S.prev.trim;
      draw(); recompress();
      if (S.prev.trim) info.textContent = 'Se han quitado los márgenes uniformes. Comprimiendo…';
    } catch (x) { S.file = null; info.textContent = x.message; }
  };
  f.elements.photo.addEventListener('change', e => { setFile(e.target.files[0]); e.target.value = ''; });
  f.addEventListener('paste', e => { const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/')); if (it) { e.preventDefault(); setFile(it.getAsFile()); } });
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('over'); });
  box.addEventListener('dragleave', () => box.classList.remove('over'));
  box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('over'); setFile(e.dataTransfer.files[0]); });
  box.addEventListener('click', e => { if (!S.file && e.target !== cv) f.elements.photo.click(); });
  box.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !S.file) { e.preventDefault(); f.elements.photo.click(); } });
  f.addEventListener('click', e => {
    const a = e.target.closest('[data-ph]')?.dataset.ph; if (!a) return;
    if (a === 'del') { S.removed = true; S.file = null; S.result = null; $('.ph-cur', f)?.remove(); cv.hidden = true; info.textContent = 'La foto se quitará al guardar.'; e.target.hidden = true; }
    else if (a === 'full') { S.crop = null; S.mode = 'full'; draw(); recompress(); }
    else if (a === 'auto') { S.crop = S.prev?.trim || null; S.mode = 'auto'; draw(); recompress(); }
    else if (a === 'crop') { S.mode = 'manual'; info.textContent = 'Arrastra sobre la foto para marcar la zona que quieres conservar.'; }
  });
  // recorte manual: arrastrar un rectángulo sobre la vista previa (ratón o dedo)
  const pt = e => { const r = cv.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  let start = null;
  cv.addEventListener('pointerdown', e => { if (!S.file) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); start = pt(e); S.mode = 'manual'; });
  cv.addEventListener('pointermove', e => { if (!start) return; const q = pt(e); S.drag = { x: Math.min(start.x, q.x), y: Math.min(start.y, q.y), w: Math.abs(q.x - start.x), h: Math.abs(q.y - start.y) }; draw(); });
  cv.addEventListener('pointerup', () => {
    if (!start) return; start = null;
    if (S.drag && S.drag.w > 0.03 && S.drag.h > 0.03) { S.crop = S.drag; recompress(); }
    S.drag = null; draw();
  });
}

/** Aplica la foto del formulario a la pieza: la guarda pendiente con el nombre de la referencia. */
async function photoApply(f, part) {
  const S = f._photo; if (!S || !part) return;
  if (S.busy) await S.busy;
  if (S.removed && !S.result) { part.img = ''; return; }
  if (S.file && !S.result) S.result = await compress(S.file, S.crop ? { crop: S.crop } : { trim: false });
  if (S.result) {
    const name = fileName(part.ref, S.result.ext);
    await putPending(name, S.result.blob);
    part.img = name + '?v=' + Date.now().toString(36);
    return;
  }
  // sin foto nueva pero la referencia ha cambiado: la foto se renombra con la nueva referencia
  const cur = imgName(part);
  if (cur) {
    const ext = cur.split('.').pop(), want = fileName(part.ref, ext);
    if (want !== cur) {
      try { const b = await (await fetch(imgSrc(part))).blob(); await putPending(want, b); part.img = want + '?v=' + Date.now().toString(36); }
      catch { /* sin conexión: se mantiene el nombre anterior */ }
    }
  }
}

/* ---------- PRODUCTOS DE LIMPIEZA ---------- */

export function cleanForm(p) {
  openDialog(p ? 'Editar producto de limpieza' : 'Nuevo producto de limpieza', `
    <div class="two">${fld('Referencia', `<input name="ref" required value="${esc(p?.ref || '')}" autocapitalize="characters" autocomplete="off" spellcheck="false">`)}
    ${fld('Nombre', `<input name="name" required value="${esc(p?.name || '')}" placeholder="Limpiador de rodillos…">`)}</div>
    ${fld('Notas', `<input name="note" value="${esc(p?.note || '')}" placeholder="Uso, formato…">`)}
    ${photoFieldHTML(p)}`, {
    extra: p ? '<button type="button" class="ghost bad" data-del>Borrar</button>' : '',
    mount(f) {
      photoMount(f, p);
      $('[data-del]', f)?.addEventListener('click', () => { if (!confirm(`¿Borrar ${p.ref}?`)) return; st.D.parts = st.D.parts.filter(x => x.id !== p.id); close(); changed('Producto borrado'); });
    },
    async submit(f) {
      const ref = cleanRef(val(f, 'ref')), dup = st.D.parts.find(x => nrm(x.ref) === nrm(ref) && x.id !== p?.id);
      if (dup) throw new Error(`La referencia ${dup.ref} ya existe${dup.cl ? ' como producto de limpieza' : ' como pieza'}.`);
      const d = { ref, name: val(f, 'name'), note: val(f, 'note'), cl: true, gen: false, t: [], type: '' };
      let x = p && P(p.id);
      if (x) Object.assign(x, d); else { x = { id: uid(), hab: true, chk: false, old: [], img: '', ...d }; st.D.parts.push(x); }
      await photoApply(f, x);
      changed('Producto guardado');
    }
  });
}

export function cleanBulkForm() {
  openDialog('Añadir varios productos de limpieza', `
    ${fld('Uno por línea: REFERENCIA ; nombre', '<textarea name="txt" rows="8" required spellcheck="false" placeholder="D0BN9100 ; Limpiador de rodillos"></textarea>')}
    <p class="mut small">También se puede pegar desde Excel (dos columnas). Si la referencia ya existe como producto de limpieza, se actualiza el nombre.</p>`, {
    label: 'Añadir',
    submit(f) {
      let n = 0, u = 0, skip = [];
      parseTable(f.elements.txt.value.replace(/;/g, '\t')).forEach(r => {
        const ref = cleanRef(r[0]), name = String(r[1] || '').trim();
        if (!ref || /^referencia$/i.test(ref)) return;
        const ex = st.D.parts.find(x => nrm(x.ref) === nrm(ref));
        if (ex && !ex.cl) { skip.push(ref); return; }
        if (ex) { if (name) ex.name = name; u++; }
        else { st.D.parts.push({ id: uid(), ref, type: '', name, note: '', hab: true, chk: false, gen: false, cl: true, img: '', old: [], t: [] }); n++; }
      });
      changed(`${n} nuevos, ${u} actualizados`);
      if (skip.length) alert('Ya existen como piezas (no se han cambiado): ' + skip.slice(0, 10).join(', '));
    }
  });
}

/* ---------- FOTOS EN BLOQUE ---------- */

export function bulkPhotosForm() {
  openDialog('Fotos en bloque', `<p class="mut small">Elige varias imágenes cuyo nombre sea la referencia (D0E33060.jpg, D0BK-2205.png…). Cada una se comprime (lado mayor ${IMGCFG.max} px, hasta ${Math.round(IMGCFG.target / 1024)} KB), se recortan los márgenes uniformes y se asigna a su referencia. Se suben con «Publicar».</p>
    <input type="file" name="files" accept="image/*" multiple aria-label="Imágenes">
    <div class="bp-res mut small" aria-live="polite"></div>`, {
    label: 'Procesar',
    async submit(f) {
      const files = [...f.elements.files.files];
      if (!files.length) throw new Error('Elige las imágenes');
      const out = $('.bp-res', f), ok = [], miss = [], bad = [];
      let total = 0, orig = 0;
      for (const [i, file] of files.entries()) {
        out.textContent = `Procesando ${i + 1} de ${files.length}: ${file.name}`;
        const base = file.name.replace(/\.[^.]+$/, '');
        const part = st.D.parts.find(x => nrm(x.ref) === nrm(base)) || st.D.parts.find(x => x.old.some(o => nrm(o) === nrm(base)));
        if (!part) { miss.push(file.name); continue; }
        try {
          const r = await compress(file);
          const name = fileName(part.ref, r.ext);
          await putPending(name, r.blob); part.img = name + '?v=' + Date.now().toString(36);
          ok.push(part.ref); total += r.blob.size; orig += file.size;
        } catch (x) { bad.push(file.name + ' (' + x.message + ')'); }
      }
      changed(`${ok.length} fotos asignadas`);
      alert([`${ok.length} fotos asignadas${ok.length ? ` (${fmtKB(orig)} → ${fmtKB(total)})` : ''}.`,
        miss.length ? `Sin referencia en el catálogo: ${miss.slice(0, 12).join(', ')}${miss.length > 12 ? '…' : ''}` : '',
        bad.length ? `No se pudieron leer: ${bad.slice(0, 6).join(', ')}` : ''].filter(Boolean).join('\n\n'));
    }
  });
}
