// Valida data.json con la misma lógica de la aplicación. Uso: node tools/validar.mjs
import { readFileSync } from 'node:fs';
import { migrate } from '../js/store.js';
import { nrm } from '../js/util.js';

const raw = JSON.parse(readFileSync(new URL('../data.json', import.meta.url), 'utf8'));
const d = migrate(raw);
if (!d) { console.error('data.json no tiene una estructura válida'); process.exit(1); }
const errores = [];
const refs = new Map();
d.parts.forEach(p => { const k = nrm(p.ref); if (refs.has(k)) errores.push(`Referencia duplicada: ${p.ref}`); refs.set(k, p); });
const tipos = new Set(d.types.map(t => t.name));
d.parts.forEach(p => { if (p.type && !tipos.has(p.type)) errores.push(`Tipo inexistente «${p.type}» en ${p.ref}`); });
console.log(`${d.series.length} series, ${d.models.length} modelos, ${d.parts.length} referencias`);
if (errores.length) { errores.forEach(e => console.error(e)); process.exit(1); }
console.log('data.json válido');
