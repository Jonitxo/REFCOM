// Carga de datos publicados, sesión de editor con token de GitHub y publicación de data.json.

import { st, K, migrate, emptyData, resetUndo, persist, readDraft } from './store.js';
import { lsDel } from './util.js';

const API = 'https://api.github.com';

export async function loadPublished() {
  try {
    const r = await fetch('data.json', { cache: 'no-store' });
    if (!r.ok) throw 0;
    const t = await r.text(), d = migrate(JSON.parse(t));
    if (!d) throw 0;
    st.D = d; st.lastText = t; st.loadErr = false; return true;
  } catch { st.D = emptyData(); st.lastText = ''; st.loadErr = true; return false; }
}

/** Para quien consulta: recarga data.json si ha cambiado. Devuelve true si hay datos nuevos. */
export async function pollData() {
  if (st.editing || document.hidden || !/^https?:/.test(location.protocol)) return false;
  try {
    const r = await fetch('data.json', { cache: 'no-store' });
    if (!r.ok) return false;
    const t = await r.text();
    if (t === st.lastText) return false;
    const d = migrate(JSON.parse(t));
    if (!d) return false;
    st.lastText = t; st.D = d; st.loadErr = false; return true;
  } catch { return false; }
}

export const localOK = () => location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
export function detectRepo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!m) return '';
  const seg = location.pathname.split('/').filter(Boolean)[0];
  return m[1] + '/' + (seg && !/\.html?$/i.test(seg) ? seg : m[1] + '.github.io');
}
export const savedRepo = () => { try { return localStorage.getItem(K.repo) || detectRepo(); } catch { return detectRepo(); } };

const gh = (path, o = {}) => fetch(API + path, {
  ...o, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + st.token, ...(o.headers || {}) }
});
const fail = (msg, fatal) => Object.assign(new Error(msg), { fatal: !!fatal });

function b64(str) {
  const b = new TextEncoder().encode(str); let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(bin);
}
const unb64 = x => new TextDecoder().decode(Uint8Array.from(atob(x.replace(/\s/g, '')), c => c.charCodeAt(0)));

async function remote() {
  const path = `/repos/${st.repo}/contents/data.json`;
  const r = await gh(path, { cache: 'no-store' });
  if (r.status === 404) return { sha: null, data: null };
  if (!r.ok) throw fail('No se pudo leer data.json (' + r.status + ')');
  const j = await r.json();
  let txt;
  if (j.content) txt = unb64(j.content);
  else { // archivos grandes: el contenido no viene en base64
    const r2 = await gh(path, { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
    if (!r2.ok) throw fail('No se pudo leer data.json (' + r2.status + ')');
    txt = await r2.text();
  }
  return { sha: j.sha, data: migrate(JSON.parse(txt)) };
}

export function clearToken() { try { sessionStorage.removeItem(K.tok); } catch { /* */ } lsDel(K.tok); }
export const savedToken = () => { try { return sessionStorage.getItem(K.tok) || localStorage.getItem(K.tok); } catch { return null; } };

/**
 * Inicia sesión de editor. remember: true = localStorage, false = sesión, null = no tocar.
 * silent: arranque automático (no pregunta por borradores antiguos).
 */
export async function login(repo, token, remember, silent) {
  st.repo = String(repo).trim(); st.token = String(token).trim();
  try {
    if (!/^[\w.-]+\/[\w.-]+$/.test(st.repo)) throw fail('Repositorio con formato incorrecto (usuario/repositorio)', true);
    let r;
    try { r = await gh('/repos/' + st.repo); } catch { throw fail('Sin conexión con GitHub'); }
    if (r.status === 401) throw fail('Token no válido o caducado', true);
    if (r.status === 404) throw fail('Repositorio no encontrado o el token no tiene acceso a él', true);
    if (!r.ok) throw fail('Error de GitHub (' + r.status + ')');
    const j = await r.json();
    if (j.permissions && !j.permissions.push) throw fail('El token no tiene permiso de escritura en este repositorio', true);
    const rem = await remote();
    st.baseSha = rem.sha;
    const base = rem.data || emptyData();
    st.pubStr = JSON.stringify(base);
    const dr = readDraft(), drData = dr && dr.repo === st.repo ? migrate(dr.data) : null;
    const keep = drData && (dr.base === st.baseSha || silent ||
      !confirm('Hay un borrador local basado en una versión anterior de los datos publicados.\n\nAceptar: descartarlo y usar la versión publicada.\nCancelar: conservar el borrador (al publicar se detectará el conflicto).'));
    st.D = keep ? drData : base;
    st.editing = true; st.mode = 'gh'; st.loadErr = false;
    resetUndo(); persist();
    try {
      localStorage.setItem(K.repo, st.repo);
      if (remember === true) { localStorage.setItem(K.tok, st.token); sessionStorage.removeItem(K.tok); }
      else if (remember === false) { sessionStorage.setItem(K.tok, st.token); localStorage.removeItem(K.tok); }
    } catch { /* */ }
    return keep && !silent ? 'draft' : 'ok';
  } catch (e) { st.token = ''; st.editing = false; throw e; }
}

/** Edición sin GitHub (localhost): publicar descarga data.json. */
export function enterLocal() {
  st.pubStr = JSON.stringify(st.D);
  const dr = readDraft(), d = dr && dr.repo === '' ? migrate(dr.data) : null;
  if (d) st.D = d;
  st.editing = true; st.mode = 'local'; st.repo = ''; st.baseSha = null;
  resetUndo(); persist();
}

export async function logout() {
  st.editing = false; st.mode = ''; st.token = ''; st.dirty = false; st.undo = []; st.snap = null;
  clearToken();
  await loadPublished();
}

/** Resumen de diferencias entre la versión publicada y la actual. */
export function diffLines(a, b) {
  const nm = { parts: 'Referencias', models: 'Modelos', series: 'Series' }, out = [];
  for (const k of ['parts', 'models', 'series']) {
    const A = new Map(a[k].map(x => [x.id, JSON.stringify(x)])), B = new Map(b[k].map(x => [x.id, JSON.stringify(x)]));
    let add = 0, del = 0, mod = 0;
    B.forEach((v, id) => { if (!A.has(id)) add++; else if (A.get(id) !== v) mod++; });
    A.forEach((v, id) => { if (!B.has(id)) del++; });
    const w = [];
    if (add) w.push(add + (add > 1 ? ' altas' : ' alta'));
    if (mod) w.push(mod + (mod > 1 ? ' cambios' : ' cambio'));
    if (del) w.push(del + (del > 1 ? ' bajas' : ' baja'));
    if (w.length) out.push(nm[k] + ': ' + w.join(', '));
  }
  if (JSON.stringify(a.types) !== JSON.stringify(b.types)) out.push('Tipos de pieza modificados');
  return out;
}

/** Publica data.json. Devuelve 'ok' o 'conflict'; lanza Error con mensaje para otros fallos. */
export async function publish(message) {
  st.D.version = 6; st.D.updated = new Date().toISOString();
  const body = { message: message || 'Actualización de referencias', content: b64(JSON.stringify(st.D, null, 1)) };
  if (st.baseSha) body.sha = st.baseSha;
  let r;
  try { r = await gh(`/repos/${st.repo}/contents/data.json`, { method: 'PUT', body: JSON.stringify(body) }); }
  catch { throw new Error('No se pudo conectar con GitHub. Los cambios siguen guardados como borrador en este navegador.'); }
  if (r.status === 409 || r.status === 422) return 'conflict';
  if (r.status === 401 || r.status === 403) throw new Error('GitHub rechazó la publicación (' + r.status + '): el token no es válido o no tiene permiso Contents: Read and write.');
  if (!r.ok) throw new Error('Error al publicar (' + r.status + ')');
  const j = await r.json();
  st.baseSha = j.content && j.content.sha;
  st.pubStr = JSON.stringify(st.D); st.snap = st.pubStr; st.undo = []; persist();
  return 'ok';
}

export async function discard() {
  if (st.mode === 'gh') { const rem = await remote(); st.D = rem.data || emptyData(); st.baseSha = rem.sha; }
  else await loadPublished();
  st.pubStr = JSON.stringify(st.D); resetUndo(); persist();
}

export const historyUrl = () => {
  const repo = st.repo || savedRepo();
  return /^[\w.-]+\/[\w.-]+$/.test(repo) ? `https://github.com/${repo}/commits/main/data.json` : '';
};
