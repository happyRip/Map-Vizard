/* Map Vizard — house font files (TTF/OTF/WOFF): preview via FontFace, outlines via opentype.js. */
(function () {
  'use strict';
  const MV = (window.MV = window.MV || {});
  const KEY = 'mapvizard:v1:fonts';
  const SLOTS = ['regular', 'bold'];

  // slot → { family, subfamily, fileName, b64, font (opentype.Font), face (FontFace) }
  const fonts = { regular: null, bold: null };

  function toB64(buf) {
    const u = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(str) {
    const s = atob(str), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }
  const name = (font, key) => {
    const n = font.names[key];
    return n ? n.en || Object.values(n)[0] : '';
  };

  const available = () => !!(fonts.regular || fonts.bold);
  const family = () => (fonts.regular || fonts.bold || {}).family || '';
  const pick = (weight) => {
    const f = weight >= 600 ? fonts.bold || fonts.regular : fonts.regular || fonts.bold;
    return f && f.font;
  };

  async function install(slot, buffer, fileName) {
    if (!window.opentype) throw new Error('The font library did not load.');
    let font;
    try {
      font = window.opentype.parse(buffer);
    } catch (e) {
      throw new Error('Could not read this font. Use TTF, OTF or WOFF (WOFF2 is not supported).');
    }
    if (!font.supported) throw new Error('This font format is not supported.');
    const prev = fonts[slot];
    if (prev && prev.face) document.fonts.delete(prev.face);
    fonts[slot] = {
      family: name(font, 'preferredFamily') || name(font, 'fontFamily') || fileName.replace(/\.[^.]+$/, ''),
      subfamily: name(font, 'preferredSubfamily') || name(font, 'fontSubfamily'),
      fileName,
      b64: toB64(buffer),
      font,
      face: null,
    };
    registerFaces();
  }

  // Both slots are registered under one family name (the regular's) so live text in the preview matches.
  function registerFaces() {
    const fam = family();
    SLOTS.forEach((slot) => {
      const f = fonts[slot];
      if (!f) return;
      if (f.face) document.fonts.delete(f.face);
      try {
        f.face = new FontFace(fam, fromB64(f.b64), { weight: slot === 'bold' ? '700' : '400' });
        document.fonts.add(f.face);
        f.face.load().then(() => MV.requestRender && MV.requestRender(), () => {});
      } catch (e) {
        f.face = null;
      }
    });
  }

  function remove(slot) {
    const f = fonts[slot];
    if (f && f.face) document.fonts.delete(f.face);
    fonts[slot] = null;
    registerFaces();
  }

  function serialize() {
    const out = {};
    SLOTS.forEach((s) => { if (fonts[s]) out[s] = { fileName: fonts[s].fileName, b64: fonts[s].b64 }; });
    return out;
  }

  async function load(data) {
    for (const s of SLOTS) {
      if (data && data[s] && data[s].b64) {
        try { await install(s, fromB64(data[s].b64), data[s].fileName || s); } catch (e) { /* skip unreadable */ }
      }
    }
  }

  function persist() {
    try {
      if (available()) localStorage.setItem(KEY, JSON.stringify(serialize()));
      else localStorage.removeItem(KEY);
      return true;
    } catch (e) {
      return false;
    }
  }
  async function restore() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) await load(JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }

  // Glyph layout with kerning (GPOS when present, else the kern table) and tracking in em.
  function layout(font, text, size, trackEm) {
    const glyphs = font.stringToGlyphs(text);
    const scale = size / font.unitsPerEm;
    const kernTables = font.position && font.position.defaultKerningTables;
    const pos = [];
    let x = 0;
    glyphs.forEach((g, i) => {
      pos.push(x);
      x += (g.advanceWidth || 0) * scale;
      if (i < glyphs.length - 1) {
        let k = 0;
        try {
          k = kernTables ? font.position.getKerningValue(kernTables, g.index, glyphs[i + 1].index) : font.getKerningValue(g, glyphs[i + 1]);
        } catch (e) { k = 0; }
        x += (k || 0) * scale + trackEm * size;
      }
    });
    return { glyphs, pos, width: x };
  }

  function measure(text, size, weight, trackEm) {
    const font = pick(weight);
    return font ? layout(font, text, size, trackEm).width : 0;
  }

  // SVG path data for `text` with its baseline at y; x is interpreted per text-anchor.
  function path(text, x, y, size, weight, anchor, trackEm) {
    const font = pick(weight);
    if (!font || !text) return '';
    const { glyphs, pos, width } = layout(font, text, size, trackEm);
    const x0 = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x;
    let d = '';
    glyphs.forEach((g, i) => { d += g.getPath(x0 + pos[i], y, size).toPathData(2); });
    return d;
  }

  MV.fonts = {
    slots: fonts, available, family, install, remove, serialize, load, persist, restore, measure, path,
    describe: (slot) => (fonts[slot] ? `${fonts[slot].family}${fonts[slot].subfamily ? ' ' + fonts[slot].subfamily : ''}` : ''),
  };
})();
