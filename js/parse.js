/* Map Vizard — route parsing for GPX, KML, JSON and GeoJSON. All results use [lat, lon]. */
(function () {
  'use strict';
  const MV = (window.MV = window.MV || {});

  const r7 = (n) => Math.round(n * 1e7) / 1e7;
  function pt(lat, lon) {
    lat = +lat; lon = +lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return [r7(lat), r7(lon)];
  }

  function dedupe(route) {
    return route.filter((p, i) => i === 0 || p[0] !== route[i - 1][0] || p[1] !== route[i - 1][1]);
  }

  function xml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('This file is not valid XML.');
    return doc;
  }
  const all = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));
  const childText = (node, tag) => {
    const c = Array.from(node.children).find((n) => n.localName === tag);
    return c ? c.textContent.trim() : '';
  };

  function gpx(text) {
    const doc = xml(text);
    let nodes = all(doc, 'trkpt');
    if (!nodes.length) nodes = all(doc, 'rtept');
    const route = nodes.map((n) => pt(n.getAttribute('lat'), n.getAttribute('lon'))).filter(Boolean);
    const stops = all(doc, 'wpt')
      .map((n) => {
        const p = pt(n.getAttribute('lat'), n.getAttribute('lon'));
        return p && { lat: p[0], lon: p[1], name: childText(n, 'name') };
      })
      .filter(Boolean);
    const trk = all(doc, 'trk')[0] || all(doc, 'rte')[0];
    const meta = all(doc, 'metadata')[0];
    const name = (trk && childText(trk, 'name')) || (meta && childText(meta, 'name')) || '';
    return { route, stops, name };
  }

  function coordList(s) {
    return s.trim().split(/\s+/).map((t) => {
      const [lon, lat] = t.split(',');
      return pt(lat, lon);
    }).filter(Boolean);
  }

  function kml(text) {
    const doc = xml(text);
    const route = [], stops = [];
    let name = '';
    all(doc, 'LineString').forEach((ls) => {
      const c = all(ls, 'coordinates')[0];
      if (c) route.push(...coordList(c.textContent));
      const pm = ls.closest('Placemark');
      if (!name && pm) name = childText(pm, 'name');
    });
    if (!route.length) {
      // Google Earth gx:Track — "lon lat alt" per <gx:coord>
      all(doc, 'coord').forEach((n) => {
        const [lon, lat] = n.textContent.trim().split(/\s+/);
        const p = pt(lat, lon);
        if (p) route.push(p);
      });
    }
    all(doc, 'Placemark').forEach((pm) => {
      const point = all(pm, 'Point')[0];
      const c = point && all(point, 'coordinates')[0];
      const p = c && coordList(c.textContent)[0];
      if (p) stops.push({ lat: p[0], lon: p[1], name: childText(pm, 'name') });
    });
    const d = all(doc, 'Document')[0];
    if (!name && d) name = childText(d, 'name');
    return { route, stops, name };
  }

  // Array items may be { lat, lon } (or lng / latitude / longitude) or [lon, lat] (GeoJSON order).
  function fromArray(arr) {
    return arr.map((item) => {
      if (Array.isArray(item)) return pt(item[1], item[0]);
      if (item && typeof item === 'object') {
        return pt(item.lat ?? item.latitude, item.lon ?? item.lng ?? item.long ?? item.longitude);
      }
      return null;
    }).filter(Boolean);
  }

  function stopsFrom(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map((item) => {
      const p = fromArray([item])[0];
      return p && { lat: p[0], lon: p[1], name: (item && (item.name || item.title)) || '' };
    }).filter(Boolean);
  }

  function geojson(data) {
    const route = [], stops = [];
    let name = '';
    const visit = (g, props) => {
      if (!g) return;
      switch (g.type) {
        case 'FeatureCollection': (g.features || []).forEach((f) => visit(f)); break;
        case 'Feature': {
          const p = g.properties || {};
          if (!name && p.name && g.geometry && /LineString/.test(g.geometry.type)) name = String(p.name);
          visit(g.geometry, p);
          break;
        }
        case 'LineString': route.push(...fromArray(g.coordinates || [])); break;
        case 'MultiLineString': (g.coordinates || []).forEach((c) => route.push(...fromArray(c))); break;
        case 'Point':
        case 'MultiPoint': {
          const coords = g.type === 'Point' ? [g.coordinates] : g.coordinates || [];
          fromArray(coords).forEach((p) => stops.push({ lat: p[0], lon: p[1], name: (props && (props.name || props.title)) || '' }));
          break;
        }
        case 'GeometryCollection': (g.geometries || []).forEach((x) => visit(x, props)); break;
      }
    };
    visit(data, {});
    return { route, stops, name };
  }

  function json(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { throw new Error('This file is not valid JSON.'); }
    if (Array.isArray(d)) return { route: fromArray(d), stops: [], name: '' };
    if (d && typeof d.type === 'string') return geojson(d);
    if (d && typeof d === 'object') {
      const arr = d.points || d.route || d.coordinates || d.path || d.track || [];
      return {
        route: Array.isArray(arr) ? fromArray(arr) : [],
        stops: stopsFrom(d.stops || d.waypoints),
        name: typeof d.name === 'string' ? d.name : typeof d.title === 'string' ? d.title : '',
      };
    }
    throw new Error('Unrecognised JSON structure.');
  }

  function file(filename, text) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    let r;
    if (ext === 'gpx') r = gpx(text);
    else if (ext === 'kml') r = kml(text);
    else if (ext === 'json' || ext === 'geojson') r = json(text);
    else {
      const head = text.trimStart().slice(0, 400);
      if (/<gpx[\s>]/i.test(head)) r = gpx(text);
      else if (/<kml[\s>]/i.test(head)) r = kml(text);
      else if (/^[[{]/.test(head)) r = json(text);
      else throw new Error('Unsupported file. Use GPX, KML or JSON.');
    }
    r.route = dedupe(r.route);
    if (!r.route.length && !r.stops.length) throw new Error('No coordinates found in this file.');
    return r;
  }

  MV.parse = { file, gpx, kml, json };
})();
