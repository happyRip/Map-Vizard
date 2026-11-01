/* Map Vizard — defaults, themes, app state, persistence and undo history. */
(function () {
  'use strict';
  const MV = (window.MV = window.MV || {});

  MV.PT = 0.3527778; // millimetres per typographic point

  MV.PAGE_SIZES = {
    A6: [105, 148],
    A5: [148, 210],
    A4: [210, 297],
    A3: [297, 420],
    'Half Letter': [139.7, 215.9],
    Letter: [215.9, 279.4],
    Square: [180, 180],
  };

  MV.FONTS = {
    grotesk: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    geometric: "Futura, 'Century Gothic', 'Avenir Next', Avenir, sans-serif",
    serif: "Georgia, 'Times New Roman', Times, serif",
    mono: "'Courier New', Courier, monospace",
    condensed: "'Arial Narrow', 'Helvetica Neue Condensed', 'Roboto Condensed', sans-serif",
  };

  // Every length is in millimetres on the printed page; type sizes are in points.
  // --- map language: text the app itself puts on the page (user-typed text is left alone) ---
  MV.LANGS = [['en', 'English'], ['pl', 'Polski']];
  MV.I18N = {
    en: { title: 'Photowalk', docTitle: 'Route map', osm: 'OpenStreetMap contributors', decimal: '.' },
    pl: { title: 'Spacer fotograficzny', docTitle: 'Mapa trasy', osm: 'autorzy OpenStreetMap', decimal: ',' },
  };
  MV.t = (key, lang) => (MV.I18N[lang] || MV.I18N.en)[key];
  MV.defaultLang = function () {
    const nav = (typeof navigator !== 'undefined' && navigator.language) || '';
    const code = nav.slice(0, 2).toLowerCase();
    return MV.I18N[code] ? code : 'en';
  };
  // Number with the language's decimal separator.
  MV.num = (n, digits, lang) => {
    const s = digits == null ? String(n) : n.toFixed(digits);
    return MV.t('decimal', lang) === '.' ? s : s.replace('.', MV.t('decimal', lang));
  };

  MV.DEFAULT_STYLE = {
    page: { size: 'A5', orientation: 'portrait', widthMm: 148, heightMm: 210, dpi: 300, margin: 12, inset: 0 },
    background: {
      type: 'solid', color: '#f3eee4', color2: '#e2d9c8', angle: 160,
      pattern: 'none', patternColor: '#d6ccbb', patternSpacing: 5,
    },
    basemap: {
      show: true, opacity: 1, roads: '#cdc4b4', roadWidth: 0.3, majorScale: 2.2,
      minor: true, minorDash: false, rail: true, railColor: '#bcb2a2',
      water: true, waterColor: '#d2dde0', parks: true, parkColor: '#e0e2cd',
    },
    route: {
      color: '#e4572e', width: 1.6, opacity: 1, dash: 'solid', cap: 'round', join: 'round',
      simplify: 0.3, smooth: true, halo: true, haloMatch: true, haloColor: '#f3eee4', haloWidth: 0.9,
      arrows: false, arrowSpacing: 20,
    },
    markers: {
      start: 'dot', end: 'ring', size: 3.4, matchRoute: true, startColor: '#e4572e', endColor: '#e4572e',
      stops: true, stopSize: 4, stopColor: '#1c1b19', stopText: '#ffffff', stopNames: true, stopNameSize: 7,
    },
    labels: {
      show: true, lang: MV.defaultLang(), position: 'top-left', reserve: true, font: 'grotesk', customFont: '', color: '#1c1b19',
      titleSize: 24, titleWeight: 700, allCaps: false, tracking: 0.02, metaSize: 8.5,
      showDistance: true, units: 'km', outline: true, plate: false, plateMatch: true, plateColor: '#f3eee4', plateOpacity: 0.9,
    },
    extras: {
      border: false, borderColor: '#1c1b19', borderWidth: 0.4,
      northArrow: false, scaleBar: false, color: '#1c1b19', credit: true,
    },
  };

  MV.DEFAULT_CONTENT = { title: MV.t('title', MV.defaultLang()), date: '', area: '', notes: '' };
  MV.DEFAULT_VIEW = { lat: 51.1085, lon: 17.033, zoom: 0.04, rotation: 0, auto: true };

  // Built-in house styles. Each is applied over the defaults; page settings are kept.
  MV.THEMES = {
    paper: { label: 'Paper', style: {} },
    ink: {
      label: 'Ink',
      style: {
        background: { color: '#ffffff' },
        basemap: { roads: '#d2d2d2', railColor: '#bdbdbd', waterColor: '#ececec', parkColor: '#f2f2f2' },
        route: { color: '#111111' },
        markers: { stopColor: '#111111', stopText: '#ffffff' },
        labels: { color: '#111111' },
        extras: { color: '#111111', borderColor: '#111111' },
      },
    },
    riso: {
      label: 'Riso pink + blue',
      style: {
        background: { color: '#f6f1e7' },
        basemap: { roads: '#9cc3e0', railColor: '#9cc3e0', waterColor: '#cfe2f0', parkColor: '#e5edf0' },
        route: { color: '#ff48b0', width: 1.8 },
        markers: { stopColor: '#0078bf', stopText: '#f6f1e7' },
        labels: { color: '#0078bf', font: 'mono', titleWeight: 700 },
        extras: { color: '#0078bf', borderColor: '#0078bf' },
      },
    },
    blueprint: {
      label: 'Blueprint',
      style: {
        background: { color: '#1f3a5f', pattern: 'grid', patternColor: '#2b4a73', patternSpacing: 5 },
        basemap: { roads: '#5b7ea8', railColor: '#5b7ea8', waterColor: '#2a4c78', parkColor: '#244469' },
        route: { color: '#ffffff' },
        markers: { stopColor: '#ffffff', stopText: '#1f3a5f' },
        labels: { color: '#ffffff', font: 'condensed' },
        extras: { color: '#ffffff', borderColor: '#ffffff' },
      },
    },
    night: {
      label: 'Night',
      style: {
        background: { color: '#151515' },
        basemap: { roads: '#3a3a3a', railColor: '#474747', waterColor: '#1d2a33', parkColor: '#1b241b' },
        route: { color: '#ffd23f' },
        markers: { stopColor: '#ffd23f', stopText: '#151515' },
        labels: { color: '#f0f0f0' },
        extras: { color: '#f0f0f0', borderColor: '#f0f0f0' },
      },
    },
    abstract: {
      label: 'Abstract (no basemap)',
      style: {
        background: { color: '#efebe3', pattern: 'dots', patternColor: '#c9c1b2', patternSpacing: 4 },
        basemap: { show: false },
        route: { color: '#1c1b19', width: 2.4 },
        markers: { stopColor: '#e4572e', stopText: '#ffffff' },
        labels: { color: '#1c1b19', font: 'geometric' },
      },
    },
  };

  MV.clone = (o) => JSON.parse(JSON.stringify(o));

  // Deep-merge `over` into `base`, keeping only keys (and value types) that `base` knows about.
  MV.merge = function merge(base, over) {
    if (!over || typeof over !== 'object') return base;
    for (const k of Object.keys(base)) {
      if (!(k in over)) continue;
      const b = base[k], o = over[k];
      if (b && typeof b === 'object' && !Array.isArray(b)) merge(b, o);
      else if (typeof o === typeof b) base[k] = o;
    }
    return base;
  };

  MV.getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  MV.setPath = (o, p, v) => {
    const ks = p.split('.'), last = ks.pop();
    ks.reduce((a, k) => a[k], o)[last] = v;
  };

  MV.pageDims = function (style) {
    const p = style.page;
    let [w, h] = p.size === 'Custom' ? [p.widthMm, p.heightMm] : MV.PAGE_SIZES[p.size] || MV.PAGE_SIZES.A5;
    if (p.size !== 'Custom' && p.orientation === 'landscape') [w, h] = [h, w];
    return [Math.max(20, w), Math.max(20, h)];
  };
  MV.pixelDims = (style) => MV.pageDims(style).map((mm) => Math.round((mm / 25.4) * style.page.dpi));

  // --- tiny event bus ---
  const listeners = {};
  MV.on = (evt, fn) => (listeners[evt] = listeners[evt] || []).push(fn);
  MV.emit = (evt, data) => (listeners[evt] || []).forEach((fn) => fn(data));

  MV.state = {
    style: MV.clone(MV.DEFAULT_STYLE),
    content: MV.clone(MV.DEFAULT_CONTENT),
    route: [], // [[lat, lon], ...]
    stops: [], // [{ lat, lon, name }]
    view: MV.clone(MV.DEFAULT_VIEW),
    routeName: '',
    basemap: null, // { id, source, bbox, features } — kept out of history
  };
  MV.tool = 'pan';

  const SNAP_KEYS = ['style', 'content', 'route', 'stops', 'view', 'routeName'];
  function snapshot() {
    const s = {};
    SNAP_KEYS.forEach((k) => (s[k] = MV.state[k]));
    return s;
  }

  MV.snapshot = () => MV.clone(snapshot());

  MV.applySnapshot = function (s) {
    const st = MV.state;
    st.style = MV.merge(MV.clone(MV.DEFAULT_STYLE), s.style);
    st.content = MV.merge(MV.clone(MV.DEFAULT_CONTENT), s.content);
    st.view = MV.merge(MV.clone(MV.DEFAULT_VIEW), s.view);
    st.route = Array.isArray(s.route) ? s.route : [];
    st.stops = Array.isArray(s.stops) ? s.stops : [];
    st.routeName = typeof s.routeName === 'string' ? s.routeName : '';
  };

  // --- persistence (localStorage; failures are non-fatal) ---
  const KEY = 'mapvizard:v1';
  const BASEMAP_KEY = 'mapvizard:v1:basemap';

  MV.persist = function () {
    try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (e) { /* storage full or blocked */ }
  };
  let persistTimer;
  MV.persistSoon = function () {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(MV.persist, 400);
  };
  MV.restoreSaved = function () {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { MV.applySnapshot(JSON.parse(raw)); return true; }
    } catch (e) { /* ignore corrupt state */ }
    return false;
  };
  MV.persistBasemap = function () {
    try {
      if (MV.state.basemap) localStorage.setItem(BASEMAP_KEY, JSON.stringify(MV.state.basemap));
      else localStorage.removeItem(BASEMAP_KEY);
      return true;
    } catch (e) {
      try { localStorage.removeItem(BASEMAP_KEY); } catch (e2) { /* ignore */ }
      return false;
    }
  };
  MV.restoreBasemap = function () {
    try {
      const raw = localStorage.getItem(BASEMAP_KEY);
      if (raw) MV.state.basemap = JSON.parse(raw);
    } catch (e) { /* ignore */ }
  };

  // --- undo history: whole-state snapshots, pushed at commit points ---
  const hist = { stack: [], i: -1 };
  MV.commit = function () {
    const s = JSON.stringify(snapshot());
    if (hist.stack[hist.i] === s) return;
    hist.stack.splice(hist.i + 1);
    hist.stack.push(s);
    if (hist.stack.length > 100) hist.stack.shift();
    hist.i = hist.stack.length - 1;
    MV.persist();
    MV.emit('history');
  };
  let commitTimer;
  MV.commitSoon = function () {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(MV.commit, 350);
  };
  MV.canUndo = () => hist.i > 0;
  MV.canRedo = () => hist.i < hist.stack.length - 1;
  function go(delta) {
    const j = hist.i + delta;
    if (j < 0 || j >= hist.stack.length) return;
    hist.i = j;
    MV.applySnapshot(JSON.parse(hist.stack[j]));
    MV.persist();
    MV.emit('restore');
    MV.emit('history');
  }
  MV.undo = () => go(-1);
  MV.redo = () => go(1);
})();
