/* Map Vizard — builds the whole scene as SVG markup (the single source for preview and export). */
(function () {
  'use strict';
  const MV = (window.MV = window.MV || {});
  const { fmt } = MV.geo;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
  MV.esc = esc;

  MV.LAYER_ORDER = ['background', 'basemap', 'route', 'markers', 'labels', 'extras'];

  // Per-render flags: USE_FILE = labels use the loaded font file; OUTLINE = emit text as paths.
  let USE_FILE = false, OUTLINE = false;

  function fontFamily(L) {
    if (L.font === 'file' && MV.fonts && MV.fonts.available()) return `'${MV.fonts.family().replace(/["'\\<>&;]/g, '')}', ${MV.FONTS.grotesk}`;
    const custom = L.customFont.replace(/["'\\<>&;]/g, '').trim();
    if (L.font === 'custom' && custom) return `'${custom}', ${MV.FONTS.grotesk}`;
    return MV.FONTS[L.font] || MV.FONTS.grotesk;
  }
  const solidBg = (s) => (s.background.type === 'none' ? '#ffffff' : s.background.color);
  const haloColor = (s) => (s.route.haloMatch ? solidBg(s) : s.route.haloColor);

  let mctx = null;
  function textWidth(text, size, weight, family, trackEm) {
    if (!text) return 0;
    if (USE_FILE) return MV.fonts.measure(text, size, weight, trackEm);
    let w;
    try {
      mctx = mctx || document.createElement('canvas').getContext('2d');
      mctx.font = `${weight} ${size * 10}px ${family}`;
      w = mctx.measureText(text).width / 10;
    } catch (e) {
      w = text.length * size * 0.56;
    }
    return w + Math.max(0, text.length - 1) * trackEm * size;
  }

  // One run of text: a live <text> element, or an outlined <path> when exporting with a font file.
  function text(str, x, y, o) {
    const track = o.track || 0, anchor = o.anchor || 'start', attrs = o.attrs || '';
    if (OUTLINE) {
      const d = MV.fonts.path(str, x, y + (o.dy || 0) * o.size, o.size, o.weight || 400, anchor, track);
      return d ? `<path d="${d}"${attrs}/>` : '';
    }
    return `<text x="${fmt(x)}" y="${fmt(y)}"${o.dy ? ` dy="${o.dy}em"` : ''} font-size="${fmt(o.size)}"` +
      `${o.weight ? ` font-weight="${o.weight}"` : ''}${track ? ` letter-spacing="${fmt(track * o.size)}"` : ''}` +
      `${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${attrs}>${esc(str)}</text>`;
  }

  function formatDistance(m, units, lang) {
    if (units === 'mi') {
      const mi = m / 1609.344;
      return mi < 0.2 ? Math.round((m * 3.28084) / 10) * 10 + ' ft' : MV.num(mi, 1, lang) + ' mi';
    }
    return m < 1000 ? Math.round(m / 10) * 10 + ' m' : MV.num(m / 1000, 1, lang) + ' km';
  }
  MV.formatDistance = formatDistance;

  // --- label block layout (positions in page mm) ---
  function layoutLabels(s, content, distText, W, H) {
    const L = s.labels;
    if (!L.show) return null;
    const PT = MV.PT, family = fontFamily(L);
    const tsz = L.titleSize * PT, msz = L.metaSize * PT;
    const lines = [];
    (content.title || '').split('\n').map((t) => t.trim()).filter(Boolean).forEach((t) => {
      lines.push({ text: L.allCaps ? t.toUpperCase() : t, size: tsz, weight: L.titleWeight, track: L.tracking, lead: tsz * 1.05 });
    });
    const meta = [content.date, content.area, L.showDistance ? distText : '']
      .map((x) => (x || '').trim()).filter(Boolean).join('  ·  ');
    if (meta) lines.push({ text: meta, size: msz, weight: 400, track: 0.02, lead: msz * 1.35, gap: msz * 0.6 });
    (content.notes || '').split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 4).forEach((t, i) => {
      lines.push({ text: t, size: msz * 0.92, weight: 400, track: 0.01, lead: msz * 1.3, gap: i === 0 ? msz * 0.4 : 0, opacity: 0.75 });
    });
    if (!lines.length) return null;

    let y = 0, width = 0;
    lines.forEach((ln, i) => {
      const prev = lines[i - 1];
      if (!prev) y = ln.size * 0.74;
      else if (prev.size === ln.size) y += ln.lead;
      else y += prev.size * 0.28 + ln.size * 0.95 + (ln.gap || 0);
      ln.y = y;
      width = Math.max(width, textWidth(ln.text, ln.size, ln.weight, family, ln.track));
    });
    const height = y + lines[lines.length - 1].size * 0.24;
    const m = s.page.margin;
    const [vert, horiz] = L.position.split('-');
    const top = vert === 'top' ? m : H - m - height;
    lines.forEach((ln) => (ln.y += top));
    const anchor = horiz === 'left' ? 'start' : horiz === 'right' ? 'end' : 'middle';
    const x = horiz === 'left' ? m : horiz === 'right' ? W - m : W / 2;
    const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
    return { lines, x, anchor, top, height, width, left, vert, family };
  }

  // Area the route is fitted into: inside the margins, clear of the label block.
  function fitRect(s, lab, W, H) {
    const e = Math.max(s.page.margin, s.page.inset + 2);
    const pad = Math.max(s.markers.size, s.markers.stops ? s.markers.stopSize : 0) / 2 +
      (s.route.halo ? s.route.haloWidth : 0) + s.route.width / 2;
    let x = e + pad, y = e + pad, w = W - 2 * (e + pad), h = H - 2 * (e + pad);
    if (lab && s.labels.reserve) {
      const gap = 4;
      if (lab.vert === 'top') {
        const ny = lab.top + lab.height + gap + pad;
        h -= ny - y;
        y = ny;
      } else {
        h = lab.top - gap - pad - y;
      }
    }
    return { x, y, w: Math.max(w, 10), h: Math.max(h, 10) };
  }

  function background(s, W, H, map, defs) {
    const b = s.background;
    let out = '';
    if (b.type === 'solid') {
      out += `<rect width="${fmt(W)}" height="${fmt(H)}" fill="${esc(b.color)}"/>`;
    } else if (b.type === 'gradient') {
      // CSS-style angle: 0° points up, 90° points right
      const r = (b.angle * Math.PI) / 180, dx = Math.sin(r), dy = -Math.cos(r);
      const L = Math.abs((W / 2) * dx) + Math.abs((H / 2) * dy);
      defs.push(
        `<linearGradient id="mv-grad" gradientUnits="userSpaceOnUse" x1="${fmt(W / 2 - dx * L)}" y1="${fmt(H / 2 - dy * L)}" x2="${fmt(W / 2 + dx * L)}" y2="${fmt(H / 2 + dy * L)}">` +
        `<stop offset="0" stop-color="${esc(b.color)}"/><stop offset="1" stop-color="${esc(b.color2)}"/></linearGradient>`
      );
      out += `<rect width="${fmt(W)}" height="${fmt(H)}" fill="url(#mv-grad)"/>`;
    }
    if (b.pattern !== 'none') {
      const sp = Math.max(1, b.patternSpacing);
      const tile = b.pattern === 'dots'
        ? `<circle cx="${fmt(sp / 2)}" cy="${fmt(sp / 2)}" r="${fmt(Math.max(0.15, sp * 0.05))}" fill="${esc(b.patternColor)}"/>`
        : `<path d="M${fmt(sp)} 0V${fmt(sp)}H0" fill="none" stroke="${esc(b.patternColor)}" stroke-width="0.15"/>`;
      defs.push(`<pattern id="mv-pat" patternUnits="userSpaceOnUse" x="${fmt(map.x)}" y="${fmt(map.y)}" width="${fmt(sp)}" height="${fmt(sp)}">${tile}</pattern>`);
      out += `<rect x="${fmt(map.x)}" y="${fmt(map.y)}" width="${fmt(map.w)}" height="${fmt(map.h)}" fill="url(#mv-pat)"/>`;
    }
    return out;
  }

  function arrows(pts, r, halo) {
    const a = Math.max(r.width * 2.6, 2), sp = Math.max(r.arrowSpacing, a * 2);
    const tri = `M${fmt(a * 0.55)} 0L${fmt(-a * 0.45)} ${fmt(a * 0.45)}L${fmt(-a * 0.2)} 0L${fmt(-a * 0.45)} ${fmt(-a * 0.45)}Z`;
    let out = '', acc = 0, next = sp / 2;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const seg = Math.hypot(x1 - x0, y1 - y0);
      while (seg > 0 && acc + seg >= next) {
        const t = (next - acc) / seg;
        const ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
        out += `<path transform="translate(${fmt(x0 + (x1 - x0) * t)} ${fmt(y0 + (y1 - y0) * t)}) rotate(${fmt(ang)})" d="${tri}"/>`;
        next += sp;
      }
      acc += seg;
    }
    return out
      ? `<g fill="${esc(r.color)}" stroke="${esc(halo)}" stroke-width="${fmt(Math.max(0.25, r.width * 0.35))}" stroke-linejoin="round" paint-order="stroke">${out}</g>`
      : '';
  }

  function routeLayer(st, s, proj) {
    if (st.route.length < 2) return '';
    const r = s.route, halo = haloColor(s);
    const pts = MV.geo.simplify(st.route.map((p) => proj.project(p[0], p[1])), r.simplify);
    const d = r.smooth ? MV.geo.smoothPath(pts) : MV.geo.linePath(pts);
    const cap = r.dash === 'dotted' ? 'round' : r.cap;
    const dash = r.dash === 'dashed' ? ` stroke-dasharray="${fmt(r.width * 2.5)} ${fmt(r.width * 1.8)}"`
      : r.dash === 'dotted' ? ` stroke-dasharray="0.01 ${fmt(r.width * 1.9)}"` : '';
    let out = '';
    if (r.halo) {
      out += `<path d="${d}" fill="none" stroke="${esc(halo)}" stroke-width="${fmt(r.width + 2 * r.haloWidth)}" stroke-linecap="${cap === 'butt' ? 'butt' : 'round'}" stroke-linejoin="round"/>`;
    }
    out += `<path d="${d}" fill="none" stroke="${esc(r.color)}" stroke-width="${fmt(r.width)}"` +
      `${r.opacity < 1 ? ` stroke-opacity="${fmt(r.opacity)}"` : ''} stroke-linecap="${cap}" stroke-linejoin="${r.join}"${dash}/>`;
    if (r.arrows) out += arrows(pts, r, halo);
    return out;
  }

  function marker(type, p, size, color, halo) {
    const [x, y] = p.map(fmt), R = size / 2;
    const edge = fmt(Math.max(0.35, size * 0.12));
    switch (type) {
      case 'dot':
        return `<circle cx="${x}" cy="${y}" r="${fmt(R)}" fill="${esc(color)}" stroke="${esc(halo)}" stroke-width="${edge}"/>`;
      case 'ring': {
        const rw = Math.max(0.5, size * 0.22);
        return `<circle cx="${x}" cy="${y}" r="${fmt(R - rw / 2)}" fill="${esc(halo)}" stroke="${esc(color)}" stroke-width="${fmt(rw)}"/>`;
      }
      case 'square':
        return `<rect x="${fmt(p[0] - R)}" y="${fmt(p[1] - R)}" width="${fmt(size)}" height="${fmt(size)}" fill="${esc(color)}" stroke="${esc(halo)}" stroke-width="${edge}"/>`;
      default:
        return '';
    }
  }

  // Length of segment a–b inside rect [x0, y0, x1, y1] (Liang–Barsky clip).
  function clipLen(a, b, r) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    let t0 = 0, t1 = 1;
    const p = [-dx, dx, -dy, dy], q = [a[0] - r[0], r[2] - a[0], a[1] - r[1], r[3] - a[1]];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return 0; continue; }
      const t = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
      if (t0 > t1) return 0;
    }
    return (t1 - t0) * Math.hypot(dx, dy);
  }

  const rectsOverlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const rectCircle = (r, c) => {
    const x = Math.max(r[0], Math.min(c[0], r[2])) - c[0], y = Math.max(r[1], Math.min(c[1], r[3])) - c[1];
    return x * x + y * y < c[2] * c[2];
  };

  // Pick a spot around each stop dot where its name stays clear of the route line, other dots,
  // earlier names and the page margin. Candidates sweep 16 directions at growing distances from
  // the dot; any contact costs more than moving a few mm out, so the nearest clear spot wins.
  // Each item offers layouts (one line, or wrapped onto two), each { lines, widths }.
  function placeStopNames(items, route, clear, obstacles, page) {
    const ANGLES = [0, 180, -30, 30, -150, 150, -60, 60, -120, 120, -90, 90, -15, 15, -165, 165];
    const placed = [];
    return items.map(({ x, y, R, size, layouts, own }) => {
      // glyph box around the baseline set by dy 0.35em: cap top to descender
      const up = size * 0.42, down = size * 0.3, lh = size * 1.1;
      const gaps = [0.8, 1.5, 2.3, 3.2, 4.4, 6].map((g) => R + g * size * 0.4);
      let best = null;
      layouts.forEach((lay, li) => {
        const w = Math.max(...lay.widths), h = up + down + lh * (lay.lines.length - 1);
        gaps.forEach((d) => ANGLES.forEach((deg, ai) => {
          const a = (deg * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
          const k = Math.max(Math.abs(ux), Math.abs(uy));
          // box edge nearest the dot sits on the circle of radius d (corner on diagonals)
          const cx = x + ux * d + (ux / k) * (w / 2), cy = y + uy * d + (uy / k) * (h / 2);
          const box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
          const pad = [box[0] - clear, box[1] - clear, box[2] + clear, box[3] + clear];
          let hit = 0;
          for (let i = 1; i < route.length; i++) hit += clipLen(route[i - 1], route[i], pad);
          let cost = (d - gaps[0]) * 1.2 + ai * 0.02 + li * 1.5 + (hit ? 10 + hit * 4 : 0);
          obstacles.forEach((c, j) => { if (j !== own && rectCircle(box, c)) cost += 30; });
          placed.forEach((b) => { if (rectsOverlap(box, b)) cost += 30; });
          if (box[0] < page[0] || box[1] < page[1] || box[2] > page[2] || box[3] > page[3]) cost += 200;
          if (!best || cost < best.cost) best = { cost, box, lay, ux };
        }));
      });
      placed.push(best.box);
      const [x0, y0, x1] = best.box, { lay, ux } = best;
      // lines hug the dot: right-aligned when left of it, centred above/below
      const anchor = lay.lines.length < 2 || ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle';
      const tx = anchor === 'start' ? x0 : anchor === 'end' ? x1 : (x0 + x1) / 2;
      return lay.lines.map((ln, i) => text(ln, tx, y0 + up - 0.35 * size + i * lh, { size, dy: 0.35, anchor })).join('');
    }).join('');
  }

  // One-line layout, plus a two-line wrap at the space nearest the middle for multi-word names.
  function nameLayouts(name, measure) {
    const out = [{ lines: [name], widths: [measure(name)] }];
    let cut = -1;
    for (let i = 0; i < name.length; i++) {
      if (name[i] === ' ' && (cut < 0 || Math.abs(i - name.length / 2) < Math.abs(cut - name.length / 2))) cut = i;
    }
    if (cut > 0) {
      const lines = [name.slice(0, cut), name.slice(cut + 1)];
      out.push({ lines, widths: lines.map(measure) });
    }
    return out;
  }

  function markersLayer(st, s, proj, W, H) {
    const M = s.markers, halo = haloColor(s);
    let out = '';
    if (st.route.length) {
      const a = proj.project(...st.route[0]);
      const b = proj.project(...st.route[st.route.length - 1]);
      const sc = M.matchRoute ? s.route.color : M.startColor;
      const ec = M.matchRoute ? s.route.color : M.endColor;
      if (st.route.length > 1) out += marker(M.end, b, M.size, ec, halo);
      out += marker(M.start, a, M.size, sc, halo);
    }
    if (M.stops && st.stops.length) {
      const fam = esc(fontFamily(s.labels));
      const R = M.stopSize / 2, nameSize = M.stopNameSize * MV.PT;
      let dots = '', names = '';
      const items = [], obstacles = [];
      if (st.route.length) {
        obstacles.push([...proj.project(...st.route[0]), M.size / 2]);
        obstacles.push([...proj.project(...st.route[st.route.length - 1]), M.size / 2]);
      }
      st.stops.forEach((p, i) => {
        const [x, y] = proj.project(p.lat, p.lon);
        obstacles.push([x, y, R + 0.3]);
        dots += `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(R)}" fill="${esc(M.stopColor)}" stroke="${esc(halo)}" stroke-width="0.4"/>`;
        dots += text(String(i + 1), x, y, { size: M.stopSize * 0.58, weight: 700, anchor: 'middle', dy: 0.35, attrs: ` fill="${esc(M.stopText)}"` });
        if (M.stopNames && p.name) {
          const measure = (str) => textWidth(str, nameSize, 400, fontFamily(s.labels), 0);
          items.push({ x, y, R, size: nameSize, own: obstacles.length - 1, layouts: nameLayouts(p.name, measure) });
        }
      });
      if (items.length) {
        const r = s.route, m = s.page.margin;
        // collide against the line as drawn (same simplify + smoothing as routeLayer)
        const pts = st.route.length > 1 ? MV.geo.simplify(st.route.map((p) => proj.project(p[0], p[1])), r.simplify) : [];
        const route = r.smooth ? MV.geo.smoothPoints(pts, 0.5) : pts;
        const clear = r.width / 2 + (r.halo ? r.haloWidth : 0) + nameSize * 0.11 + 0.3;
        names = placeStopNames(items, route, clear, obstacles, [m, m, W - m, H - m]);
      }
      out += `<g font-family="${fam}" font-weight="700" text-anchor="middle">${dots}</g>`;
      if (names) {
        out += `<g font-family="${fam}" font-size="${fmt(nameSize)}" fill="${esc(s.labels.color)}" stroke="${esc(halo)}" stroke-width="${fmt(nameSize * 0.22)}" stroke-linejoin="round" paint-order="stroke">${names}</g>`;
      }
    }
    return out;
  }

  function labelsLayer(s, lab) {
    if (!lab) return '';
    const L = s.labels;
    let out = '';
    if (L.plate) {
      const pad = 2.5;
      out += `<rect x="${fmt(lab.left - pad)}" y="${fmt(lab.top - pad)}" width="${fmt(lab.width + 2 * pad)}" height="${fmt(lab.height + 2 * pad)}"` +
        ` fill="${esc(L.plateMatch ? solidBg(s) : L.plateColor)}" fill-opacity="${fmt(L.plateOpacity)}"/>`;
    }
    out += `<g font-family="${esc(lab.family)}" fill="${esc(L.color)}" text-anchor="${lab.anchor}">`;
    lab.lines.forEach((ln) => {
      out += text(ln.text, lab.x, ln.y, {
        size: ln.size, weight: ln.weight, track: ln.track, anchor: lab.anchor,
        attrs: ln.opacity ? ` fill-opacity="${ln.opacity}"` : '',
      });
    });
    return out + '</g>';
  }

  function extrasLayer(st, s, lab, W, H, map) {
    const E = s.extras, m = s.page.margin, view = st.view;
    const fam = esc(fontFamily(s.labels)), col = esc(E.color);
    let out = '';
    if (E.border) {
      const b = E.borderWidth / 2;
      out += `<rect x="${fmt(map.x + b)}" y="${fmt(map.y + b)}" width="${fmt(map.w - 2 * b)}" height="${fmt(map.h - 2 * b)}" fill="none" stroke="${esc(E.borderColor)}" stroke-width="${fmt(E.borderWidth)}"/>`;
    }
    const credit = st.basemap && (st.basemap.credit || (st.basemap.source === 'osm' ? '© OpenStreetMap contributors' : ''))
      .replace('OpenStreetMap contributors', MV.t('osm', s.labels.lang));
    if (E.credit && s.basemap.show && credit) {
      const fs = 4.5 * MV.PT;
      const y = Math.min(H - m / 2 + fs * 0.35, H - fs * 0.3);
      out += text(credit, W - m, y, { size: fs, anchor: 'end', attrs: ` font-family="${fam}" fill="${col}" fill-opacity="0.6"` });
    }
    if (!E.northArrow && !E.scaleBar) return out;

    // north arrow + scale bar sit in the corner away from the label block
    const pos = lab ? s.labels.position : '';
    const corner = pos === 'bottom-right' ? 'bottom-left' : pos === 'bottom-center' ? 'top-right' : 'bottom-right';
    const right = corner.endsWith('right'), bottom = corner.startsWith('bottom');
    let x = right ? W - m : m;
    const edgeY = bottom ? H - m : m;

    if (E.northArrow) {
      const h = 9, w = 4.6;
      const cx = right ? x - w / 2 : x + w / 2, cy = bottom ? edgeY - h / 2 : edgeY + h / 2;
      const tip = -h / 2 + 2.6, notch = h / 2 - 1.6;
      out += `<g transform="translate(${fmt(cx)} ${fmt(cy)}) rotate(${fmt(view.rotation)})" stroke="${col}" stroke-width="0.3" stroke-linejoin="round">` +
        `<path d="M0 ${fmt(tip)}L${fmt(w / 2)} ${fmt(h / 2)}L0 ${fmt(notch)}Z" fill="none"/>` +
        `<path d="M0 ${fmt(tip)}L${fmt(-w / 2)} ${fmt(h / 2)}L0 ${fmt(notch)}Z" fill="${col}"/>` +
        text('N', 0, -h / 2 + 1.9, { size: 2.4, weight: 700, anchor: 'middle', attrs: ` font-family="${fam}" fill="${col}" stroke="none"` }) + '</g>';
      x = right ? x - w - 4 : x + w + 4;
    }
    if (E.scaleBar) {
      const z = view.zoom, target = 22 / z; // metres covered by ~22 mm
      let val, unit, metres;
      if (s.labels.units === 'mi') {
        const ft = target * 3.28084;
        if (ft >= 2640) { val = MV.geo.niceNumber(target / 1609.344); unit = 'mi'; metres = val * 1609.344; }
        else { val = MV.geo.niceNumber(ft); unit = 'ft'; metres = val / 3.28084; }
      } else {
        val = MV.geo.niceNumber(target); metres = val; unit = 'm';
        if (val >= 1000) { val /= 1000; unit = 'km'; }
      }
      const len = metres * z, fs = 6 * MV.PT;
      const x0 = right ? x - len : x, x1 = x0 + len;
      const barY = bottom ? edgeY - 0.2 : edgeY + fs + 2.6;
      out += `<path d="M${fmt(x0)} ${fmt(barY - 1.4)}V${fmt(barY)}H${fmt(x1)}V${fmt(barY - 1.4)}" fill="none" stroke="${col}" stroke-width="0.35"/>` +
        text(`${MV.num(+val.toPrecision(3), null, s.labels.lang)} ${unit}`, (x0 + x1) / 2, barY - 1.9, { size: fs, anchor: 'middle', attrs: ` font-family="${fam}" fill="${col}"` });
    }
    return out;
  }

  // Build the scene. When view.auto is set this also re-fits the view (mutating state.view).
  // opts.outline: convert text to paths (only possible when the labels use a loaded font file).
  MV.render = function (st, opts = {}) {
    const s = st.style;
    USE_FILE = s.labels.font === 'file' && !!MV.fonts && MV.fonts.available();
    OUTLINE = USE_FILE && !!opts.outline;
    const [W, H] = MV.pageDims(s);
    const distM = MV.geo.length(st.route);
    const distText = st.route.length > 1 ? formatDistance(distM, s.labels.units, s.labels.lang) : '';
    const labels = layoutLabels(s, st.content, distText, W, H);

    if (st.view.auto && (st.route.length || st.stops.length)) {
      const pts = st.route.concat(st.stops.map((p) => [p.lat, p.lon]));
      const v = MV.geo.fit(pts, st.view.rotation, fitRect(s, labels, W, H), W, H);
      if (v) Object.assign(st.view, v);
    }
    const proj = MV.geo.projection(st.view, W, H);
    const inset = s.page.inset;
    const map = { x: inset, y: inset, w: W - 2 * inset, h: H - 2 * inset };
    const defs = [`<clipPath id="mv-clip"><rect x="${fmt(map.x)}" y="${fmt(map.y)}" width="${fmt(map.w)}" height="${fmt(map.h)}"/></clipPath>`];

    const layers = {
      background: background(s, W, H, map, defs),
      basemap: s.basemap.show && st.basemap ? MV.basemap.render(st.basemap, proj, s.basemap, W, H, st.view) : '',
      route: routeLayer(st, s, proj),
      markers: markersLayer(st, s, proj, W, H),
      labels: labelsLayer(s, labels),
      extras: extrasLayer(st, s, labels, W, H, map),
    };
    layers.defs = defs.join('');
    const hasText = /<text[\s>]/.test(layers.markers + layers.labels + layers.extras);
    return { W, H, proj, layers, distM, distText, outlined: OUTLINE, liveText: hasText, family: fontFamily(s.labels) };
  };

  // Standalone SVG file. Default size is physical (mm); pass { px: [w, h] } for rasterising.
  MV.svgDocument = function (scene, opt = {}) {
    const { W, H, layers } = scene;
    const size = opt.px ? `width="${opt.px[0]}" height="${opt.px[1]}"` : `width="${fmt(W)}mm" height="${fmt(H)}mm"`;
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      `<svg xmlns="http://www.w3.org/2000/svg" version="1.1"${opt.lang ? ` xml:lang="${esc(opt.lang)}"` : ''} ${size} viewBox="0 0 ${fmt(W)} ${fmt(H)}">\n` +
      `<title>${esc(opt.title || MV.t('docTitle', opt.lang))}</title>\n<defs>${layers.defs}</defs>\n` +
      MV.LAYER_ORDER.map((k) => `<g id="${k}">${layers[k]}</g>`).join('\n') + '\n</svg>\n';
  };
})();
