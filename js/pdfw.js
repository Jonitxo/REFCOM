// Generador mínimo de PDF (texto, líneas y rectángulos) sin dependencias.
// Fuentes estándar Helvetica / Helvetica-Bold (no se incrustan) con codificación WinAnsi:
// cubre español (tildes, ñ, ¿¡, €). Coordenadas en puntos, origen arriba a la izquierda. A4 por defecto.

const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };

/** Texto → bytes WinAnsi (lo que no existe en WinAnsi se sustituye por «?»). */
function enc(s) {
  const out = [];
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (WIN[ch]) out.push(WIN[ch]);
    else if (c >= 32 && c <= 126) out.push(c);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else if (c === 9) out.push(32);
    else out.push(63);
  }
  return out;
}
/** Cadena literal PDF «(…)» en bytes, con escapes. */
function lit(s) {
  const b = [0x28];
  enc(s).forEach(c => { if (c === 0x28 || c === 0x29 || c === 0x5c) b.push(0x5c); b.push(c); });
  b.push(0x29);
  return b;
}
const ascii = s => Array.from(s, c => c.charCodeAt(0));
const n2 = v => (Math.round(v * 100) / 100).toString();
const rgb = c => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || '#000000');
  return m ? [1, 2, 3].map(i => n2(parseInt(m[i], 16) / 255)).join(' ') : '0 0 0';
};

// medida del texto: Arial tiene las mismas anchuras que Helvetica
let ctx = null;
export function textWidth(s, size, bold) {
  if (!ctx) { try { ctx = document.createElement('canvas').getContext('2d'); } catch { ctx = null; } }
  if (!ctx) return String(s).length * size * 0.5;
  ctx.font = `${bold ? 'bold ' : ''}${size}px Helvetica, Arial, sans-serif`;
  return ctx.measureText(String(s)).width;
}

/** Recorta un texto con «…» para que quepa en una anchura. */
export function fit(s, w, size, bold) {
  s = String(s ?? '');
  if (textWidth(s, size, bold) <= w) return s;
  while (s.length > 1 && textWidth(s + '…', size, bold) > w) s = s.slice(0, -1);
  return s + '…';
}

/** Parte un texto en líneas que caben en una anchura. */
export function wrap(s, w, size, bold) {
  const out = []; let cur = '';
  for (const word of String(s ?? '').split(/\s+/).filter(Boolean)) {
    const t = cur ? cur + ' ' + word : word;
    if (textWidth(t, size, bold) <= w || !cur) cur = t; else { out.push(cur); cur = word; }
  }
  if (cur) out.push(cur);
  return out.map(l => fit(l, w, size, bold));
}

export class Doc {
  constructor(w = 595.28, h = 841.89) { this.w = w; this.h = h; this.pages = []; this.page(); }
  page() { this.cur = []; this.pages.push(this.cur); return this; }
  /** Texto. o: { size, bold, color, align: 'left'|'right'|'center' } — y es la línea base. */
  text(x, y, s, o = {}) {
    const size = o.size || 10, w = textWidth(s, size, o.bold);
    const xx = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
    this.cur.push([...ascii(`BT ${rgb(o.color)} rg /${o.bold ? 'F2' : 'F1'} ${n2(size)} Tf ${n2(xx)} ${n2(this.h - y)} Td `), ...lit(s), ...ascii(' Tj ET\n')]);
    return this;
  }
  line(x1, y1, x2, y2, o = {}) {
    this.cur.push(ascii(`${rgb(o.color || '#000000')} RG ${n2(o.width || 0.5)} w ${n2(x1)} ${n2(this.h - y1)} m ${n2(x2)} ${n2(this.h - y2)} l S\n`));
    return this;
  }
  rect(x, y, w, h, o = {}) {
    const op = o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S';
    this.cur.push(ascii(`${o.fill ? rgb(o.fill) + ' rg ' : ''}${o.stroke ? rgb(o.stroke) + ' RG ' : ''}${n2(o.width || 0.5)} w ${n2(x)} ${n2(this.h - y - h)} ${n2(w)} ${n2(h)} re ${op}\n`));
    return this;
  }
  /** Bytes del PDF. */
  bytes(meta = {}) {
    const objs = [];
    const add = b => { objs.push(b); return objs.length; };
    const catalog = add(null), pagesId = add(null);
    const f1 = add(ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
    const f2 = add(ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
    const kids = this.pages.map(ops => {
      const body = [];
      ops.forEach(o => { for (let i = 0; i < o.length; i++) body.push(o[i]); });
      const cs = add(ascii(`<< /Length ${body.length} >>\nstream\n`).concat(body, ascii('\nendstream')));
      return add(ascii(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n2(this.w)} ${n2(this.h)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cs} 0 R >>`));
    });
    objs[catalog - 1] = ascii(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    objs[pagesId - 1] = ascii(`<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`);
    const info = add([...ascii('<< /Title '), ...lit(meta.title || ''), ...ascii(' /Producer '), ...lit('Referencias'), ...ascii(' >>')]);
    const out = [];
    const put = a => { for (let i = 0; i < a.length; i++) out.push(a[i]); };
    put(ascii('%PDF-1.4\n')); put([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);
    const offs = [];
    objs.forEach((b, i) => { offs.push(out.length); put(ascii(`${i + 1} 0 obj\n`)); put(b); put(ascii('\nendobj\n')); });
    const xref = out.length;
    put(ascii(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`));
    offs.forEach(o => put(ascii(String(o).padStart(10, '0') + ' 00000 n \n')));
    put(ascii(`trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
    return new Uint8Array(out);
  }
  blob(meta) { return new Blob([this.bytes(meta)], { type: 'application/pdf' }); }
}
