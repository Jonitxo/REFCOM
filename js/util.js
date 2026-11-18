// Utilidades sin estado: DOM, texto, formato de referencias, almacenamiento local.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

export const cmp = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });

/** Normaliza para comparar: sin acentos, minúsculas, solo [a-z0-9]. */
export const nrm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

/** «d0e3 3060» y «D0E3-3060» → D0E33060. Otras referencias se respetan en mayúsculas. */
export function cleanRef(r) {
  r = String(r ?? '').trim().replace(/\s+/g, ' ');
  const j = r.replace(/[\s-]/g, '');
  return (/^[A-Za-z0-9]{8}$/.test(j) ? j : r).toUpperCase();
}

/** Prefijo de 4 caracteres de una referencia estándar de 8, o ''. */
export const refPrefix = r => (/^[A-Z0-9]{8}$/.test(String(r)) ? String(r).slice(0, 4) : '');

/** HTML de una referencia: prefijo atenuado y sufijo destacado (patrón 4+4). */
export function fmtRef(r) {
  r = String(r);
  return refPrefix(r)
    ? `<span class="rp">${esc(r.slice(0, 4))}</span><span class="rs">${esc(r.slice(4))}</span>`
    : `<span class="rs">${esc(r)}</span>`;
}

export const lsGet = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch { return def; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
export const lsDel = k => { try { localStorage.removeItem(k); } catch { /* */ } };

const hue = s => { let h = 0; for (const c of String(s).toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const color = s => `hsl(${hue(s)} 55% 42%)`;

/** Colores de franja: evitan los tonos K/C/M/Y reservados a las unidades reveladoras. */
const FR = { alta: '#c2410c', media: '#7c3aed', baja: '#15803d' };
export const franjaColor = f => (f ? FR[nrm(f)] || color(f) : 'transparent');

let toastT;
/** Aviso breve; opcionalmente con un enlace de acción. */
export function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = esc(msg) + (action ? ` <a href="${esc(action.href)}">${esc(action.label)}</a>` : '');
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), action ? 4000 : 2400);
}

export function copyText(t) {
  const fb = () => {
    const a = document.createElement('textarea');
    a.value = t; a.style.position = 'fixed'; a.style.opacity = '0';
    document.body.appendChild(a); a.select();
    try { document.execCommand('copy'); } catch { /* */ }
    a.remove();
  };
  try { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(t).catch(fb); return; } } catch { /* */ }
  fb();
}

export function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Lee CSV/TSV (pegado desde Excel o archivo). Detecta tabulador, punto y coma o coma. */
export function parseTable(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const cnt = c => first.split(c).length - 1;
  const sep = cnt('\t') ? '\t' : (cnt(';') >= cnt(',') ? ';' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

export const csvLine = r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(';');

export const isUrl = s => /^https?:\/\/\S+$/i.test(String(s || '').trim());
