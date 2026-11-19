// Fotos de referencias: compresión en el navegador, recorte, cola de fotos pendientes (IndexedDB)
// y nombres automáticos a partir de la referencia. Las fotos se suben al publicar (carpeta img/).

/* ---------- parámetros de compresión ---------- */
// Elegidos midiendo tamaño y calidad (SSIM) con fotos y capturas de prueba: ver README.
export const CFG = { max: 640, target: 40 * 1024, qHi: 0.8, qLo: 0.45, minSide: 320, type: '' };

let webpOK = null;
async function canWebp() {
  if (webpOK !== null) return webpOK;
  const c = document.createElement('canvas'); c.width = c.height = 2;
  const b = await new Promise(ok => c.toBlob(ok, 'image/webp', 0.8));
  return (webpOK = !!b && b.type === 'image/webp');
}

/** Decodifica la imagen respetando la orientación EXIF. Lanza un error comprensible si el formato no es compatible. */
async function decode(file) {
  try { if (window.createImageBitmap) return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* sigue con <img> */ }
  const url = URL.createObjectURL(file);
  try {
    const im = new Image(); im.decoding = 'async'; im.src = url;
    await im.decode();
    return im;
  } catch {
    throw new Error(/heic|heif/i.test(file.type + file.name)
      ? 'Este navegador no abre fotos HEIC. Haz la foto desde la propia web («Hacer o elegir foto») o conviértela a JPG.'
      : 'No se reconoce la imagen. Usa JPG, PNG o WebP.');
  } finally { URL.revokeObjectURL(url); }
}
const dims = im => ({ w: im.width || im.naturalWidth, h: im.height || im.naturalHeight });

/** Recuadro sin bordes de color uniforme (márgenes blancos o negros de una captura). Fracciones 0-1. */
function autoTrim(im) {
  const { w, h } = dims(im), s = Math.min(1, 300 / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, cw, ch); x.drawImage(im, 0, 0, cw, ch);
  const d = x.getImageData(0, 0, cw, ch).data, px = (i, j) => { const k = (j * cw + i) * 4; return [d[k], d[k + 1], d[k + 2]]; };
  // tolerancia baja: recorta márgenes de capturas (color exacto), no el fondo con ruido de una foto
  const bg = px(0, 0), tol = 8;
  const same = (i, j) => { const p = px(i, j); return Math.abs(p[0] - bg[0]) <= tol && Math.abs(p[1] - bg[1]) <= tol && Math.abs(p[2] - bg[2]) <= tol; };
  // solo si las cuatro esquinas son del mismo color (es un margen, no parte de la foto)
  if (![[cw - 1, 0], [0, ch - 1], [cw - 1, ch - 1]].every(([i, j]) => same(i, j))) return null;
  const rowEmpty = j => { for (let i = 0; i < cw; i++) if (!same(i, j)) return false; return true; };
  const colEmpty = i => { for (let j = 0; j < ch; j++) if (!same(i, j)) return false; return true; };
  let t = 0, b = ch - 1, l = 0, r = cw - 1;
  while (t < b && rowEmpty(t)) t++;
  while (b > t && rowEmpty(b)) b--;
  while (l < r && colEmpty(l)) l++;
  while (r > l && colEmpty(r)) r--;
  if (r - l < 8 || b - t < 8) return null;
  const pad = 0.02;
  const box = { x: l / cw - pad, y: t / ch - pad, w: (r - l + 1) / cw + 2 * pad, h: (b - t + 1) / ch + 2 * pad };
  box.x = Math.max(0, box.x); box.y = Math.max(0, box.y); box.w = Math.min(1 - box.x, box.w); box.h = Math.min(1 - box.y, box.h);
  return box.w > 0.97 && box.h > 0.97 ? null : box;
}

/** Reducción de alta calidad: mitades sucesivas hasta el tamaño final (evita el dentado del reescalado directo). */
function resize(im, crop, tw, th) {
  const { w, h } = dims(im);
  let sx = crop.x * w, sy = crop.y * h, sw = crop.w * w, sh = crop.h * h;
  let src = im, cw = sw, chh = sh;
  while (cw / 2 >= tw && chh / 2 >= th) {
    const c = document.createElement('canvas'); c.width = Math.round(cw / 2); c.height = Math.round(chh / 2);
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    if (src === im) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
    x.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
    src = c; sx = 0; sy = 0; sw = c.width; sh = c.height; cw = c.width; chh = c.height;
  }
  const out = document.createElement('canvas'); out.width = tw; out.height = th;
  const x = out.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.fillStyle = '#fff'; x.fillRect(0, 0, tw, th); // fondo blanco para PNG con transparencia
  x.drawImage(src, sx, sy, sw, sh, 0, 0, tw, th);
  return out;
}
const toBlob = (c, type, q) => new Promise(ok => c.toBlob(ok, type, q));

/**
 * Comprime una imagen: recorte (manual o automático), lado mayor ≤ CFG.max, WebP (o JPEG si el
 * navegador no genera WebP) con la mayor calidad que cabe en CFG.target. Nunca amplía.
 * Devuelve { blob, ext, type, w, h, q, crop, srcW, srcH, srcSize }.
 */
export async function compress(file, opt = {}) {
  const im = await decode(file), { w, h } = dims(im);
  const crop = opt.crop || (opt.trim !== false && autoTrim(im)) || { x: 0, y: 0, w: 1, h: 1 };
  const cw = crop.w * w, ch = crop.h * h;
  const type = CFG.type || ((await canWebp()) ? 'image/webp' : 'image/jpeg'), ext = type === 'image/webp' ? 'webp' : 'jpg';
  let side = Math.min(CFG.max, Math.max(cw, ch)), best = null;
  for (let round = 0; round < 4; round++) {
    const s = side / Math.max(cw, ch), tw = Math.max(1, Math.round(cw * s)), th = Math.max(1, Math.round(ch * s));
    const c = resize(im, crop, tw, th);
    // búsqueda binaria de la calidad máxima que cabe en el objetivo
    let lo = CFG.qLo, hi = CFG.qHi, pick = null;
    const top = await toBlob(c, type, hi);
    if (top.size <= CFG.target) pick = { blob: top, q: hi };
    else {
      for (let i = 0; i < 6; i++) {
        const q = (lo + hi) / 2, b = await toBlob(c, type, q);
        if (b.size <= CFG.target) { pick = { blob: b, q }; lo = q; } else hi = q;
      }
    }
    if (!pick) { const b = await toBlob(c, type, CFG.qLo); pick = { blob: b, q: CFG.qLo }; }
    best = { ...pick, w: tw, h: th };
    if (pick.blob.size <= CFG.target || side <= CFG.minSide) break;
    side = Math.max(CFG.minSide, Math.round(side * 0.8)); // ni con calidad mínima cabe: se reduce el tamaño
  }
  if (im.close) im.close();
  return { blob: best.blob, ext, type, w: best.w, h: best.h, q: Math.round(best.q * 100) / 100, crop, srcW: w, srcH: h, srcSize: file.size };
}

/** Miniatura para el editor de recorte (lado mayor 900 px). */
export async function previewOf(file) {
  const im = await decode(file), { w, h } = dims(im), s = Math.min(1, 900 / Math.max(w, h));
  const c = resize(im, { x: 0, y: 0, w: 1, h: 1 }, Math.round(w * s), Math.round(h * s));
  const trim = autoTrim(im);
  if (im.close) im.close();
  return { canvas: c, trim };
}

/* ---------- nombre de archivo ---------- */
export const fileName = (ref, ext) => String(ref).toUpperCase().replace(/[^A-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') + '.' + ext;
export const imgName = p => (p && p.img ? p.img.split('?')[0] : '');

/* ---------- fotos pendientes de publicar (IndexedDB) ---------- */
const DB = 'refcom-img', STORE = 'pending';
let dbp;
function db() {
  if (!dbp) dbp = new Promise((ok, ko) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
  return dbp;
}
const tx = async (mode, fn) => { const d = await db(); return new Promise((ok, ko) => { const t = d.transaction(STORE, mode), s = t.objectStore(STORE); const r = fn(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => ko(t.error); }); };

export const pendingURL = new Map(); // nombre → objectURL (para verlas antes de publicar)
export async function loadPending() {
  try {
    const all = await allPending();
    pendingURL.forEach(u => URL.revokeObjectURL(u)); pendingURL.clear();
    all.forEach(({ name, blob }) => pendingURL.set(name, URL.createObjectURL(blob)));
  } catch { /* sin IndexedDB */ }
}
export async function putPending(name, blob) {
  await tx('readwrite', s => s.put(blob, name));
  if (pendingURL.has(name)) URL.revokeObjectURL(pendingURL.get(name));
  pendingURL.set(name, URL.createObjectURL(blob));
}
export async function allPending() {
  const d = await db();
  return new Promise((ok, ko) => {
    const out = [], t = d.transaction(STORE, 'readonly'), c = t.objectStore(STORE).openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out.push({ name: cur.key, blob: cur.value }); cur.continue(); } };
    t.oncomplete = () => ok(out); t.onerror = () => ko(t.error);
  });
}
export async function delPending(names) {
  await tx('readwrite', s => { names.forEach(n => s.delete(n)); });
  names.forEach(n => { if (pendingURL.has(n)) { URL.revokeObjectURL(pendingURL.get(n)); pendingURL.delete(n); } });
}
export async function clearPending() { await tx('readwrite', s => s.clear()); pendingURL.forEach(u => URL.revokeObjectURL(u)); pendingURL.clear(); }

/** URL de la foto de una pieza: la pendiente (si la hay) o la publicada. */
export function imgSrc(p) {
  const n = imgName(p); if (!n) return '';
  return pendingURL.get(n) || 'img/' + p.img;
}
export const fmtKB = b => (b < 1024 ? b + ' B' : (b / 1024).toFixed(b < 10240 ? 1 : 0).replace('.', ',') + ' KB');
