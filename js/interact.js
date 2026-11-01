/* Map Vizard — pointer interaction on the preview: pan, zoom, edit points, draw, place stops. */
(function () {
  'use strict';
  const MV = (window.MV = window.MV || {});
  const { fmt } = MV.geo;
  const MAX_HANDLES = 1500;

  let overlay, layer, drag = null, lastTap = null;
  const st = () => MV.state;
  const dims = () => MV.pageDims(MV.state.style);
  const proj = () => { const [W, H] = dims(); return MV.geo.projection(MV.state.view, W, H); };
  const r7 = (n) => Math.round(n * 1e7) / 1e7;
  const geoAt = (P, m) => P.unproject(m[0], m[1]).map(r7);

  function toMM(e) {
    const pt = overlay.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(overlay.getScreenCTM().inverse());
    return [p.x, p.y];
  }
  function pxPerMm() {
    const w = overlay.getBoundingClientRect().width;
    return w > 0 ? w / dims()[0] : 1;
  }

  function nearestSegment(route, P, m, tol) {
    let best = null;
    for (let i = 1; i < route.length; i++) {
      const a = P.project(...route[i - 1]), b = P.project(...route[i]);
      const { d2 } = MV.geo.segDist2(m, a, b);
      if (d2 < tol * tol && (!best || d2 < best.d2)) best = { i: i - 1, d2 };
    }
    return best;
  }

  MV.zoomAt = function (m, factor) {
    const s = st(), [W, H] = dims();
    const g = proj().unproject(m[0], m[1]);
    s.view.zoom = Math.min(50, Math.max(1e-5, s.view.zoom * factor));
    s.view.auto = false;
    const P2 = proj(), m2 = P2.project(g[0], g[1]);
    const c = P2.unproject(W / 2 - (m[0] - m2[0]), H / 2 - (m[1] - m2[1]));
    s.view.lat = c[0];
    s.view.lon = c[1];
    MV.requestRender();
    MV.commitSoon();
  };

  function panTo(d, m) {
    const [W, H] = dims();
    const c = d.P0.unproject(W / 2 - (m[0] - d.m0[0]), H / 2 - (m[1] - d.m0[1]));
    st().view.lat = c[0];
    st().view.lon = c[1];
    st().view.auto = false;
    MV.requestRender();
  }

  function removePoint(i) {
    st().route.splice(i, 1);
    MV.requestRender();
    MV.commit();
  }

  function onDown(e) {
    if (e.button !== 0 && e.button !== 1) return;
    const s = st(), tool = MV.tool, m = toMM(e), P = proj();
    const hit = e.target.closest && e.target.closest('[data-i]');
    const pan = (extra) => Object.assign({ type: 'pan', m0: m, P0: P, sx: e.clientX, sy: e.clientY, moved: false }, extra);
    overlay.setPointerCapture(e.pointerId);
    e.preventDefault();

    if (e.button === 1 || tool === 'pan') {
      drag = pan();
    } else if (tool === 'edit') {
      if (hit && hit.dataset.kind === 'pt') {
        const i = +hit.dataset.i, now = performance.now();
        // Alt-click or double-click deletes (tracked here: pointer capture retargets dblclick)
        if (e.altKey || (lastTap && lastTap.i === i && now - lastTap.t < 350)) {
          lastTap = null;
          removePoint(i);
          return;
        }
        lastTap = { i, t: now };
        drag = { type: 'point', i, moved: false };
      } else {
        const seg = s.route.length <= MAX_HANDLES && nearestSegment(s.route, P, m, 6 / pxPerMm());
        if (seg) {
          s.view.auto = false;
          s.route.splice(seg.i + 1, 0, geoAt(P, m));
          drag = { type: 'point', i: seg.i + 1, moved: true };
          MV.requestRender();
        } else {
          drag = pan();
        }
      }
    } else if (tool === 'draw') {
      drag = pan({ click: 'draw' });
    } else if (tool === 'stops') {
      if (hit && hit.dataset.kind === 'stop') {
        const i = +hit.dataset.i;
        if (e.altKey) {
          s.stops.splice(i, 1);
          MV.emit('stops');
          MV.requestRender();
          MV.commit();
          return;
        }
        drag = { type: 'stop', i, moved: false };
      } else {
        drag = pan({ click: 'stop' });
      }
    }
  }

  function onMove(e) {
    if (!drag) return;
    const m = toMM(e), s = st();
    if (drag.type === 'pan') {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.moved = true;
      panTo(drag, m);
    } else if (drag.type === 'point') {
      s.view.auto = false;
      s.route[drag.i] = geoAt(proj(), m);
      drag.moved = true;
      MV.requestRender();
    } else if (drag.type === 'stop') {
      s.view.auto = false;
      const [lat, lon] = geoAt(proj(), m);
      Object.assign(s.stops[drag.i], { lat, lon });
      drag.moved = true;
      MV.requestRender();
    }
  }

  function onUp(e) {
    if (!drag) return;
    const d = drag, s = st();
    drag = null;
    if (d.type === 'pan' && !d.moved && d.click) {
      const g = geoAt(proj(), toMM(e));
      s.view.auto = false;
      if (d.click === 'draw') s.route.push(g);
      else {
        s.stops.push({ lat: g[0], lon: g[1], name: '' });
        MV.emit('stops');
      }
      MV.requestRender();
      MV.commit();
    } else if (d.moved) {
      MV.commit();
    }
  }

  MV.renderOverlay = function () {
    if (!layer) return;
    const s = st(), tool = MV.tool, k = pxPerMm();
    const P = proj();
    let out = '';
    if ((tool === 'edit' || tool === 'draw') && s.route.length) {
      const pts = s.route.map((p) => P.project(p[0], p[1]));
      out += `<path d="${MV.geo.linePath(pts)}" fill="none" stroke="#2563eb" stroke-opacity="0.55" stroke-width="${fmt(1.2 / k)}" pointer-events="none"/>`;
      if (pts.length <= MAX_HANDLES) {
        const r = (tool === 'edit' ? 4.5 : 3) / k;
        const attrs = tool === 'edit' ? '' : ' pointer-events="none"';
        out += pts.map((p, i) =>
          `<circle data-kind="pt" data-i="${i}" cx="${fmt(p[0])}" cy="${fmt(p[1])}" r="${fmt(i === pts.length - 1 && tool === 'draw' ? r * 1.4 : r)}"${attrs}/>`
        ).join('');
      }
    }
    if (tool === 'stops') {
      const r = 9 / k;
      out += s.stops.map((p, i) => {
        const [x, y] = P.project(p.lat, p.lon);
        return `<circle class="stop-handle" data-kind="stop" data-i="${i}" cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}"/>`;
      }).join('');
    }
    layer.setAttribute('stroke-width', fmt(1.5 / k));
    layer.innerHTML = out;
  };

  MV.tooManyHandles = () => st().route.length > MAX_HANDLES;

  MV.initInteract = function (svg) {
    overlay = svg;
    layer = svg.querySelector('#O-layer');
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', () => { if (drag && drag.moved) MV.commit(); drag = null; });
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      MV.zoomAt(toMM(e), Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
    }, { passive: false });
  };
})();
