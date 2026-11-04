/* Map Vizard — app wiring: preview rendering, actions, file handling, keyboard shortcuts. */
(function () {
  'use strict';
  const MV = window.MV;
  const $ = (sel) => document.querySelector(sel);
  const st = MV.state;

  // --- toast ---
  let toastTimer;
  MV.toast = function (msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), kind ? 8000 : 3000);
  };

  // --- preview ---
  const layerEls = {}, layerCache = {};
  let pending = false, lastDims = '';

  MV.requestRender = function () {
    if (pending) return;
    pending = true;
    requestAnimationFrame(draw);
  };

  function layoutPaper() {
    const stage = $('#stage'), paper = $('#paper');
    if (!MV.scene) return;
    const pad = 36;
    const k = Math.max(0.05, Math.min((stage.clientWidth - pad * 2) / MV.scene.W, (stage.clientHeight - pad * 2) / MV.scene.H));
    paper.style.width = MV.scene.W * k + 'px';
    paper.style.height = MV.scene.H * k + 'px';
  }

  function draw() {
    pending = false;
    let scene;
    try {
      scene = MV.render(st);
    } catch (err) {
      console.error(err);
      MV.toast('Render error: ' + err.message, 'error');
      return;
    }
    MV.scene = scene;
    const dims = scene.W + 'x' + scene.H;
    if (dims !== lastDims) {
      lastDims = dims;
      const vb = `0 0 ${scene.W} ${scene.H}`;
      $('#scene').setAttribute('viewBox', vb);
      $('#overlay').setAttribute('viewBox', vb);
      layoutPaper();
    }
    for (const k of ['defs', ...MV.LAYER_ORDER]) {
      if (layerCache[k] !== scene.layers[k]) {
        layerCache[k] = scene.layers[k];
        layerEls[k].innerHTML = scene.layers[k];
      }
    }
    MV.renderOverlay();
    updateChrome(scene);
    MV.emit('rendered', scene);
  }

  const HINTS = {
    pan: 'Drag to pan · scroll to zoom · F to fit',
    edit: 'Drag points to move · click the line to add a point · Alt-click or double-click a point to delete',
    draw: 'Click to add points to the end of the route · drag to pan · Backspace removes the last point',
    stops: 'Click to add a numbered stop · drag to move · Alt-click to delete',
  };

  function updateChrome(scene) {
    const [pw, ph] = MV.pixelDims(st.style);
    const scale = Math.round(1000 / st.view.zoom);
    $('#status').textContent = [
      st.route.length ? `${st.route.length.toLocaleString()} pts` : 'no route',
      scene.distText,
      `1:${scale.toLocaleString()}`,
      `${scene.W}×${scene.H} mm`,
      `${pw}×${ph} px @ ${st.style.page.dpi} dpi`,
    ].filter(Boolean).join('  ·  ');
    $('#empty').hidden = st.route.length > 0 || st.stops.length > 0 || MV.tool === 'draw';
    document.querySelectorAll('.toolbar [data-action="fit"]').forEach((b) => b.classList.toggle('outline', !st.view.auto));
    let hint = HINTS[MV.tool];
    if (MV.tool === 'edit' && MV.tooManyHandles()) hint = 'Too many points to edit by hand. Use Start → More options → Simplify points first.';
    $('#hint').textContent = hint;
  }

  MV.setTool = function (tool) {
    MV.tool = tool;
    document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('outline', b.dataset.tool !== tool));
    $('#paper').className = 'paper tool-' + tool;
    MV.requestRender();
  };

  function updateHistoryButtons() {
    $('[data-action="undo"]').disabled = !MV.canUndo();
    $('[data-action="redo"]').disabled = !MV.canRedo();
  }

  // --- route loading ---
  function bboxOverlaps(a, b) {
    return a && b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  }

  MV.loadRoute = function (r, fallbackName) {
    const prevName = st.routeName;
    st.route = r.route;
    st.stops = r.stops || [];
    st.routeName = r.name || fallbackName || '';
    const t = st.content.title.trim();
    if (st.routeName && (!t || MV.isDefaultTitle(t) || t === prevName)) st.content.title = st.routeName;
    st.view.auto = true;
    const rb = MV.geo.bbox(st.route.concat(st.stops.map((p) => [p.lat, p.lon])));
    if (st.basemap && !bboxOverlaps(st.basemap.bbox, rb)) {
      st.basemap = null;
      MV.persistBasemap();
      setBasemapStatus();
    }
    MV.syncAll();
    MV.renderStops();
    MV.requestRender();
    MV.commit();
    MV.toast(`Loaded ${r.route.length.toLocaleString()} points${st.stops.length ? ` and ${st.stops.length} stops` : ''}.`);
  };

  // A Map Vizard file of the given kind ('preset' or 'project'), or null.
  function parseMVFile(text, kind) {
    try {
      const d = JSON.parse(text);
      return d && d.app === 'map-vizard' && d.kind === kind && d.style ? d : null;
    } catch (e) {
      return null;
    }
  }
  const parsePreset = (text) => parseMVFile(text, 'preset');
  const parseProject = (text) => parseMVFile(text, 'project');

  function fontsChanged() {
    MV.syncAll();
    MV.emit('fonts');
    MV.requestRender();
    MV.commit();
  }

  async function applyPreset(d) {
    if (d.fonts && Object.keys(d.fonts).length) {
      await MV.fonts.load(d.fonts);
      if (!MV.fonts.persist()) MV.toast('Preset fonts loaded, but too large to cache in this browser.', 'warn');
      MV.emit('fonts');
    }
    st.style = MV.merge(MV.clone(MV.DEFAULT_STYLE), d.style);
    st.view.auto = st.view.auto || !!st.route.length;
    MV.localizeContent(st.style.labels.lang);
    MV.syncAll();
    MV.renderStops();
    MV.requestRender();
    MV.commit();
    MV.toast('House style loaded.');
  }

  async function applyProject(d) {
    if (d.fonts && Object.keys(d.fonts).length) {
      await MV.fonts.load(d.fonts);
      if (!MV.fonts.persist()) MV.toast('Project fonts loaded, but too large to cache in this browser.', 'warn');
      MV.emit('fonts');
    }
    MV.applySnapshot(d);
    st.basemap = d.basemap && Array.isArray(d.basemap.features) ? d.basemap : null;
    if (!MV.persistBasemap()) MV.toast('Basemap loaded, but too large to keep in this browser after a reload.', 'warn');
    setBasemapStatus();
    MV.syncAll();
    MV.renderStops();
    MV.requestRender();
    MV.commit();
    MV.toast('Project opened.');
  }

  async function importFile(file) {
    try {
      const text = await file.text();
      const project = parseProject(text);
      if (project) return applyProject(project);
      const preset = parsePreset(text);
      if (preset) return applyPreset(preset);
      MV.loadRoute(MV.parse.file(file.name, text), file.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      MV.toast(`${file.name}: ${err.message}`, 'error');
    }
  }

  // --- basemap ---
  function setBasemapStatus(msg) {
    const el = $('#basemap-status');
    if (msg) { el.textContent = msg; return; }
    const b = st.basemap;
    el.textContent = b
      ? `Added from ${{ omt: 'OpenStreetMap', osm: 'OpenStreetMap' }[b.source] || 'your GeoJSON file'}. Moved the map somewhere new? Update them.`
      : 'Draws the streets, rivers and parks around your route.';
    if (!fetchCtl) document.querySelectorAll('[data-action="fetch-basemap"]').forEach((btn) => (btn.textContent = b ? 'Update streets' : 'Add streets'));
  }

  function viewBBox(padFrac) {
    const [W, H] = MV.pageDims(st.style);
    const P = MV.geo.projection(st.view, W, H);
    const pts = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => P.unproject(x, y));
    const [s, w, n, e] = MV.geo.bbox(pts);
    const dl = (n - s) * padFrac, dw = (e - w) * padFrac;
    return [s - dl, w - dw, n + dl, e + dw].map((v) => Math.round(v * 1e5) / 1e5);
  }

  let fetchCtl = null;
  async function fetchBasemap(btn) {
    if (fetchCtl) { fetchCtl.abort(); return; } // the button doubles as Cancel while fetching
    fetchCtl = new AbortController();
    btn.textContent = 'Cancel';
    try {
      const data = await MV.basemap.fetchBasemap(viewBBox(0.1), setBasemapStatus, fetchCtl.signal);
      if (!data.features.length) throw new Error('OpenStreetMap returned nothing for this area.');
      st.basemap = data;
      st.style.basemap.show = true;
      const cached = MV.persistBasemap();
      if (!cached) MV.toast('Streets added, but too large to keep in this browser. Add them again after a reload.');
      MV.syncAll();
      MV.requestRender();
      MV.commit();
    } catch (err) {
      setBasemapStatus();
      if (err.name === 'AbortError') MV.toast('Streets download cancelled.');
      else MV.toast('Streets: ' + err.message, 'error');
    } finally {
      fetchCtl = null;
      setBasemapStatus();
    }
  }

  async function findPlace(q) {
    try {
      const res = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=' + st.style.labels.lang + '&q=' + encodeURIComponent(q));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const [hit] = await res.json();
      if (!hit) { MV.toast('No place found for “' + q + '”.', 'error'); return; }
      st.view.lat = +hit.lat;
      st.view.lon = +hit.lon;
      st.view.auto = false;
      if (!st.route.length) st.view.zoom = MV.DEFAULT_VIEW.zoom;
      if (!st.content.area.trim() && hit.name) st.content.area = hit.name;
      MV.syncAll();
      MV.requestRender();
      MV.commit();
      MV.toast('Centred on ' + (hit.display_name || q).split(',').slice(0, 2).join(','));
    } catch (err) {
      MV.toast('Place search failed: ' + err.message, 'error');
    }
  }

  // --- actions ---
  const actions = {
    sample() {
      const s = MV.sample(st.style.labels.lang);
      if (!st.content.area.trim()) st.content.area = s.area;
      MV.loadRoute({ route: s.route.map((p) => p.slice()), stops: s.stops.map((p) => ({ ...p })), name: s.name });
    },
    reverse() {
      if (st.route.length < 2) return;
      st.route.reverse();
      MV.requestRender();
      MV.commit();
    },
    bake() {
      if (st.route.length < 3) return;
      const [W, H] = MV.pageDims(st.style);
      const P = MV.geo.projection(st.view, W, H);
      const tol = Math.max(st.style.route.simplify, 0.3);
      const before = st.route.length;
      const pts = st.route.map((p, i) => [...P.project(p[0], p[1]), i]);
      const pins = st.stops.map((p) => MV.geo.nearestVertex(pts, P.project(p.lat, p.lon)));
      const kept = MV.geo.simplify(pts, tol, pins);
      st.route = kept.map((p) => st.route[p[2]]);
      MV.requestRender();
      MV.commit();
      MV.toast(`Simplified ${before.toLocaleString()} → ${st.route.length.toLocaleString()} points (${tol} mm tolerance).`);
    },
    'save-route'() {
      if (!st.route.length && !st.stops.length) return MV.toast('Nothing to save yet.', 'error');
      MV.exportRoute();
    },
    'clear-route'() {
      st.route = [];
      st.stops = [];
      st.routeName = '';
      MV.renderStops();
      MV.requestRender();
      MV.commit();
    },
    fit() {
      st.view.auto = true;
      MV.requestRender();
      MV.commitSoon();
    },
    'zoom-in'() { const [W, H] = MV.pageDims(st.style); MV.zoomAt([W / 2, H / 2], 1.25); },
    'zoom-out'() { const [W, H] = MV.pageDims(st.style); MV.zoomAt([W / 2, H / 2], 0.8); },
    undo: () => MV.undo(),
    redo: () => MV.redo(),
    'export-svg'() {
      try {
        const scene = MV.exportSVG();
        if (scene.liveText) {
          const fam = scene.family.split(',')[0].replace(/'/g, '');
          MV.toast(`SVG saved with live text in “${fam}”. It only looks right where that font is installed — load the font file (Words → More options) to export outlines.`, 'warn');
        }
      } catch (err) {
        MV.toast('SVG export failed: ' + err.message, 'error');
      }
    },
    async 'export-png'(btn) {
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = 'Rendering…';
      try { await MV.exportPNG(); } catch (err) { MV.toast('PNG export failed: ' + err.message, 'error'); }
      btn.disabled = false;
      btn.textContent = label;
    },
    'fetch-basemap': fetchBasemap,
    'import-basemap'() { $('#file-basemap').click(); },
    'clear-basemap'() {
      st.basemap = null;
      MV.persistBasemap();
      setBasemapStatus();
      MV.requestRender();
    },
    'apply-theme'(btn) {
      if (!MV.THEMES[btn.dataset.theme]) return;
      st.style = MV.themedStyle(btn.dataset.theme);
      MV.syncAll();
      MV.requestRender();
      MV.commit();
    },
    'save-preset'() { MV.exportPreset(); },
    'save-project'() { MV.exportProject($('#project-basemap').checked); },
    'open-project'() { $('#file-project').click(); },
    'load-font'(btn) {
      const input = $('#file-font');
      input.dataset.slot = btn.dataset.slot;
      input.click();
    },
    'remove-font'(btn) {
      MV.fonts.remove(btn.dataset.slot);
      MV.fonts.persist();
      if (!MV.fonts.available() && st.style.labels.font === 'file') st.style.labels.font = 'grotesk';
      fontsChanged();
    },
    'load-preset'() { $('#file-preset').click(); },
    'reset-style'() {
      const lang = st.style.labels.lang; // language isn't a style; keep it
      st.style = MV.clone(MV.DEFAULT_STYLE);
      st.style.labels.lang = lang;
      st.view.rotation = 0;
      st.view.auto = true;
      MV.syncAll();
      MV.requestRender();
      MV.commit();
      MV.toast('Look and framing reset. Undo (⌘Z) to go back.');
    },
  };

  function bindEvents() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (b && actions[b.dataset.action]) { e.preventDefault(); actions[b.dataset.action](b); }
      const t = e.target.closest('[data-tool]');
      if (t) MV.setTool(t.dataset.tool);
    });

    $('#file-route').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; });
    $('#file-preset').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const d = parsePreset(await f.text());
      d ? applyPreset(d) : MV.toast('That file is not a Map Vizard preset.', 'error');
    });
    $('#file-project').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const d = parseProject(await f.text());
      d ? applyProject(d) : MV.toast('That file is not a Map Vizard project.', 'error');
    });
    $('#file-basemap').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        st.basemap = MV.basemap.fromGeoJSON(await f.text());
        st.style.basemap.show = true;
        MV.persistBasemap();
        setBasemapStatus();
        MV.syncAll();
        MV.requestRender();
      } catch (err) {
        MV.toast(`${f.name}: ${err.message}`, 'error');
      }
    });
    $('#file-font').addEventListener('change', async (e) => {
      const f = e.target.files[0], slot = e.target.dataset.slot || 'regular';
      e.target.value = '';
      if (!f) return;
      try {
        await MV.fonts.install(slot, await f.arrayBuffer(), f.name);
        st.style.labels.font = 'file';
        if (!MV.fonts.persist()) MV.toast('Font loaded, but too large to cache — reload it next session.', 'warn');
        else MV.toast(`Loaded ${MV.fonts.describe(slot)}. Exported text will be outlined.`);
        fontsChanged();
      } catch (err) {
        MV.toast(`${f.name}: ${err.message}`, 'error');
      }
    });
    $('#place-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#place-q').value.trim();
      if (q) findPlace(q);
    });

    // drag & drop anywhere
    let depth = 0;
    window.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; document.body.classList.add('dragging'); });
    window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('dragging'); } });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      document.body.classList.remove('dragging');
      const f = e.dataTransfer.files[0];
      if (f) importFile(f);
    });

    document.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      const typing = (tag === 'INPUT' && !/^(range|checkbox|color|button)$/.test(e.target.type)) || tag === 'TEXTAREA' || tag === 'SELECT';
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && (key === 's' || key === 'o') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        actions[key === 's' ? 'save-project' : 'open-project']();
        return;
      }
      if (mod && !typing && (key === 'z' || key === 'y')) {
        e.preventDefault();
        if (key === 'y' || e.shiftKey) MV.redo(); else MV.undo();
        return;
      }
      if (typing || mod || e.altKey) return;
      const tools = { v: 'pan', h: 'pan', escape: 'pan', e: 'edit', d: 'draw', s: 'stops' };
      if (tools[key]) MV.setTool(tools[key]);
      else if (key === 'f') actions.fit();
      else if (key === '=' || key === '+') actions['zoom-in']();
      else if (key === '-') actions['zoom-out']();
      else if ((key === 'backspace' || key === 'delete') && MV.tool === 'draw' && st.route.length) {
        e.preventDefault();
        st.route.pop();
        MV.requestRender();
        MV.commit();
      }
    });

    new ResizeObserver(() => { layoutPaper(); MV.renderOverlay(); }).observe($('#stage'));
    MV.on('history', updateHistoryButtons);
  }

  async function init() {
    MV.restoreSaved();
    MV.localizeContent(MV.state.style.labels.lang);
    MV.restoreBasemap();
    await MV.fonts.restore();
    for (const k of ['defs', ...MV.LAYER_ORDER]) layerEls[k] = document.getElementById('L-' + k);
    MV.initUI();
    MV.initInteract($('#overlay'));
    bindEvents();
    setBasemapStatus();
    MV.setTool('pan');
    MV.commit();
    updateHistoryButtons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
