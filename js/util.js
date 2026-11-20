// Utilidades sin estado: DOM, texto, formato de referencias, almacenamiento local.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

const COLL = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
export const cmp = (a, b) => COLL.compare(String(a), String(b));

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
/** Guarda en localStorage; devuelve false si no hay espacio o está bloqueado. */
export const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
export const lsDel = k => { try { localStorage.removeItem(k); } catch { /* */ } };
/**
 * Pide al navegador almacenamiento persistente (no se borra solo cuando falta espacio) la primera vez que
 * hay algo que solo vive en este dispositivo: borrador, inventario, stock rule. Si el navegador lo deniega,
 * todo sigue funcionando igual. Una vez por sesión.
 */
let persistAsked = false;
export function askPersist() {
  if (persistAsked || typeof navigator === 'undefined' || !navigator.storage?.persist) return;
  persistAsked = true;
  navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {});
}

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
    else if (c === '"' && cur === '') q = true; // solo abre comillas al principio del campo
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

/** Línea CSV con «;». Los valores que empiezan por = + - @ se protegen para que Excel no los ejecute como fórmula. */
export const csvLine = r => r.map(v => { let x = String(v ?? ''); if (/^[=+\-@]/.test(x) && !/^-?\d+([.,]\d+)?$/.test(x)) x = "'" + x; return '"' + x.replace(/"/g, '""') + '"'; }).join(';');
/** Texto de un archivo: UTF-8 y, si no lo es, Windows-1252 (CSV guardado por Excel en español). */
export function decodeText(buf) { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); } }

export const isUrl = s => /^https?:\/\/\S+$/i.test(String(s || '').trim());

/* ---------- utilidades OOXML (stock rule y visor de Excel) ---------- */

export const colNum = c => [...String(c)].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
export function colName(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
/** «AB12» → {L:'AB', r:12}; null si no es una referencia de celda válida. */
export function cellRef(ref) { const m = /^([A-Z]{1,3})(\d{1,7})$/.exec(String(ref || '')); return m ? { L: m[1], r: +m[2] } : null; }
/** Texto de un <si> de sharedStrings: solo <t> directos y de <r>, sin las lecturas fonéticas (<rPh>). */
export function siText(si) {
  let out = '';
  for (const n of si.childNodes) {
    if (n.nodeType !== 1) continue;
    if (n.localName === 't') out += n.textContent;
    else if (n.localName === 'r') for (const t of n.childNodes) if (t.nodeType === 1 && t.localName === 't') out += t.textContent;
  }
  return out;
}
/**
 * Recorre filas y celdas de una hoja asignando la posición aunque falten los atributos r
 * (la especificación permite omitirlos). fn(rowEl, rowNum, cellEl, colLetter).
 */
export function walkCells(rows, kids, fn) {
  let prevR = 0;
  for (const row of rows) {
    const ra = +row.getAttribute('r'); const r = ra > 0 ? ra : prevR + 1; prevR = r;
    let prevC = 0;
    for (const c of kids(row, 'c')) {
      const p = cellRef(c.getAttribute('r'));
      const n = p ? colNum(p.L) : prevC + 1; prevC = n;
      fn(row, r, c, p ? p.L : colName(n));
    }
    if (!kids(row, 'c').length) fn(row, r, null, null);
  }
}
