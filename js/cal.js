// Agenda personal del técnico: días marcados (guardia, evento, recordatorio) con nota corta,
// cómputo mensual de horas de guardia, importe según la tarifa que pone cada técnico,
// informe en PDF y exportación al calendario del teléfono (.ics).
// Todo se guarda SOLO en este dispositivo: nunca se publica (repositorio público).

import { $, esc, lsGet, lsSet, toast, download } from './util.js';
import { Doc, fit, wrap } from './pdfw.js';

const KEY = 'refcom_cal_v1';
export const MARKS = { g: 'Guardia', e: 'Evento', r: 'Recordatorio' };
const NOTE_MAX = 50;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WD = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/* ---------- datos ---------- */

function sanitize(v) {
  const out = { v: 1, cfg: { name: '', rate: 0, from: '10:00', to: '16:00' }, days: {} };
  if (!v || typeof v !== 'object') return out;
  const c = v.cfg || {};
  out.cfg.name = String(c.name || '').slice(0, 60);
  out.cfg.rate = Math.max(0, Math.min(1000, +c.rate || 0));
  if (TIME.test(c.from)) out.cfg.from = c.from;
  if (TIME.test(c.to)) out.cfg.to = c.to;
  Object.entries(v.days || {}).forEach(([k, d]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !d || typeof d !== 'object') return;
    const x = {};
    if (d.g) x.g = { f: TIME.test(d.g.f) ? d.g.f : out.cfg.from, t: TIME.test(d.g.t) ? d.g.t : out.cfg.to };
    if (d.e) x.e = 1;
    if (d.r) x.r = 1;
    if (d.n) x.n = String(d.n).slice(0, NOTE_MAX);
    if (x.g || x.e || x.r || x.n) out.days[k] = x;
  });
  return out;
}
let cache = null;
export const calGet = () => (cache ||= sanitize(lsGet(KEY, null)));
function put(v) {
  cache = v;
  if (!lsSet(KEY, v)) toast('No se ha podido guardar la agenda: almacenamiento lleno');
  try { navigator.storage?.persist?.(); } catch { /* */ }
}

/* ---------- festivos nacionales ---------- */
// Fiestas de ámbito nacional (calendario laboral del BOE): 1 y 6 de enero, Viernes Santo, 1 de mayo,
// 15 de agosto, 12 de octubre, 1 de noviembre, 6, 8 y 25 de diciembre. Las comunidades pueden
// sustituir alguna; los festivos autonómicos y locales se marcan a mano como guardia del día.
const FIXED = { '01-01': 'Año Nuevo', '01-06': 'Epifanía del Señor', '05-01': 'Fiesta del Trabajo', '08-15': 'Asunción de la Virgen', '10-12': 'Fiesta Nacional de España', '11-01': 'Todos los Santos', '12-06': 'Día de la Constitución', '12-08': 'Inmaculada Concepción', '12-25': 'Natividad del Señor' };
function easter(y) { // algoritmo anónimo gregoriano
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
const holCache = {};
export function holidays(y) {
  if (holCache[y]) return holCache[y];
  const m = new Map(Object.entries(FIXED).map(([md, n]) => [`${y}-${md}`, n]));
  const gf = easter(y); gf.setDate(gf.getDate() - 2);
  m.set(iso(gf), 'Viernes Santo');
  return (holCache[y] = m);
}
export const holidayOf = k => holidays(+k.slice(0, 4)).get(k) || '';

/** Tipo de día para el informe. */
export function dayKind(k) {
  const h = holidayOf(k), wd = parse(k).getDay();
  if (h) return { k: 'f', label: 'Festivo · ' + h };
  if (wd === 0) return { k: 'd', label: 'Domingo' };
  if (wd === 6) return { k: 's', label: 'Sábado' };
  return { k: 'l', label: 'Laborable' };
}

/* ---------- horas ---------- */

const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
/** Horas de una guardia (si termina antes de empezar, pasa de medianoche). */
export function hoursOf(g) {
  let d = mins(g.t) - mins(g.f);
  if (d <= 0) d += 24 * 60;
  return d / 60;
}
const fmtH = h => (Math.round(h * 100) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 });
const fmtE = v => v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

export function monthSummary(ym) {
  const v = calGet(), list = Object.entries(v.days).filter(([k, d]) => k.startsWith(ym) && d.g).sort((a, b) => a[0].localeCompare(b[0]));
  const by = { s: 0, d: 0, f: 0, l: 0 };
  let hours = 0;
  const rows = list.map(([k, d]) => { const h = hoursOf(d.g), kind = dayKind(k); by[kind.k] += h; hours += h; return { k, d, h, kind }; });
  return { rows, hours, by, rate: v.cfg.rate, amount: Math.round(hours * v.cfg.rate * 100) / 100 };
}

/* ---------- vista ---------- */

export const CS = { quick: false };
const curYM = () => iso(new Date()).slice(0, 7);

export function calView(ym) {
  if (!/^\d{4}-\d{2}$/.test(ym || '')) ym = curYM();
  const v = calGet(), [Y, M] = ym.split('-').map(Number);
  const first = new Date(Y, M - 1, 1), days = new Date(Y, M, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // semana empieza en lunes
  const today = iso(new Date());
  const prev = iso(new Date(Y, M - 2, 1)).slice(0, 7), next = iso(new Date(Y, M, 1)).slice(0, 7);
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span class="cd out" aria-hidden="true"></span>';
  for (let d = 1; d <= days; d++) {
    const k = `${ym}-${pad(d)}`, x = v.days[k] || {}, hol = holidayOf(k), wd = new Date(Y, M - 1, d).getDay();
    const marks = Object.keys(MARKS).filter(m => x[m]);
    const lab = `${d} de ${MONTHS[M - 1]}${hol ? ', ' + hol : ''}${marks.length ? ', ' + marks.map(m => MARKS[m]).join(', ') : ''}${x.n ? ', nota: ' + x.n : ''}`;
    cells += `<button type="button" class="cd${wd === 0 || wd === 6 ? ' we' : ''}${hol ? ' hol' : ''}${k === today ? ' today' : ''}${x.g ? ' g' : ''}" data-cd="${k}" aria-label="${esc(lab)}">
      <span class="cn">${d}</span><span class="cm">${marks.map(m => `<i class="mk ${m}"></i>`).join('')}</span>${x.n ? '<span class="cnote" aria-hidden="true">•</span>' : ''}</button>`;
  }
  const s = monthSummary(ym);
  const listMonth = Object.entries(v.days).filter(([k]) => k.startsWith(ym)).sort((a, b) => a[0].localeCompare(b[0]));
  const hols = [...holidays(Y)].filter(([k]) => k.startsWith(ym));
  let h = `<header class="ph"><h1>Agenda</h1><div class="meta">Personal: se guarda solo en este dispositivo.</div></header>
  <div class="calbar"><a class="btn ghost sm" href="#/agenda/${prev}" aria-label="Mes anterior">‹</a><h2 class="calm">${MONTHS[M - 1]} ${Y}</h2><a class="btn ghost sm" href="#/agenda/${next}" aria-label="Mes siguiente">›</a>${ym !== curYM() ? `<a class="sm ghost btn" href="#/agenda/${curYM()}">Hoy</a>` : ''}</div>
  <div class="seg cmode" role="group" aria-label="Al tocar un día"><button type="button" class="${CS.quick ? '' : 'on'}" data-cq="0" aria-pressed="${!CS.quick}">Tocar: editar día</button><button type="button" class="${CS.quick ? 'on' : ''}" data-cq="1" aria-pressed="${CS.quick}">Tocar: marcar guardia</button></div>
  <div class="cal" role="grid" aria-label="${MONTHS[M - 1]} ${Y}"><div class="cw" aria-hidden="true"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="cg">${cells}</div></div>
  <div class="clegend"><span><i class="mk g"></i>Guardia</span><span><i class="mk e"></i>Evento</span><span><i class="mk r"></i>Recordatorio</span><span><i class="hl"></i>Festivo nacional</span></div>`;
  // resumen de guardias
  h += `<section class="blk csum"><h2 class="h">Guardias de ${MONTHS[M - 1]}</h2>
    <div class="cstats"><div><b>${s.rows.length}</b><span>guardias</span></div><div><b>${fmtH(s.hours)}</b><span>horas</span></div><div><b>${s.rate ? fmtE(s.amount) : '—'}</b><span>${s.rate ? fmtE(s.rate) + '/h' : 'sin tarifa'}</span></div></div>
    ${s.hours ? `<p class="mut small">${[['s', 'sábados'], ['d', 'domingos'], ['f', 'festivos'], ['l', 'laborables']].filter(([k]) => s.by[k]).map(([k, l]) => `${fmtH(s.by[k])} h ${l}`).join(' · ')}</p>` : ''}
    <div class="acts"><button type="button" class="btn pri" data-ca="pdf" ${s.rows.length ? '' : 'disabled'}>Informe PDF</button><button type="button" class="sm ghost" data-ca="cfg">Tarifa y horario</button></div></section>`;
  // lista del mes
  if (listMonth.length || hols.length) {
    const all = new Map(listMonth);
    hols.forEach(([k]) => { if (!all.has(k)) all.set(k, {}); });
    h += `<section class="blk"><h2 class="h">Este mes</h2><div class="clist">${[...all].sort((a, b) => a[0].localeCompare(b[0])).map(([k, x]) => {
      const dt = parse(k), hol = holidayOf(k);
      return `<button type="button" class="cli" data-cd="${k}"><span class="cdate"><b>${dt.getDate()}</b><small>${WD[dt.getDay()].slice(0, 3)}</small></span>
        <span class="cbody">${Object.keys(MARKS).filter(m => x[m]).map(m => `<span class="ctag ${m}">${MARKS[m]}${m === 'g' ? ` ${x.g.f}–${x.g.t} · ${fmtH(hoursOf(x.g))} h` : ''}</span>`).join('')}${hol ? `<span class="ctag f">${esc(hol)}</span>` : ''}${x.n ? `<span class="cnt2">${esc(x.n)}</span>` : ''}</span></button>`;
    }).join('')}</div></section>`;
  }
  h += `<section class="blk"><h2 class="h">Exportar</h2><div class="acts"><button type="button" class="sm ghost" data-ca="icsm">Mes al calendario del teléfono (.ics)</button><button type="button" class="sm ghost" data-ca="icsall">Toda la agenda (.ics)</button><button type="button" class="sm ghost" data-ca="bak">Copia de seguridad</button><button type="button" class="sm ghost" data-ca="res">Restaurar copia</button></div>
    <p class="mut small">El archivo .ics se abre con el calendario del teléfono (Google Calendar, Samsung, Apple) para añadir los días. Es una copia: los cambios posteriores hay que volver a exportarlos. Desde cada día también se puede añadir solo ese día.</p></section>`;
  return h;
}

/* ---------- diálogo de un día ---------- */

async function dayDialog(k, rerender) {
  const { openDialog } = await import('./forms.js');
  const v = calGet(), x = v.days[k] || {}, dt = parse(k), hol = holidayOf(k);
  const g = x.g || { f: v.cfg.from, t: v.cfg.to };
  const f = openDialog(`${WD[dt.getDay()]} ${dt.getDate()} de ${MONTHS[dt.getMonth()]}`, `
    ${hol ? `<p class="banner">${esc(hol)} (festivo nacional)</p>` : ''}
    <div class="cchips">${Object.entries(MARKS).map(([m, l]) => `<label class="cchip ${m}"><input type="checkbox" name="${m}" ${x[m] ? 'checked' : ''}><span><i class="mk ${m}"></i>${l}</span></label>`).join('')}</div>
    <div class="cgh" ${x.g ? '' : 'hidden'}><label class="fld"><span>Inicio</span><input type="time" name="f" value="${g.f}" required></label><label class="fld"><span>Fin</span><input type="time" name="t" value="${g.t}" required></label><p class="mut small chrs"></p></div>
    <label class="fld"><span>Nota <small class="mut cnc"></small></span><input name="n" maxlength="${NOTE_MAX}" value="${esc(x.n || '')}" placeholder="Máx. ${NOTE_MAX} caracteres" autocomplete="off"></label>
    ${Object.keys(x).length ? `<div class="acts"><a class="sm ghost btn" target="_blank" rel="noopener" href="${esc(gcalUrl(k, x))}">Añadir a Google Calendar</a><button type="button" class="sm ghost" data-ics1>Este día (.ics)</button></div>` : ''}`, {
    submit(f) {
      const d = {};
      if (f.elements.g.checked) {
        const ff = f.elements.f.value, tt = f.elements.t.value;
        if (!TIME.test(ff) || !TIME.test(tt)) throw new Error('Hora no válida');
        if (ff === tt) throw new Error('El inicio y el fin de la guardia no pueden coincidir');
        d.g = { f: ff, t: tt };
      }
      if (f.elements.e.checked) d.e = 1;
      if (f.elements.r.checked) d.r = 1;
      const n = f.elements.n.value.trim().slice(0, NOTE_MAX);
      if (n) d.n = n;
      const all = calGet();
      if (Object.keys(d).length) all.days[k] = d; else delete all.days[k];
      put(all); rerender();
    },
    extra: x && Object.keys(x).length ? '<button type="button" class="ghost bad" data-cdel>Borrar día</button>' : '',
    mount(f) {
      const upd = () => {
        f.querySelector('.cgh').hidden = !f.elements.g.checked;
        f.querySelector('.cnc').textContent = `${f.elements.n.value.length}/${NOTE_MAX}`;
        if (f.elements.g.checked && TIME.test(f.elements.f.value) && TIME.test(f.elements.t.value)) {
          const hh = hoursOf({ f: f.elements.f.value, t: f.elements.t.value });
          f.querySelector('.chrs').textContent = `${fmtH(hh)} h${mins(f.elements.t.value) <= mins(f.elements.f.value) ? ' (termina al día siguiente)' : ''}`;
        }
      };
      f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
      f.querySelector('[data-cdel]')?.addEventListener('click', () => { const all = calGet(); delete all.days[k]; put(all); rerender(); import('./forms.js').then(m => m.close()); });
      f.querySelector('[data-ics1]')?.addEventListener('click', () => download(`agenda-${k}.ics`, ics([[k, x]]), 'text/calendar'));
    }
  });
  return f;
}

/* ---------- exportación ---------- */

const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) { // líneas de máx. 75 octetos (RFC 5545)
  const enc = new TextEncoder(); const out = []; let cur = '', n = 0;
  for (const ch of line) { const b = enc.encode(ch).length; if (n + b > 75) { out.push(cur); cur = ' '; n = 1; } cur += ch; n += b; }
  out.push(cur); return out.join('\r\n');
}
const ymd = k => k.replace(/-/g, '');
const nextDay = k => { const d = parse(k); d.setDate(d.getDate() + 1); return iso(d); };
function stamp() { const d = new Date(); return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'); }
function ics(entries) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Referencias//Agenda//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const ds = stamp();
  entries.forEach(([k, x]) => {
    const note = x.n ? ': ' + x.n : '';
    if (x.g) {
      const end = mins(x.g.t) <= mins(x.g.f) ? nextDay(k) : k;
      L.push('BEGIN:VEVENT', `UID:${k}-g@refcom`, `DTSTAMP:${ds}`, `DTSTART:${ymd(k)}T${x.g.f.replace(':', '')}00`, `DTEND:${ymd(end)}T${x.g.t.replace(':', '')}00`, fold('SUMMARY:' + icsEsc('Guardia' + note)), 'CATEGORIES:Guardia', 'END:VEVENT');
    }
    ['e', 'r'].forEach(m => {
      if (!x[m]) return;
      L.push('BEGIN:VEVENT', `UID:${k}-${m}@refcom`, `DTSTAMP:${ds}`, `DTSTART;VALUE=DATE:${ymd(k)}`, `DTEND;VALUE=DATE:${ymd(nextDay(k))}`, fold('SUMMARY:' + icsEsc(MARKS[m] + note)), 'TRANSP:TRANSPARENT');
      if (m === 'r') L.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + icsEsc(MARKS[m] + note)), 'TRIGGER:PT9H', 'END:VALARM');
      L.push('END:VEVENT');
    });
    if (x.n && !x.g && !x.e && !x.r) L.push('BEGIN:VEVENT', `UID:${k}-n@refcom`, `DTSTAMP:${ds}`, `DTSTART;VALUE=DATE:${ymd(k)}`, `DTEND;VALUE=DATE:${ymd(nextDay(k))}`, fold('SUMMARY:' + icsEsc(x.n)), 'TRANSP:TRANSPARENT', 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}
/** Enlace «añadir evento» de Google Calendar (abre la app en Android si está instalada). */
function gcalUrl(k, x) {
  const title = x.g ? 'Guardia' : x.e ? 'Evento' : x.r ? 'Recordatorio' : 'Nota';
  const dates = x.g ? `${ymd(k)}T${x.g.f.replace(':', '')}00/${ymd(mins(x.g.t) <= mins(x.g.f) ? nextDay(k) : k)}T${x.g.t.replace(':', '')}00` : `${ymd(k)}/${ymd(nextDay(k))}`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title + (x.n ? ': ' + x.n : ''), dates, ctz: 'Europe/Madrid' });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

async function shareOrDownload(blob, name, title) {
  try {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
  } catch (x) { if (x && x.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Informe mensual de guardias en PDF. */
export function reportPdf(ym) {
  const v = calGet(), s = monthSummary(ym), [Y, M] = ym.split('-').map(Number);
  const doc = new Doc(), W = doc.w, X = 48, R = W - 48;
  const C = { ink: '#14202b', mut: '#5b6b78', line: '#c9d3dc', head: '#e8eef3', acc: '#00739a' };
  let y = 64;
  doc.text(X, y, 'Informe de guardias', { size: 20, bold: true, color: C.ink });
  doc.text(R, y, `${MONTHS[M - 1].replace(/^./, c => c.toUpperCase())} ${Y}`, { size: 14, bold: true, color: C.acc, align: 'right' });
  y += 22;
  doc.text(X, y, `Técnico: ${v.cfg.name || '—'}`, { size: 11, color: C.ink });
  doc.text(R, y, `Generado el ${new Date().toLocaleDateString('es-ES')}`, { size: 9, color: C.mut, align: 'right' });
  y += 22;
  const cols = [{ t: 'Fecha', x: X, w: 58 }, { t: 'Día', x: X + 58, w: 50 }, { t: 'Tipo', x: X + 108, w: 118 }, { t: 'Horario', x: X + 226, w: 82 }, { t: 'Horas', x: X + 340, w: 30, r: true }, { t: 'Nota', x: X + 352, w: R - X - 352 }];
  const header = () => {
    doc.rect(X - 6, y - 12, R - X + 12, 18, { fill: C.head });
    cols.forEach(c => doc.text(c.r ? c.x : c.x, y, c.t, { size: 9, bold: true, color: C.ink, align: c.r ? 'right' : 'left' }));
    y += 18;
  };
  header();
  s.rows.forEach((r, i) => {
    const dt = parse(r.k), nc = cols[5];
    const note = wrap(r.d.n || '', nc.w - 4, 9);
    const hh = 16 + Math.max(0, note.length - 1) * 11;
    if (y + hh > doc.h - 150) { doc.page(); y = 56; header(); }
    const cells = [dt.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }), WD[dt.getDay()], r.kind.label, `${r.d.g.f}–${r.d.g.t}${mins(r.d.g.t) <= mins(r.d.g.f) ? ' (+1)' : ''}`, fmtH(r.h)];
    if (i % 2) doc.rect(X - 6, y - 11, R - X + 12, hh, { fill: '#f3f6f8' });
    cells.forEach((v, j) => { const c = cols[j]; doc.text(c.x, y, fit(v, c.r ? 40 : c.w - 4, 9), { size: 9, color: C.ink, align: c.r ? 'right' : 'left' }); });
    note.forEach((l, j) => doc.text(nc.x, y + j * 11, l, { size: 9, color: C.ink }));
    y += hh;
  });
  doc.line(X - 6, y - 8, R + 6, y - 8, { color: C.line, width: 0.8 });
  y += 14;
  const by = [['s', 'Sábados'], ['d', 'Domingos'], ['f', 'Festivos nacionales'], ['l', 'Laborables']].filter(([k]) => s.by[k]);
  by.forEach(([k, l]) => { doc.text(X, y, l, { size: 10, color: C.mut }); doc.text(X + 220, y, fmtH(s.by[k]) + ' h', { size: 10, color: C.ink, align: 'right' }); y += 15; });
  y += 6;
  const tot = [['Guardias', String(s.rows.length)], ['Horas totales', fmtH(s.hours) + ' h'], ['Tarifa', s.rate ? fmtE(s.rate) + ' / hora' : 'sin indicar']];
  tot.forEach(([l, val]) => { doc.text(X, y, l, { size: 11, color: C.ink }); doc.text(X + 220, y, val, { size: 11, bold: true, color: C.ink, align: 'right' }); y += 17; });
  y += 4;
  doc.rect(X - 6, y - 14, 232, 24, { fill: C.acc });
  doc.text(X, y + 2, 'Importe total', { size: 12, bold: true, color: '#ffffff' });
  doc.text(X + 220, y + 2, s.rate ? fmtE(s.amount) : '—', { size: 12, bold: true, color: '#ffffff', align: 'right' });
  y += 44;
  doc.text(X, y, 'Firma del técnico', { size: 9, color: C.mut });
  doc.text(X + 260, y, 'Visto bueno', { size: 9, color: C.mut });
  doc.line(X, y + 40, X + 200, y + 40, { color: C.line });
  doc.line(X + 260, y + 40, R, y + 40, { color: C.line });
  return doc.blob({ title: `Guardias ${MONTHS[M - 1]} ${Y}${v.cfg.name ? ' · ' + v.cfg.name : ''}` });
}

async function cfgDialog(rerender) {
  const { openDialog } = await import('./forms.js');
  const v = calGet();
  openDialog('Tarifa y horario de guardia', `
    <label class="fld"><span>Nombre (aparece en el informe)</span><input name="name" maxlength="60" value="${esc(v.cfg.name)}" autocomplete="name"></label>
    <label class="fld"><span>Tarifa de guardia (€ por hora)</span><input name="rate" type="number" inputmode="decimal" min="0" max="1000" step="0.01" value="${v.cfg.rate || ''}" placeholder="0,00"></label>
    <div class="grid2"><label class="fld"><span>Inicio habitual</span><input type="time" name="from" value="${v.cfg.from}"></label><label class="fld"><span>Fin habitual</span><input type="time" name="to" value="${v.cfg.to}"></label></div>
    <p class="mut small">El horario habitual se usa al marcar una guardia nueva. Cada día se puede cambiar. Estos datos se quedan en este dispositivo.</p>`, {
    submit(f) {
      const all = calGet();
      all.cfg.name = f.elements.name.value.trim().slice(0, 60);
      const r = parseFloat(String(f.elements.rate.value).replace(',', '.'));
      all.cfg.rate = isFinite(r) && r >= 0 ? Math.min(1000, Math.round(r * 100) / 100) : 0;
      if (TIME.test(f.elements.from.value)) all.cfg.from = f.elements.from.value;
      if (TIME.test(f.elements.to.value)) all.cfg.to = f.elements.to.value;
      if (all.cfg.from === all.cfg.to) throw new Error('El inicio y el fin no pueden coincidir');
      put(all); rerender();
    }
  });
}

/* ---------- eventos ---------- */

export function bindCal(rerender) {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-cd],[data-ca],[data-cq]');
    if (!el || !el.closest('#main')) return;
    if (el.dataset.cq != null) { CS.quick = el.dataset.cq === '1'; rerender(); return; }
    if (el.dataset.cd) {
      const k = el.dataset.cd;
      if (CS.quick && el.classList.contains('cd')) {
        const all = calGet(), x = all.days[k] || {};
        if (x.g) { delete x.g; toast('Guardia quitada'); } else { x.g = { f: all.cfg.from, t: all.cfg.to }; toast(`Guardia ${all.cfg.from}–${all.cfg.to}`); }
        if (Object.keys(x).length) all.days[k] = x; else delete all.days[k];
        put(all); rerender();
      } else dayDialog(k, rerender);
      return;
    }
    const a = el.dataset.ca, ym = (location.hash.split('/')[2] || '').match(/^\d{4}-\d{2}$/)?.[0] || curYM();
    if (a === 'cfg') cfgDialog(rerender);
    else if (a === 'pdf') {
      const [Y, M] = ym.split('-').map(Number);
      if (!calGet().cfg.rate && !confirm('No has indicado la tarifa por hora: el informe saldrá sin importe. ¿Generarlo igualmente?')) return;
      shareOrDownload(reportPdf(ym), `guardias-${Y}-${pad(M)}.pdf`, `Guardias ${MONTHS[M - 1]} ${Y}`);
    } else if (a === 'icsm' || a === 'icsall') {
      const ents = Object.entries(calGet().days).filter(([k]) => a === 'icsall' || k.startsWith(ym)).sort((x, y) => x[0].localeCompare(y[0]));
      if (!ents.length) { toast('No hay días marcados'); return; }
      download(a === 'icsall' ? 'agenda.ics' : `agenda-${ym}.ics`, ics(ents), 'text/calendar');
    } else if (a === 'bak') download(`agenda-copia-${iso(new Date())}.json`, JSON.stringify(calGet(), null, 1), 'application/json');
    else if (a === 'res') {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        try {
          const v = sanitize(JSON.parse(await f.text()));
          const n = Object.keys(v.days).length;
          if (!confirm(`La copia tiene ${n} días marcados. Se sustituirá la agenda actual de este dispositivo. ¿Continuar?`)) return;
          put(v); rerender(); toast('Agenda restaurada');
        } catch { alert('El archivo no es una copia válida de la agenda'); }
      };
      inp.click();
    }
  });
}

export const _test = { sanitize, ics, easter, hoursOf, monthSummary, put, gcalUrl };
