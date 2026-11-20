// Carga de datos publicados, sesión de editor con token de GitHub y publicación de data.json.

import { st, K, VERSION, migrate, emptyData, resetUndo, persist, readDraft, flushDraft } from './store.js';
import { lsDel } from './util.js';
import { allPending, delPending, imgName } from './img.js';

const API = 'https://api.github.com';

export async function loadPublished() {
  try {
    const r = await fetch('data.json', { cache: 'no-cache' });
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
    const r = await fetch('data.json', { cache: 'no-cache' });
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
  let data = null;
  try { data = migrate(JSON.parse(txt)); } catch { /* inválido */ }
  // Nunca editar sobre datos vacíos si el archivo publicado existe pero no se entiende: publicar lo borraría
  if (!data) throw fail('El data.json publicado no tiene un formato válido. Revísalo en GitHub antes de editar.', true);
  return { sha: j.sha, data };
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
    st.branch = j.default_branch || 'main';
    const rem = await remote();
    const base = rem.data || emptyData();
    st.pubStr = JSON.stringify(base);
    const dr = await readDraft(), drData = dr && dr.repo === st.repo ? migrate(dr.data) : null;
    const keep = drData && (dr.base === st.baseSha || silent ||
      !confirm('Hay un borrador local basado en una versión anterior de los datos publicados.\n\nAceptar: descartarlo y usar la versión publicada.\nCancelar: conservar el borrador (al publicar se detectará el conflicto).'));
    st.D = keep ? drData : base;
    // Con un borrador antiguo, la base es la versión sobre la que se hizo: así «Publicar» detecta el conflicto (409)
    st.baseSha = keep && dr.base !== undefined ? dr.base : rem.sha;
    st.editing = true; st.mode = 'gh'; st.loadErr = false;
    resetUndo(); persist();
    try {
      localStorage.setItem(K.repo, st.repo);
      if (remember === true) { localStorage.setItem(K.tok, st.token); sessionStorage.removeItem(K.tok); }
      else if (remember === false) { sessionStorage.setItem(K.tok, st.token); localStorage.removeItem(K.tok); }
    } catch { /* */ }
    return keep && dr.base !== rem.sha ? 'stale' : keep && !silent ? 'draft' : 'ok';
  } catch (e) { st.token = ''; st.editing = false; throw e; }
}

/** Edición sin GitHub (localhost): publicar descarga data.json. */
export async function enterLocal() {
  st.pubStr = JSON.stringify(st.D);
  const dr = await readDraft(), d = dr && dr.repo === '' ? migrate(dr.data) : null;
  if (d) st.D = d;
  st.editing = true; st.mode = 'local'; st.repo = ''; st.baseSha = null;
  resetUndo(); persist();
}

export async function logout() {
  await flushDraft(); // el borrador se conserva en el dispositivo
  st.editing = false; st.mode = ''; st.token = ''; st.dirty = false; st.undo = []; st.undoSize = 0; st.snap = null; st.idx = null;
  clearToken();
  await loadPublished();
}

/** Resumen de diferencias entre la versión publicada y la actual. */
export function diffLines(a, b) {
  const nm = { parts: 'Referencias', models: 'Modelos', series: 'Series', tech: 'Técnico' }, out = [];
  for (const k of ['parts', 'models', 'series', 'tech']) {
    const A = new Map((a[k] || []).map(x => [x.id, JSON.stringify(x)])), B = new Map(b[k].map(x => [x.id, JSON.stringify(x)]));
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
  if (JSON.stringify(a.config || {}) !== JSON.stringify(b.config || {})) out.push('Correo de avisos modificado');
  if (JSON.stringify(a.templates || []) !== JSON.stringify(b.templates || [])) out.push('Vistas de Excel del equipo modificadas');
  if (JSON.stringify(a.toner || {}) !== JSON.stringify(b.toner || {})) {
    const cnt = t => (t?.delegs || []).reduce((n, d) => n + d.items.length, 0);
    out.push(`Stock de tóner modificado (${(b.toner?.delegs || []).length} delegaciones, ${cnt(b.toner)} filas)`);
  }
  return out;
}

/** Publica data.json. Devuelve 'ok' o 'conflict'; lanza Error con mensaje para otros fallos. */
/** Fotos que hay que subir (pendientes y referenciadas) y borrar (ya no referenciadas por ninguna pieza). */
export async function photoChanges() {
  const now = new Set(st.D.parts.map(imgName).filter(Boolean));
  const before = new Set((JSON.parse(st.pubStr || '{"parts":[]}').parts || []).map(imgName).filter(Boolean));
  let pend = [];
  try { pend = await allPending(); } catch { /* sin IndexedDB */ }
  return { up: pend.filter(x => now.has(x.name)), del: [...before].filter(n => !now.has(n)), orphan: pend.filter(x => !now.has(x.name)).map(x => x.name) };
}

async function blobB64(blob) {
  const b = new Uint8Array(await blob.arrayBuffer()); let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Publicación con fotos: un solo commit con data.json, las fotos nuevas (img/) y el borrado de las retiradas,
 * mediante la API de datos de Git. El conflicto se detecta como en la publicación simple.
 */
async function publishTree(message, up, del) {
  const R = `/repos/${st.repo}`, br = st.branch || 'main';
  const call = async (path, o) => {
    let r;
    try { r = await gh(R + path, o); } catch { throw new Error('No se pudo conectar con GitHub. Los cambios siguen guardados como borrador en este navegador.'); }
    if (r.status === 401 || r.status === 403) throw new Error('GitHub rechazó la publicación (' + r.status + '): el token no es válido o no tiene permiso Contents: Read and write.');
    return r;
  };
  const ref = await call(`/git/ref/heads/${encodeURIComponent(br)}`);
  if (!ref.ok) throw new Error('No se pudo leer la rama ' + br + ' (' + ref.status + ')');
  const head = (await ref.json()).object.sha;
  const cm = await (await call(`/git/commits/${head}`)).json();
  // conflicto: data.json ha cambiado desde que se empezó a editar
  const cur = await call(`/contents/data.json?ref=${encodeURIComponent(br)}`, { cache: 'no-store' });
  const curSha = cur.status === 404 ? null : cur.ok ? (await cur.json()).sha : undefined;
  if (curSha === undefined) throw new Error('No se pudo comprobar data.json (' + cur.status + ')');
  if (curSha !== (st.baseSha || null)) return 'conflict';
  // fotos que existen en el repositorio (para no borrar rutas inexistentes)
  let existing = new Set();
  if (del.length) {
    const l = await call(`/contents/img?ref=${encodeURIComponent(br)}`, { cache: 'no-store' });
    if (l.ok) existing = new Set((await l.json()).map(x => x.name));
  }
  const mk = async (content, encoding) => {
    const r = await call('/git/blobs', { method: 'POST', body: JSON.stringify({ content, encoding }) });
    if (!r.ok) throw new Error('Error al subir un archivo (' + r.status + ')');
    return (await r.json()).sha;
  };
  const tree = [];
  for (const x of up) tree.push({ path: 'img/' + x.name, mode: '100644', type: 'blob', sha: await mk(await blobB64(x.blob), 'base64') });
  del.filter(n => existing.has(n)).forEach(n => tree.push({ path: 'img/' + n, mode: '100644', type: 'blob', sha: null }));
  const dataSha = await mk(b64(JSON.stringify(st.D, null, 1)), 'base64');
  tree.push({ path: 'data.json', mode: '100644', type: 'blob', sha: dataSha });
  const t = await call('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: cm.tree.sha, tree }) });
  if (!t.ok) throw new Error('Error al preparar la publicación (' + t.status + ')');
  const c = await call('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: (await t.json()).sha, parents: [head] }) });
  if (!c.ok) throw new Error('Error al crear la publicación (' + c.status + ')');
  const u = await call(`/git/refs/heads/${encodeURIComponent(br)}`, { method: 'PATCH', body: JSON.stringify({ sha: (await c.json()).sha, force: false }) });
  if (u.status === 422 || u.status === 409) return 'conflict'; // la rama avanzó mientras tanto
  if (!u.ok) throw new Error('Error al publicar (' + u.status + ')');
  return { sha: dataSha };
}

export async function publish(message) {
  st.D.version = VERSION; st.D.updated = new Date().toISOString();
  const ph = await photoChanges();
  if (ph.up.length || ph.del.length) {
    const r = await publishTree(message || 'Actualización de referencias', ph.up, ph.del);
    if (r === 'conflict') return 'conflict';
    st.baseSha = r.sha;
    try { await delPending([...ph.up.map(x => x.name), ...ph.orphan]); } catch { /* */ }
    resetUndo(); st.pubStr = st.snap; persist();
    return 'ok';
  }
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
  if (ph.orphan.length) { try { await delPending(ph.orphan); } catch { /* */ } }
  resetUndo(); st.pubStr = st.snap; persist();
  return 'ok';
}

export async function discard() {
  try { const { clearPending } = await import('./img.js'); await clearPending(); } catch { /* */ }
  if (st.mode === 'gh') { const rem = await remote(); st.D = rem.data || emptyData(); st.baseSha = rem.sha; }
  else await loadPublished();
  st.pubStr = JSON.stringify(st.D); resetUndo(); persist();
}

export const historyUrl = () => {
  const repo = st.repo || savedRepo();
  return /^[\w.-]+\/[\w.-]+$/.test(repo) ? `https://github.com/${repo}/commits/${st.branch || 'main'}/data.json` : '';
};
