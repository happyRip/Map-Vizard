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
  function simplify(pts, eps) {
    if (!(eps > 0) || pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]], e2 = eps * eps;
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

  // Catmull–Rom spline through the points, as cubic Béziers. Tangents are clamped to
  // the segment length so uneven spacing does not overshoot into loops.
  function bezierSegments(pts) {
    const tangent = (a, b, seg) => {
      let tx = (b[0] - a[0]) / 6, ty = (b[1] - a[1]) / 6;
      const len = Math.hypot(tx, ty), max = seg * 0.4;
      if (len > max && len > 0) { tx *= max / len; ty *= max / len; }
      return [tx, ty];
    };
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const t1 = tangent(p0, p2, seg), t2 = tangent(p1, p3, seg);
      out.push([p1, [p1[0] + t1[0], p1[1] + t1[1]], [p2[0] - t2[0], p2[1] - t2[1]], p2, seg]);
    }
    return out;
  }

  function smoothPath(pts) {
    if (pts.length < 3) return linePath(pts);
    let d = 'M' + fmt(pts[0][0]) + ' ' + fmt(pts[0][1]);
    for (const [, c1, c2, p2] of bezierSegments(pts)) {
      d += 'C' + fmt(c1[0]) + ' ' + fmt(c1[1]) + ' ' + fmt(c2[0]) + ' ' + fmt(c2[1]) + ' ' + fmt(p2[0]) + ' ' + fmt(p2[1]);
    }
    return d;
  }

  // The same curve as smoothPath, flattened to a polyline (about one point per `step` units).
  function smoothPoints(pts, step) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (const [p1, c1, c2, p2, seg] of bezierSegments(pts)) {
      const n = Math.max(1, Math.min(16, Math.ceil(seg / step)));
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
        out.push([a * p1[0] + b * c1[0] + c * c2[0] + e * p2[0], a * p1[1] + b * c1[1] + c * c2[1] + e * p2[1]]);
      }
    }
    return out;
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

  MV.geo = { projection, haversine, length, segDist2, simplify, fmt, linePath, smoothPath, smoothPoints, fit, bbox, niceNumber };
})();
