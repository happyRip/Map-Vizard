/* Map Vizard — minimal vector basemap: OpenStreetMap via Overpass, or a local GeoJSON file. */
(function () {
  'use strict';
  const MV = (window.MV = window.MV || {});

  const REQUEST_TIMEOUT = 90000; // per server
  const HEDGE_AFTER = 10000; // start the next server if the current one is still silent
  const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];

  const MAJOR = /^(motorway|trunk|primary|secondary)(_link)?$/;
  const MID = /^(tertiary|tertiary_link|unclassified|residential|living_street|road)$/;
  const MINOR = /^(service|pedestrian|footway|path|cycleway|steps|track|bridleway)$/;
  const GREEN_LEISURE = /^(park|garden|playground|pitch|common)$/;
  const GREEN_LANDUSE = /^(grass|forest|meadow|recreation_ground|cemetery|village_green|allotments)$/;

  // Feature classes: major / mid / minor roads, rail, river / stream lines, water / green areas.
  function classify(t) {
    if (t.highway) {
      if (MAJOR.test(t.highway)) return 'major';
      if (MID.test(t.highway)) return 'mid';
      if (MINOR.test(t.highway)) {
        if (/^(sidewalk|crossing)$/.test(t.footway) || /^(parking_aisle|driveway)$/.test(t.service)) return null;
        return 'minor';
      }
      return null;
    }
    if (t.railway) {
      if (!/^(rail|light_rail|tram|narrow_gauge)$/.test(t.railway)) return null;
      return t.tunnel && t.tunnel !== 'no' ? null : 'rail';
    }
    if (t.natural === 'water' || t.waterway === 'riverbank' || /^(reservoir|basin)$/.test(t.landuse)) return 'water';
    if (t.waterway) return /^(river|canal)$/.test(t.waterway) ? 'river' : t.waterway === 'stream' ? 'stream' : null;
    if (GREEN_LEISURE.test(t.leisure) || GREEN_LANDUSE.test(t.landuse) || /^(wood|scrub)$/.test(t.natural)) return 'green';
    return null;
  }
  const isArea = (c) => c === 'water' || c === 'green';

  const r6 = (n) => Math.round(n * 1e6) / 1e6;
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];

  // Join multipolygon member ways that share endpoints into rings.
  function stitch(ways) {
    const pool = ways.filter((w) => w.length > 1).map((w) => w.slice());
    const rings = [];
    while (pool.length) {
      let ring = pool.shift();
      while (!same(ring[0], ring[ring.length - 1])) {
        const end = ring[ring.length - 1];
        const i = pool.findIndex((w) => same(w[0], end) || same(w[w.length - 1], end));
        if (i < 0) break;
        const w = pool.splice(i, 1)[0];
        ring = ring.concat(same(w[0], end) ? w.slice(1) : w.slice(0, -1).reverse());
      }
      rings.push(ring);
    }
    return rings;
  }

  function fromOverpass(json, bbox) {
    const features = [];
    const geom = (g) => (g || []).filter((p) => p && Number.isFinite(p.lat)).map((p) => [r6(p.lat), r6(p.lon)]);
    for (const el of json.elements || []) {
      const c = classify(el.tags || {});
      if (!c) continue;
      if (el.type === 'way' && el.geometry) {
        const g = geom(el.geometry);
        if (g.length < 2) continue;
        if (isArea(c) && !same(g[0], g[g.length - 1])) continue; // unclosed area outline
        features.push({ c, g: [g] });
      } else if (el.type === 'relation' && el.members && isArea(c)) {
        const ways = el.members.filter((m) => m.type === 'way' && m.geometry).map((m) => geom(m.geometry));
        const rings = stitch(ways).filter((r) => r.length > 3);
        if (rings.length) features.push({ c, g: rings });
      }
    }
    return { id: 'osm-' + Date.now().toString(36), source: 'osm', credit: '© OpenStreetMap contributors', bbox, features };
  }

  function query(bbox) {
    const [s, w, n, e] = bbox;
    const span = MV.geo.haversine([s, w], [n, e]);
    const hw = span > 20000 ? '^(motorway|trunk|primary|secondary)(_link)?$'
      : span > 9000 ? '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian)(_link)?$'
        : '.';
    const b = `(${s},${w},${n},${e})`;
    return `[out:json][timeout:60];(` +
      `way["highway"~"${hw}"]${b};` +
      `way["railway"~"^(rail|light_rail|tram|narrow_gauge)$"]${b};` +
      `way["natural"="water"]${b};relation["natural"="water"]${b};` +
      `way["waterway"~"^(river|canal|stream|riverbank)$"]${b};` +
      `way["leisure"~"^(park|garden|playground|pitch|common)$"]${b};relation["leisure"="park"]${b};` +
      `way["landuse"~"^(grass|forest|meadow|recreation_ground|cemetery|village_green|allotments)$"]${b};` +
      `way["natural"~"^(wood|scrub)$"]${b};` +
      `);out geom qt;`;
  }

  // Public Overpass servers are often queued or stalled, so requests are hedged: the next server
  // starts if the current one is silent for HEDGE_AFTER ms (or fails), and the first good answer wins.
  async function fetchOSM(bbox, onStatus, signal) {
    const span = MV.geo.haversine([bbox[0], bbox[1]], [bbox[2], bbox[3]]);
    if (span > 60000) throw new Error('The visible area is too large (over 60 km across). Zoom in first.');
    const body = 'data=' + encodeURIComponent(query(bbox));
    const host = (u) => new URL(u).host;
    const controllers = ENDPOINTS.map(() => new AbortController());
    const abortAll = () => controllers.forEach((c) => c.abort());
    if (signal) signal.addEventListener('abort', abortAll);
    const active = new Set(), errors = [], started = Date.now();
    const status = () => onStatus && onStatus(`Waiting for ${[...active].map(host).join(' and ')}… ${Math.round((Date.now() - started) / 1000)} s`);
    const ticker = setInterval(status, 1000);

    try {
      return await new Promise((resolve, reject) => {
        let next = 0, done = false, hedge;
        const finish = (fn, v) => { if (!done) { done = true; fn(v); } };
        const launch = () => {
          clearTimeout(hedge);
          if (done || next >= ENDPOINTS.length) return;
          const i = next++, url = ENDPOINTS[i], ctl = controllers[i];
          let timedOut = false;
          const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, REQUEST_TIMEOUT);
          active.add(url);
          status();
          fetch(url, { method: 'POST', body, signal: ctl.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
            .then((res) => {
              if (res.status === 429) throw new Error('rate limited (HTTP 429)');
              if (res.status === 504) throw new Error('server busy (HTTP 504)');
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.json();
            })
            .then((json) => {
              if (json.remark && /error/i.test(json.remark)) throw new Error(json.remark.trim());
              finish(resolve, fromOverpass(json, bbox));
            })
            .catch((err) => {
              if (done) return;
              if (signal && signal.aborted) return finish(reject, new DOMException('Cancelled', 'AbortError'));
              errors.push(`${host(url)}: ${timedOut ? 'no answer in ' + REQUEST_TIMEOUT / 1000 + ' s' : err.message}`);
              active.delete(url);
              if (next < ENDPOINTS.length) launch();
              else if (!active.size) finish(reject, new Error('No Overpass server answered — try again in a minute. ' + errors.join(' · ')));
            })
            .finally(() => clearTimeout(timer));
          if (next < ENDPOINTS.length) hedge = setTimeout(launch, HEDGE_AFTER);
        };
        launch();
      });
    } finally {
      clearInterval(ticker);
      abortAll();
      if (signal) signal.removeEventListener('abort', abortAll);
    }
  }

  // --- OpenFreeMap vector tiles (OpenMapTiles schema): CDN-served, so far more reliable than Overpass ---
  const TILEJSON = 'https://tiles.openfreemap.org/planet';
  const TILE_LAYERS = ['transportation', 'water', 'waterway', 'park', 'landcover', 'landuse'];
  const MAX_TILES = 48;
  const TILE_CREDIT = '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors';
  let tileTemplate = null;

  function classifyTile(layer, t, type) {
    const tunnel = t.brunnel === 'tunnel';
    switch (layer) {
      case 'transportation':
        if (type !== 2) return null;
        if (/^(motorway|trunk|primary|secondary)$/.test(t.class)) return 'major';
        if (t.class === 'tertiary' || t.class === 'minor') return 'mid';
        if (/^(service|track|path)$/.test(t.class)) return tunnel || t.subclass === 'platform' ? null : 'minor';
        if (t.class === 'rail') return tunnel || t.subclass === 'funicular' ? null : 'rail';
        if (t.class === 'transit') return !tunnel && /^(light_rail|tram)$/.test(t.subclass) ? 'rail' : null;
        return null;
      case 'water':
        return type === 3 && !tunnel && t.class !== 'swimming_pool' ? 'water' : null;
      case 'waterway':
        if (type !== 2 || tunnel) return null;
        return /^(river|canal)$/.test(t.class) ? 'river' : t.class === 'stream' ? 'stream' : null;
      case 'landcover':
        return type === 3 && (t.class === 'wood' || (t.class === 'grass' && t.subclass !== 'scrub')) ? 'green' : null;
      case 'landuse':
        return type === 3 && /^(cemetery|pitch|playground)$/.test(t.class) ? 'green' : null;
      case 'park':
        return type === 3 && /^(park|garden)$/.test(t.class) ? 'green' : null;
    }
    return null;
  }

  const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
  const lat2y = (lat, z) => {
    const r = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
  };
  function tileRange([s, w, n, e], z) {
    const x0 = Math.floor(lon2x(w, z)), x1 = Math.floor(lon2x(e, z));
    const y0 = Math.floor(lat2y(n, z)), y1 = Math.floor(lat2y(s, z));
    return { x0, x1, y0, y1, count: (x1 - x0 + 1) * (y1 - y0 + 1) };
  }

  async function fetchTiles(bbox, onStatus, signal) {
    if (!tileTemplate) {
      onStatus && onStatus('Contacting the tile server…');
      const res = await fetch(TILEJSON, { signal });
      if (!res.ok) throw new Error('tile index HTTP ' + res.status);
      tileTemplate = (await res.json()).tiles[0];
    }
    let z = 14, range = tileRange(bbox, z);
    while (range.count > MAX_TILES && z > 10) range = tileRange(bbox, --z); // lower zooms are pre-generalised
    if (range.count > MAX_TILES) throw new Error('The visible area is too large. Zoom in first.');

    const jobs = [];
    for (let x = range.x0; x <= range.x1; x++) for (let y = range.y0; y <= range.y1; y++) jobs.push([x, y]);
    const r5 = (n) => Math.round(n * 1e5) / 1e5;
    const features = [];
    let done = 0;
    const worker = async () => {
      while (jobs.length) {
        const [tx, ty] = jobs.shift();
        const res = await fetch(tileTemplate.replace('{z}', z).replace('{x}', tx).replace('{y}', ty), { signal });
        if (res.status === 204 || res.status === 404) { done++; continue; } // empty tile
        if (!res.ok) throw new Error('tile HTTP ' + res.status);
        const layers = MV.mvt.decode(new Uint8Array(await res.arrayBuffer()), TILE_LAYERS);
        for (const [name, L] of Object.entries(layers)) {
          const toLL = ([px, py]) => {
            const X = (tx + px / L.extent) / 2 ** z, Y = (ty + py / L.extent) / 2 ** z;
            return [r5((Math.atan(Math.sinh(Math.PI * (1 - 2 * Y))) * 180) / Math.PI), r5(X * 360 - 180)];
          };
          for (const f of L.features) {
            const c = classifyTile(name, f.tags, f.type);
            if (c && f.parts.length) features.push({ c, g: f.parts.map((part) => part.map(toLL)) });
          }
        }
        onStatus && onStatus(`Downloading map tiles… ${++done}/${range.count}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, range.count) }, worker));
    return { id: 'omt-' + Date.now().toString(36), source: 'omt', credit: TILE_CREDIT, bbox, features };
  }

  // Vector tiles first; Overpass (live OSM queries) only if the tile server fails.
  async function fetchBasemap(bbox, onStatus, signal) {
    try {
      return await fetchTiles(bbox, onStatus, signal);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      onStatus && onStatus('Tile server failed (' + err.message + '), trying Overpass…');
      try {
        return await fetchOSM(bbox, onStatus, signal);
      } catch (err2) {
        if (err2.name === 'AbortError') throw err2;
        throw new Error('Tile server: ' + err.message + '. ' + err2.message);
      }
    }
  }

  // GeoJSON basemap: OSM-style tags in properties (or properties.tags). Unknown lines draw as streets.
  function fromGeoJSON(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { throw new Error('This file is not valid JSON.'); }
    const features = [];
    const ll = (c) => [r6(c[1]), r6(c[0])];
    const add = (geom, tags) => {
      if (!geom) return;
      const t = geom.type, k = classify(tags);
      if (t === 'LineString') features.push({ c: k && !isArea(k) ? k : 'mid', g: [geom.coordinates.map(ll)] });
      else if (t === 'MultiLineString') features.push({ c: k && !isArea(k) ? k : 'mid', g: geom.coordinates.map((l) => l.map(ll)) });
      else if (t === 'Polygon') features.push({ c: k && isArea(k) ? k : 'green', g: geom.coordinates.map((r) => r.map(ll)) });
      else if (t === 'MultiPolygon') geom.coordinates.forEach((poly) => features.push({ c: k && isArea(k) ? k : 'green', g: poly.map((r) => r.map(ll)) }));
      else if (t === 'GeometryCollection') (geom.geometries || []).forEach((g) => add(g, tags));
    };
    const list = d.type === 'FeatureCollection' ? d.features || [] : d.type === 'Feature' ? [d] : [{ geometry: d, properties: {} }];
    list.forEach((f) => {
      const p = f.properties || {};
      add(f.geometry, p.tags && typeof p.tags === 'object' ? p.tags : p);
    });
    if (!features.length) throw new Error('No lines or polygons found in this GeoJSON.');
    const pts = [];
    features.forEach((f) => f.g.forEach((l) => l.forEach((p) => pts.push(p))));
    return { id: 'geojson-' + Date.now().toString(36), source: 'geojson', bbox: MV.geo.bbox(pts), features };
  }

  let cache = { key: '', svg: '' };

  function render(data, proj, bs, W, H, view) {
    const { fmt, linePath } = MV.geo;
    const esc = MV.esc;
    const key = [data.id, view.lat, view.lon, view.zoom, view.rotation, W, H, JSON.stringify(bs)].join('|');
    if (cache.key === key) return cache.svg;

    const enabled = {
      major: true, mid: true, minor: bs.minor, rail: bs.rail,
      water: bs.water, river: bs.water, stream: bs.water, green: bs.parks,
    };
    const groups = { green: [], water: [], river: [], stream: [], rail: [], minor: [], mid: [], major: [] };
    const pad = 6;
    for (const f of data.features) {
      if (!enabled[f.c]) continue;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      const parts = f.g.map((line) => line.map((p) => {
        const q = proj.project(p[0], p[1]);
        if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
        if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
        return q;
      }));
      if (x1 < -pad || y1 < -pad || x0 > W + pad || y0 > H + pad) continue;
      const close = isArea(f.c) ? 'Z' : '';
      groups[f.c].push(parts.map((pts) => linePath(pts) + close).join(''));
    }

    const w = bs.roadWidth, z = view.zoom;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const stroke = (ds, color, width, extra = '', cap = 'round') => ds.length
      ? `<path d="${ds.join('')}" fill="none" stroke="${esc(color)}" stroke-width="${fmt(width)}" stroke-linecap="${cap}" stroke-linejoin="round"${extra}/>`
      : '';
    const fill = (ds, color) => ds.length
      ? `<g fill="${esc(color)}" fill-rule="evenodd" stroke="none">${ds.map((d) => `<path d="${d}"/>`).join('')}</g>`
      : '';

    let out = '';
    out += fill(groups.green, bs.parkColor);
    out += stroke(groups.river, bs.waterColor, clamp(25 * z, 0.5, 4));
    out += stroke(groups.stream, bs.waterColor, clamp(4 * z, 0.2, 0.8));
    out += fill(groups.water, bs.waterColor);
    out += stroke(groups.rail, bs.railColor, w * 0.8, ` stroke-dasharray="${fmt(w * 5)} ${fmt(w * 3)}"`, 'butt');
    out += stroke(groups.minor, bs.roads, w * 0.55, bs.minorDash ? ` stroke-dasharray="${fmt(w * 1.6)} ${fmt(w * 2.4)}"` : '');
    out += stroke(groups.mid, bs.roads, w);
    out += stroke(groups.major, bs.roads, w * bs.majorScale);
    const svg = out ? `<g clip-path="url(#mv-clip)" opacity="${fmt(bs.opacity)}">${out}</g>` : '';
    cache = { key, svg };
    return svg;
  }

  MV.basemap = { fetchBasemap, fetchTiles, fetchOSM, fromGeoJSON, render, classify, stitch };
})();
