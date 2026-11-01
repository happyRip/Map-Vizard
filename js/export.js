/* Map Vizard — SVG / PNG / JSON downloads. PNGs get a pHYs chunk so layout apps read the DPI. */
(function () {
  'use strict';
  const MV = (window.MV = window.MV || {});

  MV.download = function (blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  MV.fileBase = function () {
    const st = MV.state;
    const title = (st.content.title || '').split('\n')[0] || st.routeName || 'route';
    const slug = title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'route';
    return `${slug}-${st.style.page.size.replace(/\s+/g, '').toLowerCase()}`;
  };

  const docTitle = () => (MV.state.content.title || MV.t('docTitle', MV.state.style.labels.lang)).replace(/\n/g, ' ');

  // Returns the scene so the caller can warn when text was left live (font must be installed to display).
  MV.exportSVG = function () {
    const scene = MV.render(MV.state, { outline: MV.state.style.labels.outline });
    const svg = MV.svgDocument(scene, { title: docTitle(), lang: MV.state.style.labels.lang });
    MV.download(new Blob([svg], { type: 'image/svg+xml' }), MV.fileBase() + '.svg');
    return scene;
  };

  MV.exportPNG = async function () {
    const st = MV.state, dpi = st.style.page.dpi;
    const [pw, ph] = MV.pixelDims(st.style);
    if (pw * ph > 150e6) throw new Error(`${pw}×${ph} px is too large for a browser canvas. Lower the DPI.`);
    // SVG inside <img> cannot use page fonts, so text from a font file is always outlined here
    const svg = MV.svgDocument(MV.render(st, { outline: true }), { px: [pw, ph], title: docTitle(), lang: st.style.labels.lang });
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.width = pw;
      img.height = ph;
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = pw;
      canvas.height = ph;
      canvas.getContext('2d').drawImage(img, 0, 0, pw, ph);
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not encode a canvas this large. Lower the DPI.'))), 'image/png'));
      MV.download(await setPngDpi(blob, dpi), `${MV.fileBase()}-${dpi}dpi.png`);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  MV.exportRoute = function () {
    const st = MV.state;
    const data = {
      name: (st.content.title || st.routeName || '').replace(/\n/g, ' '),
      points: st.route.map(([lat, lon]) => ({ lat, lon })),
      stops: st.stops.map(({ lat, lon, name }) => ({ lat, lon, name })),
    };
    MV.download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), MV.fileBase().replace(/-[^-]+$/, '') + '-route.json');
  };

  // Everything needed to reopen the map elsewhere: settings, text, route, stops, view, plus basemap and fonts.
  MV.exportProject = function (withBasemap) {
    const data = { app: 'map-vizard', kind: 'project', version: 1, savedAt: new Date().toISOString(), ...MV.snapshot() };
    if (withBasemap && MV.state.basemap) data.basemap = MV.state.basemap;
    if (MV.fonts.available()) data.fonts = MV.fonts.serialize();
    MV.download(new Blob([JSON.stringify(data)], { type: 'application/json' }), MV.fileBase().replace(/-[^-]+$/, '') + '.mapvizard.json');
  };

  MV.exportPreset = function () {
    const data = { app: 'map-vizard', kind: 'preset', version: 1, savedAt: new Date().toISOString(), style: MV.state.style };
    if (MV.fonts.available()) data.fonts = MV.fonts.serialize(); // keeps the preset self-contained
    MV.download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'house-style.mapvizard.json');
  };

  // --- PNG pHYs ---
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  async function setPngDpi(blob, dpi) {
    const src = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(src.buffer);
    const parts = [src.subarray(0, 8)];
    let off = 8;
    while (off < src.length) {
      const len = dv.getUint32(off);
      const type = String.fromCharCode(...src.subarray(off + 4, off + 8));
      const end = off + 12 + len;
      if (type !== 'pHYs') parts.push(src.subarray(off, end));
      if (type === 'IHDR') {
        const chunk = new Uint8Array(21), cv = new DataView(chunk.buffer);
        const ppm = Math.round(dpi / 0.0254);
        cv.setUint32(0, 9);
        chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
        cv.setUint32(8, ppm);
        cv.setUint32(12, ppm);
        chunk[16] = 1; // unit: metre
        cv.setUint32(17, crc32(chunk.subarray(4, 17)));
        parts.push(chunk);
      }
      off = end;
    }
    return new Blob(parts, { type: 'image/png' });
  }
  MV.setPngDpi = setPngDpi;
})();
