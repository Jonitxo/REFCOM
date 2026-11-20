// Almacén clave-valor en IndexedDB para datos grandes del dispositivo (borrador del editor).
// localStorage tiene un cupo de unos 5 MiB por origen compartido con todo lo demás; IndexedDB, una fracción del disco.
// Base propia: no toca la de las fotos pendientes (img.js).

const DB = 'refcom-kv', STORE = 'kv';
let dbp = null;

function db() {
  if (!dbp) dbp = new Promise((ok, ko) => {
    if (typeof indexedDB === 'undefined') { ko(new Error('Sin IndexedDB')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
    r.onblocked = () => ko(new Error('IndexedDB bloqueada'));
  });
  dbp.catch(() => { dbp = null; }); // reintentar en la siguiente llamada
  return dbp;
}

const run = async (mode, fn) => {
  const d = await db();
  return new Promise((ok, ko) => {
    const t = d.transaction(STORE, mode), r = fn(t.objectStore(STORE));
    t.oncomplete = () => ok(r && r.result);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error || new Error('Transacción cancelada'));
  });
};

export const idbGet = k => run('readonly', s => s.get(k));
export const idbSet = (k, v) => run('readwrite', s => s.put(v, k));
export const idbDel = k => run('readwrite', s => s.delete(k));
