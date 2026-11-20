// Lector de catálogos de piezas Ricoh en PDF (formato «Parts Catalog» con índices).
// Funciones puras sobre el texto posicionado de cada página: se usan igual en el navegador
// (con PDF.js, ver loadCatalog) y en Node para las pruebas.
//
// Fuentes que se leen del PDF:
//   · Tabla de modelos (Model / Product Code / PC Style)
//   · Unidades (páginas «Unit All») y títulos de subgrupos de las láminas (U003_S001.(17/27/29):ADF:…)
//   · Índice «Exclusive Parts»: Number / Part Name / Group / ID  → todas las piezas
//   · «PM Part List»: piezas de mantenimiento periódico           → preselección y «habitual»
//   · «Design Change List»: pieza antigua → nueva                   → sustituciones
//   · Láminas: página en la que aparece cada referencia            → «ver en el catálogo»
// Se ignoran la tornillería normalizada («Standard Parts»).

export const REF = /^[A-Z0-9]{8}$/;

/* ---------- utilidades de maquetación ---------- */

const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const has = (items, re) => items.some(i => re.test(i.s));

/** Agrupa elementos en líneas por su coordenada vertical. */
export function lines(items, tol = 2.5) {
  const out = [];
  [...items].sort((a, b) => a.y - b.y || a.x - b.x).forEach(i => {
    const l = out.find(L => Math.abs(L.y - i.y) <= tol);
    if (l) l.items.push(i); else out.push({ y: i.y, items: [i] });
  });
  out.forEach(l => { l.items.sort((a, b) => a.x - b.x); l.text = l.items.map(i => i.s).join(' '); });
  return out;
}

/**
 * Une los renglones de un texto partido por ancho de columna. El catálogo corta a mitad de palabra
 * («STRIPPER PLA» + «TE:FRONT» = PLATE) pero a veces justo en un espacio («SERVICE» + «PARTS»).
 * Se decide con el vocabulario del propio catálogo: si la palabra unida existe, se une; si no existe
 * y las dos mitades sí, se separa con un espacio.
 */
let VOCAB = new Map();
const WORD = /[^\s:\/(),.\-]+/g;
function buildVocab(pages) {
  VOCAB = new Map();
  pages.forEach(pg => pg.items.forEach(i => (String(i.s).toUpperCase().match(WORD) || []).forEach(w => VOCAB.set(w, (VOCAB.get(w) || 0) + 1))));
}
function joinWrapped(parts) {
  let s = '';
  parts.forEach((p, i) => {
    if (!i) { s = p.s; return; }
    const a = (s.toUpperCase().match(/[^\s:\/(),.\-]+$/) || [''])[0], b = (p.s.toUpperCase().match(/^[^\s:\/(),.\-]+/) || [''])[0];
    let space = false;
    if (a && b && !/[\s:\/(,\-]$/.test(s) && !/^[\s:\/),\-]/.test(p.s)) {
      const joined = VOCAB.get(a + b) || 0, wa = VOCAB.get(a) || 0, wb = VOCAB.get(b) || 0;
      // la unión aparece entera en otro sitio: es una palabra partida
      if (joined > 0) space = false;
      // las dos mitades son palabras habituales (aparecen más veces que como fragmento): había un espacio
      else if (wa >= 3 && wb >= 3 && a.length >= 2 && b.length >= 2) space = true;
    }
    s += (space ? ' ' : '') + p.s;
  });
  return norm(s);
}

/**
 * Tabla genérica: cols = [{key, x}] por orden; anchor = clave de la columna que abre cada fila.
 * Devuelve filas {key: [{s,x,y,w}]} con los elementos de cada columna dentro de la banda de la fila.
 */
function table(items, cols, anchor, anchorRe, xMin, xMax, yMin) {
  const inT = items.filter(i => i.x >= xMin - 3 && i.x < xMax - 1 && i.y > yMin + 2);
  const colOf = x => { let k = cols[0]; cols.forEach(c => { if (x >= c.x - 3) k = c; }); return k; };
  // separa elementos que se han fusionado con la columna siguiente («U014_S001_S001 14»)
  const split = [];
  inT.forEach(i => {
    const c = colOf(i.x), idx = cols.indexOf(c), next = cols[idx + 1];
    if (next && i.x + i.w > next.x + 2) {
      // en la primera columna sobra el primer token («GW010009 DENSITY SENSOR…»); en las demás, el último
      const m = idx === 0 ? /^(\S+)\s+(.*\S)$/.exec(i.s) : /^(.*\S)\s+(\S+)$/.exec(i.s);
      if (m) {
        const cw = i.w / i.s.length;
        split.push({ ...i, s: m[1], w: cw * m[1].length, c: c.key });
        split.push({ ...i, s: m[2], x: next.x, w: cw * m[2].length, c: next.key });
        return;
      }
    }
    split.push({ ...i, c: c.key });
  });
  const anchors = split.filter(i => i.c === anchor && anchorRe.test(i.s)).sort((a, b) => a.y - b.y);
  return anchors.map((a, n) => {
    const y0 = a.y - 1.5, y1 = n + 1 < anchors.length ? anchors[n + 1].y - 1.5 : 1e9;
    const row = {};
    cols.forEach(c => { row[c.key] = split.filter(i => i.c === c.key && i.y >= y0 && i.y < y1).sort((p, q) => p.y - q.y || p.x - q.x); });
    return row;
  });
}

/** Columnas de una tabla a partir de su cabecera. Devuelve una lista de tablas (puede haber 2 por página). */
function headers(items, names, first) {
  const starts = items.filter(i => i.s === first).sort((a, b) => a.x - b.x);
  return starts.map((st, k) => {
    const xMax = k + 1 < starts.length ? starts[k + 1].x : 1e9;
    const cols = names.map(n => {
      const h = items.find(i => i.s === n.label && Math.abs(i.y - st.y) < 3 && i.x >= st.x - 1 && i.x < xMax);
      return h ? { key: n.key, x: h.x } : null;
    });
    return cols.every(Boolean) ? { cols, xMin: st.x, xMax, y: st.y } : null;
  }).filter(Boolean);
}

/* ---------- aplicabilidad: destinos y códigos de producto ---------- */

/**
 * «(27/29):FUSING UNIT…»  → { dest:['27','29'] }
 * «(D0C9-19,29):…»        → { codes:{D0C9:['19','29']} }
 * «(D0C9-17,27/D0CA-27,29):…» → { codes:{D0C9:['17','27'], D0CA:['27','29']} }
 */
export function applicability(name) {
  const m = /^\(([^)]*)\)\s*:?\s*/.exec(name || '');
  if (!m) return { name: norm(name), dest: null, codes: null };
  const body = m[1], rest = norm(name.slice(m[0].length));
  if (/^\d{2}(\/\d{2})*$/.test(body)) return { name: rest, dest: body.split('/'), codes: null };
  if (/^[A-Z0-9]{4}-\d{2}/.test(body)) {
    const codes = {};
    body.split('/').forEach(seg => { const [c, d] = seg.split('-'); if (c && d) codes[c] = d.split(',').map(x => x.trim()); });
    return { name: rest, dest: [...new Set(Object.values(codes).flat())], codes };
  }
  return { name: norm(name), dest: null, codes: null }; // paréntesis que no es de aplicabilidad
}

/* ---------- lectura del catálogo ---------- */

/**
 * pages: [{ n, items:[{s,x,y,w,h}] }] con coordenadas de la página tal y como se ve (y hacia abajo).
 */
export function parseCatalog(pages) {
  buildVocab(pages);
  const res = { title: '', version: '', models: [], units: {}, groups: {}, parts: new Map(), changes: [], pm: new Map(), refPages: new Map(), labels: new Map(), pageOfGroup: {}, warnings: [], pages: pages.length };
  const part = ref => {
    if (!res.parts.has(ref)) res.parts.set(ref, { ref, raw: '', name: '', groups: [], dest: null, codes: null });
    return res.parts.get(ref);
  };
  for (const pg of pages) {
    const it = pg.items.filter(i => norm(i.s) && !/^(In Confidence|Copyright \(c\)|\d{4}\/\d{2}\/\d{2} Version)/.test(i.s.trim())).map(i => ({ ...i, s: norm(i.s) }));
    const ver = pg.items.find(i => /Version\s+[\d.]+/.test(i.s));
    if (ver && !res.version) res.version = (/(\d{4}\/\d{2}\/\d{2})\s+Version\s+([\d.]+)/.exec(ver.s) || []).slice(1).join(' · v');
    if (pg.n === 1 && !res.title) res.title = it.filter(i => !/Parts Catalog/i.test(i.s)).map(i => i.s).join(' ');
    // quita la barra de navegación inferior (U001 U002 …)
    const navY = (() => { const u = it.filter(i => /^U\d{3}$/.test(i.s)); const byY = {}; u.forEach(i => { const k = Math.round(i.y); byY[k] = (byY[k] || 0) + 1; }); const y = Object.keys(byY).find(k => byY[k] >= 6); return y == null ? null : +y; })();
    const items = navY == null ? it : it.filter(i => !(Math.abs(i.y - navY) < 3 && /^U\d{3}$/.test(i.s)));

    // 1) tabla de modelos: «IM C300   D0CA   3D»
    if (has(items, /Product Code/) && has(items, /^Model$/)) {
      const hm = items.find(i => i.s === 'Model');
      lines(items.filter(i => i.y > hm.y + 2)).forEach(l => {
        const mm = /^(.*?)\s+([A-Z0-9]{4}(?:\/[A-Z0-9]{4})*)\s+(3D|Traditional)$/.exec(norm(l.text));
        if (mm) res.models.push({ name: mm[1], code: mm[2], style: mm[3], main: /^(IM|MP|SP|P|M|Pro)\s/i.test(mm[1]) });
      });
      continue;
    }
    // 2) unidades
    if (has(items, /^Unit All$/)) {
      items.filter(i => /^U\d{3}$/.test(i.s)).forEach(u => {
        const below = items.filter(i => i !== u && Math.abs(i.x - u.x) < 6 && i.y > u.y + 2 && i.y < u.y + 40 && !/^U\d{3}$/.test(i.s)).sort((a, b) => a.y - b.y);
        if (below.length) res.units[u.s] = norm(below.map(i => i.s).join(' ').replace(/\s+\)/g, ')'));
      });
      continue;
    }
    // 3) índice de piezas
    if (has(items, /^Exclusive Parts$/)) {
      headers(items, [{ key: 'ref', label: 'Number' }, { key: 'name', label: 'Part Name' }, { key: 'group', label: 'Group' }, { key: 'id', label: 'ID' }], 'Number').forEach(t => {
        const nameRight = t.cols[2].x - 2;
        table(items, t.cols, 'ref', REF, t.xMin, t.xMax, t.y).forEach(r => {
          const ref = r.ref[0].s, p = part(ref);
          const raw = joinWrapped(r.name);
          if (!p.raw) Object.assign(p, { raw, ...applicability(raw) });
          // grupos e IDs van en pares por renglón
          const ids = r.id.map(i => i.s);
          r.group.forEach((g, k) => {
            const id = r.id.find(i => Math.abs(i.y - g.y) < 3)?.s ?? ids[k] ?? '';
            if (!p.groups.some(x => x.g === g.s && x.id === id)) p.groups.push({ g: g.s, id });
          });
        });
      });
      continue;
    }
    // 4) piezas de mantenimiento periódico
    if (has(items, /^PM Part List$/)) {
      headers(items, [{ key: 'ref', label: 'Number' }, { key: 'name', label: 'Part Name' }, { key: 'qty', label: 'Num' }, { key: 'group', label: 'Group' }, { key: 'id', label: 'ID' }], 'Number').forEach(t => {
        table(items, t.cols, 'ref', REF, t.xMin, t.xMax, t.y).forEach(r => {
          res.pm.set(r.ref[0].s, { qty: +(r.qty[0]?.s || 1) || 1, name: joinWrapped(r.name) });
        });
      });
      continue;
    }
    // 5) cambios de diseño: pieza antigua → nueva
    if (has(items, /^Design Change List$/)) {
      const pn = items.filter(i => i.s === 'P/N').sort((a, b) => a.x - b.x);
      const num = items.find(i => i.s === 'Number');
      if (pn.length >= 2 && num) {
        const cols = [{ key: 'num', x: num.x }, { key: 'old', x: pn[0].x }, { key: 'oldName', x: pn[0].x + 50 }, { key: 'new', x: pn[1].x }, { key: 'newName', x: pn[1].x + 50 }];
        const nameCols = items.filter(i => i.s === 'Name').sort((a, b) => a.x - b.x);
        if (nameCols.length >= 2) { cols[2].x = nameCols[0].x; cols[4].x = nameCols[1].x; }
        const grp = items.find(i => i.s === 'Group');
        table(items, cols, 'num', /^\d{6}-\d{2}$/, num.x, grp ? grp.x : 1e9, pn[0].y).forEach(r => {
          const olds = r.old.map(i => i.s).filter(s => REF.test(s)), news = r.new.map(i => i.s).filter(s => REF.test(s));
          if (olds.length || news.length) res.changes.push({ id: r.num[0].s, old: olds, new: news, oldName: joinWrapped(r.oldName), newName: joinWrapped(r.newName) });
        });
      }
      continue;
    }
    if (has(items, /^Standard Parts$/)) continue;
    // 6) láminas: títulos de grupo y referencias que aparecen
    const titleRe = /^(U\d{3}(?:_S\d{3})*)\.(.+)$/;
    items.forEach(i => {
      const m = titleRe.exec(i.s);
      if (m && i.h > 12) {
        const ap = applicability(m[2]);
        res.groups[m[1]] = { name: ap.name, dest: ap.dest, codes: ap.codes };
        (res.pageOfGroup[m[1]] ||= []).push(pg.n);
      }
    });
    // láminas «tradicionales»: cabecera «U001» + nombre en la esquina superior
    const head = items.filter(i => /^U\d{3}(_S\d{3})*$/.test(i.s) && i.y < 40 && i.x < 120).sort((a, b) => a.y - b.y)[0];
    if (head) (res.pageOfGroup[head.s] ||= []).includes(pg.n) || res.pageOfGroup[head.s].push(pg.n);
    items.forEach(i => {
      const r = /^(?:\d+\.)?([A-Z0-9]{8})$/.exec(i.s);
      if (r && i.h < 12) {
        const L = res.refPages.get(r[1]) || []; if (!L.includes(pg.n)) L.push(pg.n);
        res.refPages.set(r[1], L);
        // texto de la etiqueta de la lámina (debajo de la referencia): sirve para completar nombres cortados en el índice
        if (!res.labels.has(r[1])) {
          const below = items.filter(j => j !== i && Math.abs(j.x - i.x) < 12 && j.y > i.y + 2 && j.y < i.y + 40 && j.h <= i.h + 0.5
            && !/^(?:\d+\.)?[A-Z0-9]{8,10}$|^\(x\d+\)$|^\[[A-Z]+\]$|^U\d{3}(_S\d{3})*$/.test(j.s)).sort((a, b) => a.y - b.y);
          const lab = []; let last = i.y;
          for (const j of below) { if (j.y - last > 10) break; lab.push(j); last = j.y; }
          if (lab.length) res.labels.set(r[1], joinWrapped(lab));
        }
      }
    });
  }
  // nombres de grupo de las unidades
  Object.entries(res.units).forEach(([u, n]) => { if (!res.groups[u]) res.groups[u] = { name: n, dest: null, codes: null }; });
  // nombres cortados en el índice (fin de página): se completan con la etiqueta de la lámina
  const ns = x => String(x || '').replace(/\s+/g, '');
  res.parts.forEach(p => {
    const lab = res.labels.get(p.ref);
    if (lab && p.raw && ns(lab).length > ns(p.raw).length && ns(lab).startsWith(ns(p.raw))) { Object.assign(p, { raw: lab, ...applicability(lab) }); p.fixed = true; }
  });
  // las piezas del índice de mantenimiento que no estén en el índice general se añaden
  res.pm.forEach((v, ref) => { const p = part(ref); if (!p.raw) Object.assign(p, { raw: v.name, ...applicability(v.name) }); });
  if (!res.parts.size) res.warnings.push('No se ha encontrado el índice «Exclusive Parts». ¿Es un catálogo de piezas de Ricoh con texto seleccionable?');
  return res;
}

/* ---------- interpretación para el proyecto ---------- */

/** Destinos y códigos efectivos de una pieza: los suyos y los heredados de los grupos donde aparece. */
export function effective(cat, p) {
  const groupAp = g => {
    const segs = g.split('_'); const out = { dest: null, codes: null };
    for (let i = segs.length; i > 0; i--) { const k = segs.slice(0, i).join('_'), gr = cat.groups[k]; if (gr && (gr.dest || gr.codes)) { out.dest = gr.dest; out.codes = gr.codes; break; } }
    return out;
  };
  const gs = p.groups.map(x => groupAp(x.g));
  // la pieza aplica donde aplique cualquiera de sus grupos; un grupo sin restricción = todos
  const gDest = gs.length && gs.every(x => x.dest) ? [...new Set(gs.flatMap(x => x.dest))] : null;
  const dest = p.dest && gDest ? p.dest.filter(d => gDest.includes(d)) : (p.dest || gDest);
  const codes = p.codes || (gs.length && gs.every(x => x.codes) ? Object.assign({}, ...gs.map(x => x.codes)) : null);
  return { dest: dest && dest.length ? dest : p.dest || gDest, codes };
}

/** Tipo de pieza del proyecto a partir del nombre del catálogo. '' si no se reconoce. */
const COLOR = { BK: 'K', K: 'K', C: 'C', M: 'M', Y: 'Y' };
// palabras de cabecera genéricas: el tipo lo da el segundo segmento («ROLLER:CHARGE», «UNIT:…»)
const GENERIC = /^(ROLLER|BELT|BLADE|UNIT|PAD|BOTTLE|ASS'Y)$/;
/**
 * Tipo de pieza del proyecto a partir del nombre del catálogo. '' si no se reconoce.
 * Solo se mira la cabecera del nombre (los nombres Ricoh van de lo general a lo particular:
 * «GEAR:CHARGE ROLLER» es un engranaje, no un rodillo de carga).
 */
export function guessType(name) {
  const full = ' ' + String(name || '').toUpperCase() + ' ';
  const seg = full.trim().split(':').map(x => x.trim());
  const head = ' ' + (GENERIC.test(seg[0]) || /\bUNIT$/.test(seg[0]) ? seg.slice(0, 2).join(':') : seg[0]) + ' ';
  const col = re => { const m = re.exec(full); return m ? COLOR[m[1]] : ''; };
  const t = re => re.test(head);
  let c;
  if (t(/^ PCDU\b/)) return (c = col(/PCDU:(BK|K|C|M|Y)\b/)) ? 'PCDU ' + c : 'PCDU';
  if (t(/^ (DEVELOPMENT|DEVELOPING) UNIT\b/)) return (c = col(/UNIT:(BK|K|C|M|Y)\b/)) ? 'Revelador ' + c : 'Revelador';
  if (t(/^ DEVELOPER\b/)) return (c = col(/DEVELOPER:?(BK|K|C|M|Y)\b/)) ? 'Revelador ' + c : 'Revelador';
  if (t(/^ (PCU|PHOTOCONDUCTOR UNIT)\b/)) return (c = col(/(?:PCU|UNIT):(BK|K|C|M|Y)\b/)) ? 'PCU ' + (c === 'K' ? 'K' : 'COL') : 'PCU';
  if (t(/^ FUSING UNIT\b/)) return 'Fusor';
  if (t(/^ (PRESSURE ROLLER|ROLLER:PRESSURE)\b/)) return 'Rodillo presión';
  if (t(/^ (FUSING BELT|BELT:FUSING|HEATING ROLLER|HOT ROLLER|ROLLER:HEATING)\b/)) return 'Fusor';
  if (t(/^ (CLEANING UNIT:(BELT|INTERMEDIATE)|BELT CLEANING UNIT|ITB CLEANING)/)) return 'Limpieza ITB';
  if (t(/^ (TRANSFER BELT|BELT:(INTERMEDIATE )?TRANSFER|INTERMEDIATE TRANSFER BELT)\b/)) return 'Banda transferencia';
  if (t(/^ (TRANSFER UNIT:INTERMEDIATE|INTERMEDIATE TRANSFER UNIT|ITB UNIT)\b/)) return 'ITB unit';
  if (t(/^ (TRANSFER\/SEPARATION UNIT|TRANSFER ROLLER|ROLLER:TRANSFER|TRANSFER UNIT:SECOND|SECOND TRANSFER)/)) return 'Rodillo transferencia';
  if (t(/^ (PICKUP ROLLER|PICK-UP ROLLER|PAPER FEED ROLLER|FEED ROLLER|ROLLER:(PAPER FEED|PICK-?UP|FEED))\b/)) return 'Feed roller';
  if (t(/^ (SEPARATION ROLLER|SEPARATE ROLLER|FRICTION PAD|REVERSE ROLLER|ROLLER:(SEPARATION|REVERSE)|PAD:FRICTION)\b/)) return 'Separate roller';
  if (t(/^ (COLLECTION BOTTLE|WASTE TONER BOTTLE|USED TONER BOTTLE|TONER COLLECTION BOTTLE|BOTTLE:(WASTE|COLLECTION|USED))/)) return 'Bote residual';
  if (t(/^ (CLEANING BLADE|BLADE:CLEANING)\b/)) return 'Cuchilla';
  if (t(/^ (CHARGE ROLLER|ROLLER:CHARGE|CHARGE UNIT|CHARGE CORONA UNIT)\b/)) return 'Carga';
  if (t(/^ (DRUM|OPC DRUM|PHOTOCONDUCTOR DRUM)\b/)) return 'Tambor';
  return '';
}
/** Sistema (agrupación de columnas) para los tipos que no existen en el proyecto. */
export const TYPE_SYSTEM = { 'Rodillo transferencia': 'Transferencia', 'Bote residual': 'Otros' };

/**
 * Piezas menores que casi nunca se piden sueltas (tornillería, muelles, engranajes, chapas, etiquetas…):
 * se ocultan con el filtro. Se mira el sustantivo de la cabecera del nombre: «STEPPED SCREW:M3» → SCREW.
 */
const SMALL_W = new Set(('SCREW SCREWS BIND HEXAGON RING E-RING SPRING BUSHING BEARING GEAR PULLEY DECAL LABEL HARNESS CABLE WIRE CLAMP STOPPER SPACER COLLAR ' +
  'WASHER PIN SHAFT BRACKET STAY PLATE SHEET MYLAR SEAL CUSHION FELT SPONGE INSULATOR KNOB HINGE CATCH STUD NUT RIVET JOINT HOLDER GUIDE LEVER ' +
  'ACTUATOR COVER LOUVER BUTTON CASE CASING FRAME DUCT PANEL PROOF PROOFING MATERIAL CORE BAND TAPE FILM BELT-STOPPER SLIDER ARM BASE CAP TIE SADDLE ' +
  'BOSS EDGING FOOT RAIL CLIP HOOK SHIELD STRAP TUBE WEIGHT BLOCK MARK SUPPORT FIXING CORD RINGS-E FENCE LINK RACK PINION CAM PAWL GRIP DISC FEELER TERMINAL TIGHTENER').split(' '));
export const SMALL = { test: name => { const head = String(name || '').toUpperCase().split(':')[0].split(' - ')[0].trim(); const w = head.split(/\s+/).pop(); return SMALL_W.has(w) || /^(SCREW|SNAP RING|E-RING|RETAINING RING)\b/.test(head); } };
export const isSmall = name => SMALL.test(name) && !guessType(name);

/** Mapa referencia antigua → nueva (siguiendo cadenas: A→B→C da A→C). */
export function supersessions(cat) {
  const next = new Map();
  cat.changes.forEach(c => { if (c.old.length === 1 && c.new.length === 1 && c.old[0] !== c.new[0]) next.set(c.old[0], c.new[0]); });
  const final = r => { let x = r, n = 0; while (next.has(x) && n++ < 20) x = next.get(x); return x; };
  const out = new Map(); next.forEach((_, o) => out.set(o, final(o)));
  return out;
}
