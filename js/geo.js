/* Map Vizard — projection, distances, simplification and path building. */
(function () {
  'use strict';
  const MV = (window.MV = window.MV || {});
  const DEG = Math.PI / 180;
  const M_PER_DEG = 111319.49;
  const EARTH_R = 6371008.8;

  // Local equirectangular projection onto the page, in millimetres.
  // view.zoom is millimetres per metre; rotation (degrees) is clockwise around the page centre.
  function projection(view, W, H) {
    const lat0 = view.lat, lon0 = view.lon, z = view.zoom;
    const kx = M_PER_DEG * Math.cos(lat0 * DEG), ky = M_PER_DEG;
    const th = (view.rotation || 0) * DEG, c = Math.cos(th), s = Math.sin(th);
    const cx = W / 2, cy = H / 2;
    return {
      project(lat, lon) {
        const sx = (lon - lon0) * kx * z, sy = -(lat - lat0) * ky * z;
        return [cx + sx * c - sy * s, cy + sx * s + sy * c];
      },
      unproject(x, y) {
        const rx = x - cx, ry = y - cy;
        const sx = rx * c + ry * s, sy = -rx * s + ry * c;
        return [lat0 - sy / (ky * z), lon0 + sx / (kx * z)];
      },
    };
  }

  function haversine(a, b) {
    const dLat = (b[0] - a[0]) * DEG, dLon = (b[1] - a[1]) * DEG;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * DEG) * Math.cos(b[0] * DEG) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function length(pts) {
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1], pts[i]);
    return d;
  }

  function segDist2(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
    return { d2: x * x + y * y, t };
  }

  // Ramer–Douglas–Peucker on 2D points (extra array entries are carried along).
  // `pinned` lists indexes that must survive, so the line keeps passing through them.
  function simplify(pts, eps, pinned = []) {
    if (!(eps > 0) || pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    pinned.forEach((i) => (keep[i] = 1));
    const anchors = [];
    keep.forEach((k, i) => { if (k) anchors.push(i); });
    const stack = anchors.slice(1).map((b, i) => [anchors[i], b]), e2 = eps * eps;
    while (stack.length) {
      const [a, b] = stack.pop();
      let max = 0, idx = -1;
      for (let i = a + 1; i < b; i++) {
        const { d2 } = segDist2(pts[i], pts[a], pts[b]);
        if (d2 > max) { max = d2; idx = i; }
      }
      if (max > e2) {
        keep[idx] = 1;
        stack.push([a, idx], [idx, b]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  }

  const fmt = (n) => String(Math.round(n * 100) / 100 + 0);

  function linePath(pts) {
    let d = '';
    for (let i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + fmt(pts[i][0]) + ' ' + fmt(pts[i][1]);
    return d;
  }

  function nearestVertex(pts, p) {
    let best = 0, min = Infinity;
    pts.forEach((q, i) => {
      const d2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
      if (d2 < min) { min = d2; best = i; }
    });
    return best;
  }

  // Adds the point of the line nearest each stop within `maxDist`.
  // Returns the new line and the indexes of those points, for simplify() to keep.
  function pinStops(pts, stops, maxDist) {
    const hits = [];
    stops.forEach((p) => {
      let hit = null;
      for (let i = 1; i < pts.length; i++) {
        const { d2, t } = segDist2(p, pts[i - 1], pts[i]);
        if (!hit || d2 < hit.d2) hit = { d2, t, i: i - 1 };
      }
      if (hit && hit.d2 <= maxDist * maxDist) hits.push(hit);
    });
    hits.sort((a, b) => a.i - b.i || a.t - b.t);
    const out = [], pins = [];
    let h = 0;
    pts.forEach((q, i) => {
      out.push(q);
      for (; h < hits.length && hits[h].i === i; h++) {
        const { t } = hits[h], next = pts[i + 1];
        if (t < 0.001) pins.push(out.length - 1);
        else if (t > 0.999) pins.push(out.length); // the next vertex, pushed on the next pass
        else {
          out.push([q[0] + (next[0] - q[0]) * t, q[1] + (next[1] - q[1]) * t]);
          pins.push(out.length - 1);
        }
      }
    });
    return { pts: out, pins };
  }

  // Rounds corners by averaging the line over a sliding window `len` long. Straight runs stay
  // straight and the curve never leaves the corner it rounds, so it cannot overshoot. The window
  // narrows towards the ends and towards `pinned` points, so the line still passes through them.
  function roundCorners(pts, len, pinned = []) {
    const pinSet = new Set(pinned), line = [];
    pts.forEach((p) => {
      const prev = line[line.length - 1];
      if (prev && prev[0] === p[0] && prev[1] === p[1]) { if (pinSet.has(p)) pinSet.add(prev); } else line.push(p);
    });
    if (line.length < 3 || !(len > 0)) return line;

    const n = line.length, cum = new Float64Array(n), gx = new Float64Array(n), gy = new Float64Array(n);
    const pinAt = [];
    for (let i = 0; i < n; i++) {
      if (pinSet.has(line[i])) pinAt.push(i);
      if (!i) continue;
      const [ax, ay] = line[i - 1], [bx, by] = line[i], l = Math.hypot(bx - ax, by - ay);
      cum[i] = cum[i - 1] + l;
      gx[i] = gx[i - 1] + l * (ax + bx) / 2;
      gy[i] = gy[i - 1] + l * (ay + by) / 2;
    }
    const total = cum[n - 1], pinU = pinAt.map((i) => cum[i]);

    // integral of the position along the line, up to arc length u
    const integral = (u) => {
      let lo = 0, hi = n - 2;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (cum[mid] <= u) lo = mid; else hi = mid - 1;
      }
      const t = u - cum[lo], l = cum[lo + 1] - cum[lo];
      const dx = (line[lo + 1][0] - line[lo][0]) / l, dy = (line[lo + 1][1] - line[lo][1]) / l;
      return [gx[lo] + t * line[lo][0] + (t * t * dx) / 2, gy[lo] + t * line[lo][1] + (t * t * dy) / 2,
        line[lo][0] + t * dx, line[lo][1] + t * dy];
    };

    const step = Math.max(0.2, total / 20000);
    const samples = pinU.concat(total);
    for (let u = 0; u < total; u += step) samples.push(u);
    samples.sort((a, b) => a - b);

    const out = samples.map((u) => {
      let h = Math.min(len / 2, u, total - u);
      pinU.forEach((v) => { h = Math.min(h, Math.abs(u - v)); });
      const b = integral(u);
      if (h < 1e-6) return [b[2], b[3]];
      const hi = integral(u + h), lo = integral(u - h);
      return [(hi[0] - lo[0]) / (2 * h), (hi[1] - lo[1]) / (2 * h)];
    });
    return simplify(out, 0.02); // drop the samples on straight runs
  }

  // Centre + zoom that fit `points` (lat/lon) into `rect` (page mm) at the given rotation.
  function fit(points, rotation, rect, W, H, minSpan = 120) {
    if (!points.length) return null;
    let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
    for (const p of points) {
      if (p[0] < s) s = p[0]; if (p[0] > n) n = p[0];
      if (p[1] < w) w = p[1]; if (p[1] > e) e = p[1];
    }
    // zoom 1 and a 0,0 page centre give "rotated metres" (y down)
    const P = projection({ lat: (s + n) / 2, lon: (w + e) / 2, zoom: 1, rotation }, 0, 0);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) {
      const [x, y] = P.project(p[0], p[1]);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const zoom = Math.min(rect.w / Math.max(x1 - x0, minSpan), rect.h / Math.max(y1 - y0, minSpan));
    const fx = rect.x + rect.w / 2 - W / 2, fy = rect.y + rect.h / 2 - H / 2;
    const c = P.unproject((x0 + x1) / 2 - fx / zoom, (y0 + y1) / 2 - fy / zoom);
    return { lat: c[0], lon: c[1], zoom };
  }

  function bbox(points) {
    if (!points.length) return null;
    let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
    for (const p of points) {
      s = Math.min(s, p[0]); n = Math.max(n, p[0]);
      w = Math.min(w, p[1]); e = Math.max(e, p[1]);
    }
    return [s, w, n, e];
  }

  // 1, 2 or 5 × 10^n, not larger than x
  function niceNumber(x) {
    const p = 10 ** Math.floor(Math.log10(x));
    const f = x / p;
    return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p;
  }

  MV.geo = { projection, haversine, length, segDist2, simplify, fmt, linePath, nearestVertex, pinStops, roundCorners, fit, bbox, niceNumber };
})();
