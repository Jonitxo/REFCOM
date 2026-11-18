// Diálogos del editor: serie, modelo, pieza, alta masiva, importar tabla, tipos, sesión y publicación.

import { $, $$, esc, uid, cmp, nrm, cleanRef, parseTable, csvLine, download, isUrl, toast } from './util.js';
import {
  st, ix, M, SR, P, serieOf, mo, partByRef, originOf, sysOf, sIdx, tIdx, modelsOfSerie, categories,
  ensureType, addT, setSerie, newModel, save, undo, migrate, emptyData
} from './store.js';
import { login, enterLocal, localOK, savedRepo, publish, diffLines, discard, logout, historyUrl } from './github.js';
import { reviewData, blocking } from './views.js';

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
        if (!confirm(`¿Borrar ${m.name}? Las referencias que solo le pertenecían pasarán a «Sin asignar».`)) return;
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
  const targets = p ? p.t : (preset || []);
  openDialog(p ? 'Editar pieza' : 'Nueva pieza', `
    <div class="two">${fld('Referencia', `<input name="ref" required value="${esc(p?.ref || '')}" autocapitalize="characters" autocomplete="off" spellcheck="false">`)}
    ${fld('Tipo', `<input name="type" list="dlType" value="${esc(p?.type || '')}" placeholder="Revelador K, Fusor…">`)}</div>
    <div class="sug" hidden></div>
    ${fld('Descripción', `<input name="name" value="${esc(p?.name || '')}">`)}
    ${fld('Notas', `<input name="note" value="${esc(p?.note || '')}">`)}
    <div class="checks"><label class="sw"><input type="checkbox" name="hab" ${p && !p.hab ? '' : 'checked'}><span>Habitual</span></label>
    <label class="sw"><input type="checkbox" name="chk" ${p?.chk ? 'checked' : ''}><span>Por verificar</span></label>
    <label class="sw"><input type="checkbox" name="gen" ${p?.gen ? 'checked' : ''}><span>General (sin modelo)</span></label></div>
    <div class="fld tg"><span>Aplica a</span>${picker('pt', targets)}</div>
    <datalist id="dlType">${st.D.types.map(t => `<option value="${esc(t.name)}">`).join('')}</datalist>`, {
    extra: p ? '<button type="button" class="ghost bad" data-del>Borrar</button>' : '',
    mount(f) {
      bindPickFilter(f);
      const tg = $('.tg', f), sug = $('.sug', f);
      const gen = () => { tg.hidden = f.elements.gen.checked; };
      f.elements.gen.addEventListener('change', gen); gen();
      const check = () => { // sugerencia por prefijo: D0DZ2205 → modelo con código D0DZ
        const ref = cleanRef(f.elements.ref.value), o = originOf(ref);
        const dup = partByRef(ref);
        let h = '';
        if (dup && dup.id !== p?.id) h += `<p>La referencia ${esc(dup.ref)} ya existe (${esc(dup.type)}). Al guardar se fusionará con ella.</p>`;
        const pend = o.filter(m => !$(`input[name=pt][value="m:${m.id}"]`, f)?.checked);
        if (pend.length) h += `<p>El prefijo ${esc(ref.slice(0, 4))} corresponde a ${pend.map(m => `<b>${esc(m.name)}</b>`).join(', ')}. <button type="button" class="sm" data-orig>Marcar</button></p>`;
        sug.innerHTML = h; sug.hidden = !h;
      };
      f.elements.ref.addEventListener('input', check);
      f.addEventListener('change', e => { if (e.target.name === 'pt') check(); });
      sug.addEventListener('click', e => {
        if (!e.target.hasAttribute('data-orig')) return;
        originOf(cleanRef(f.elements.ref.value)).forEach(m => { const i = $(`input[name=pt][value="m:${m.id}"]`, f); if (i) i.checked = true; });
        check();
      });
      check();
      $('[data-del]', f)?.addEventListener('click', () => {
        if (!confirm(`¿Borrar la referencia ${p.ref}?`)) return;
        st.D.parts = st.D.parts.filter(x => x.id !== p.id); close(); changed('Referencia borrada');
      });
    },
    submit(f) {
      const ref = cleanRef(val(f, 'ref')), type = val(f, 'type'), gen = f.elements.gen.checked;
      const t = gen ? [] : readPick(f, 'pt');
      if (!gen && !t.length && !confirm('No has marcado ningún modelo ni serie: quedará en «Sin asignar». ¿Guardar igualmente?')) return false;
      ensureType(type);
      const d = { ref, type, name: val(f, 'name'), note: val(f, 'note'), hab: f.elements.hab.checked, chk: f.elements.chk.checked, gen, t };
      const dup = st.D.parts.find(x => nrm(x.ref) === nrm(ref) && x.id !== p?.id);
      if (dup) {
        addT(dup, t); dup.name = d.name || dup.name; dup.type = type || dup.type; dup.note = d.note || dup.note;
        if (p) st.D.parts = st.D.parts.filter(x => x.id !== p.id);
      } else if (p) Object.assign(P(p.id), d);
      else st.D.parts.push({ id: uid(), ...d });
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
        else { st.D.parts.push({ id: uid(), ref, type, name, note: '', hab: f.elements.hab.checked, chk: false, gen: false, t: [...t] }); n++; }
      });
      changed(`${n} nuevas, ${m} ampliadas`);
    }
  });
}

/* ---------- IMPORTAR TABLA / EXPORTAR CSV ---------- */

export const FLAT_H = ['Serie', 'Categoría', 'Modelo', 'Códigos', 'Plataforma', 'Franja', 'Despiece', 'Sistema', 'Tipo', 'Referencia', 'Descripción', 'Uso', 'Notas', 'Verificar'];
export function exportCsv(modelIds, name) {
  const only = modelIds ? new Set(modelIds) : null, rows = [];
  st.D.parts.forEach(p => {
    const tail = [sysOf(p.type), p.type, p.ref, p.name, p.hab ? 'Habitual' : 'Poco habitual', p.note, p.chk ? 'Sí' : ''];
    if (p.gen || !mo(p).size) { if (!only) rows.push(['', '', '', '', '', '', '', ...tail]); return; }
    mo(p).forEach(id => {
      if (only && !only.has(id)) return;
      const m = M(id), s = serieOf(id);
      rows.push([s?.name || '', s?.category || '', m.name, m.codes.join(' / '), m.platform, m.franja, m.despiece, ...tail]);
    });
  });
  rows.sort((a, b) => cmp(a[0], b[0]) || cmp(a[2], b[2]) || sIdx(a[8]) - sIdx(b[8]) || tIdx(a[8]) - tIdx(b[8]) || cmp(a[9], b[9]));
  download(name || 'referencias.csv', '﻿' + [FLAT_H, ...rows].map(csvLine).join('\n'), 'text/csv');
  toast(rows.length + ' filas exportadas');
}

function importRows(rows, create) {
  const MAP = { serie: 'serie', categoria: 'cat', familia: 'cat', modelo: 'model', codigo: 'codes', codigos: 'codes', plataforma: 'plat', franja: 'franja', despiece: 'dsp', tipo: 'type', referencia: 'ref', descripcion: 'name', uso: 'uso', notas: 'note', verificar: 'chk' };
  const hdr = rows[0].map(nrm), hasHdr = hdr.includes('referencia');
  let col = {};
  if (hasHdr) { hdr.forEach((h, i) => { const k = MAP[h]; if (k && col[k] === undefined) col[k] = i; }); rows = rows.slice(1); }
  else col = { model: 0, type: 1, ref: 2, name: 3 };
  const g = (r, k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim());
  const res = { nuevas: 0, ampliadas: 0, modelos: 0, series: 0, omitidas: 0, faltan: new Set() };
  rows.forEach(r => {
    const ref = cleanRef(g(r, 'ref')); if (!ref) { res.omitidas++; return; }
    const mname = g(r, 'model'), type = g(r, 'type');
    let targets = [], gen = false;
    if (!mname) gen = true;
    else {
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
    const ex = st.D.parts.find(p => nrm(p.ref) === nrm(ref));
    if (ex) { addT(ex, targets); if (!ex.name && g(r, 'name')) ex.name = g(r, 'name'); if (!ex.type && type) ex.type = type; res.ampliadas++; }
    else { st.D.parts.push({ id: uid(), ref, type, name: g(r, 'name'), note: g(r, 'note'), hab: !/^poco|^ocas/i.test(g(r, 'uso')), chk: /^(s[ií]|x|1|true)$/i.test(g(r, 'chk')), gen, t: targets }); res.nuevas++; }
  });
  return res;
}

export function tableForm() {
  openDialog('Importar tabla (Excel o CSV)', `
    <p class="mut small">Pega filas copiadas de Excel o carga un CSV. Con cabecera se reconocen: Serie, Categoría, Modelo, Códigos, Plataforma, Franja, Despiece, Tipo, Referencia, Descripción, Uso, Notas y Verificar (es el formato de «Exportar CSV»). Sin cabecera: Modelo, Tipo, Referencia, Descripción. Una fila sin modelo es una pieza general. Solo añade o amplía; no borra nada.</p>
    <textarea name="txt" rows="8" spellcheck="false" aria-label="Tabla"></textarea>
    <input type="file" name="file" accept=".csv,.tsv,.txt,text/csv,text/plain" aria-label="Archivo CSV">
    <label class="sw"><input type="checkbox" name="create" checked><span>Crear series y modelos que no existan</span></label>`, {
    wide: true, label: 'Importar',
    mount(f) {
      f.elements.file.addEventListener('change', e => { const x = e.target.files[0]; if (!x) return; const rd = new FileReader(); rd.onload = () => { f.elements.txt.value = rd.result; }; rd.readAsText(x); });
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
    mount(f) { $('[data-local]', f)?.addEventListener('click', () => { enterLocal(); close(); refresh(); toast('Modo local: «Publicar» descarga data.json'); }); },
    async submit(f) {
      const r = await login(val(f, 'repo'), val(f, 'tok'), f.elements.rem.checked, false);
      refresh(); toast(r === 'draft' ? 'Borrador recuperado' : 'Sesión de editor iniciada');
    }
  });
}

export function publishForm() {
  if (st.mode === 'local') { st.D.updated = new Date().toISOString(); download('data.json', JSON.stringify(st.D, null, 1), 'application/json'); toast('data.json descargado: súbelo al repositorio'); return; }
  const lines = diffLines(JSON.parse(st.pubStr), st.D);
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
      <button type="button" class="ok" data-m="pub" ${st.dirty || st.mode === 'local' ? '' : 'disabled'}>${st.mode === 'local' ? 'Descargar data.json' : 'Publicar'}</button><button type="button" data-m="undo" ${st.undo.length ? '' : 'disabled'}>Deshacer</button>
      <button type="button" data-m="rev">Revisión</button><button type="button" data-m="table">Importar tabla</button>
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
        else if (a === 'pub') publishForm();
        else if (a === 'undo') { if (undo()) { refresh(); toast('Cambio deshecho'); } }
        else if (a === 'rev') go('#/rev');
        else if (a === 'table') tableForm();
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
