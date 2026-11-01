/* Map Vizard — sidebar controls, generated from a field schema and bound to MV.state. */
(function () {
  'use strict';
  const MV = (window.MV = window.MV || {});

  const custom = (s) => s.style.page.size === 'Custom';
  const FIELDS = {
    page: [
      { k: 'style.page.size', t: 'select', l: 'Page size', o: [...Object.keys(MV.PAGE_SIZES), 'Custom'].map((v) => [v, v === 'Square' ? 'Square 180 mm' : v]) },
      { k: 'style.page.orientation', t: 'seg', l: 'Orientation', o: [['portrait', 'Portrait'], ['landscape', 'Landscape']], when: (s) => !custom(s) },
      { k: 'style.page.widthMm', t: 'number', l: 'Width', u: 'mm', min: 20, max: 1200, when: custom },
      { k: 'style.page.heightMm', t: 'number', l: 'Height', u: 'mm', min: 20, max: 1200, when: custom },
      { k: 'style.page.dpi', t: 'seg', l: 'PNG resolution', o: [[150, '150 dpi'], [300, '300 dpi'], [600, '600 dpi']] },
      { k: 'style.page.margin', t: 'range', l: 'Margin', min: 0, max: 40, step: 0.5, u: 'mm' },
      { k: 'style.page.inset', t: 'range', l: 'Map inset', min: 0, max: 30, step: 0.5, u: 'mm', hint: 'Keeps the basemap off the page edge (0 = full bleed).' },
      { k: 'view.rotation', t: 'range', l: 'Rotation', min: -180, max: 180, step: 1, u: '°', reset: 0 },
    ],
    line: [
      { k: 'style.route.color', t: 'color', l: 'Colour' },
      { k: 'style.route.width', t: 'range', l: 'Weight', min: 0.2, max: 6, step: 0.1, u: 'mm' },
      { k: 'style.route.opacity', t: 'range', l: 'Opacity', min: 0.1, max: 1, step: 0.05, pct: true },
      { k: 'style.route.dash', t: 'seg', l: 'Line', o: [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']] },
      { k: 'style.route.cap', t: 'seg', l: 'Ends', o: [['round', 'Round'], ['square', 'Square'], ['butt', 'Flat']] },
      { k: 'style.route.join', t: 'seg', l: 'Corners', o: [['round', 'Round'], ['miter', 'Sharp'], ['bevel', 'Bevel']] },
      { k: 'style.route.smooth', t: 'check', l: 'Smooth curves' },
      { k: 'style.route.simplify', t: 'range', l: 'Simplify', min: 0, max: 2, step: 0.05, u: 'mm', hint: 'Irons out GPS jitter smaller than this on the page.' },
      { k: 'style.route.halo', t: 'check', l: 'Halo (knock-out outline)' },
      { k: 'style.route.haloWidth', t: 'range', l: 'Halo width', min: 0.1, max: 4, step: 0.1, u: 'mm', when: (s) => s.style.route.halo },
      { k: 'style.route.haloMatch', t: 'check', l: 'Halo uses background colour', when: (s) => s.style.route.halo },
      { k: 'style.route.haloColor', t: 'color', l: 'Halo colour', when: (s) => s.style.route.halo && !s.style.route.haloMatch },
      { k: 'style.route.arrows', t: 'check', l: 'Direction arrows' },
      { k: 'style.route.arrowSpacing', t: 'range', l: 'Arrow spacing', min: 6, max: 60, step: 1, u: 'mm', when: (s) => s.style.route.arrows },
    ],
    markers: [
      { k: 'style.markers.start', t: 'seg', l: 'Start', o: [['dot', 'Dot'], ['ring', 'Ring'], ['square', 'Square'], ['none', 'None']] },
      { k: 'style.markers.end', t: 'seg', l: 'Finish', o: [['dot', 'Dot'], ['ring', 'Ring'], ['square', 'Square'], ['none', 'None']] },
      { k: 'style.markers.size', t: 'range', l: 'Marker size', min: 1, max: 10, step: 0.1, u: 'mm' },
      { k: 'style.markers.matchRoute', t: 'check', l: 'Markers use route colour' },
      { k: 'style.markers.startColor', t: 'color', l: 'Start colour', when: (s) => !s.style.markers.matchRoute },
      { k: 'style.markers.endColor', t: 'color', l: 'Finish colour', when: (s) => !s.style.markers.matchRoute },
      { k: 'style.markers.stops', t: 'check', l: 'Show numbered stops' },
      { k: 'style.markers.stopSize', t: 'range', l: 'Stop size', min: 2, max: 10, step: 0.1, u: 'mm', when: (s) => s.style.markers.stops },
      { k: 'style.markers.stopColor', t: 'color', l: 'Stop colour', when: (s) => s.style.markers.stops },
      { k: 'style.markers.stopText', t: 'color', l: 'Number colour', when: (s) => s.style.markers.stops },
      { k: 'style.markers.stopNames', t: 'check', l: 'Show stop names', when: (s) => s.style.markers.stops },
      { k: 'style.markers.stopNameSize', t: 'range', l: 'Name size', min: 4, max: 14, step: 0.5, u: 'pt', when: (s) => s.style.markers.stops && s.style.markers.stopNames },
    ],
    content: [
      { k: 'content.title', t: 'area', l: 'Title', rows: 2, ph: 'Photowalk #12' },
      { k: 'content.date', t: 'text', l: 'Date', ph: 'Sat 14 November 2026' },
      { k: 'content.area', t: 'text', l: 'Area', ph: 'Neighbourhood or city' },
      { k: 'content.notes', t: 'area', l: 'Notes', rows: 2, ph: 'Meet 10:00 by the fountain' },
    ],
    labels: [
      { k: 'style.labels.show', t: 'check', l: 'Show labels' },
      { k: 'style.labels.lang', t: 'select', l: 'Map language', o: MV.LANGS, hint: 'Language of the text the app adds: default title, sample place names, decimal separator, data credit, place search results.', after: (lang) => { MV.localizeContent(lang); MV.syncAll(); MV.renderStops(); } },
      { k: 'style.labels.position', t: 'seg', l: 'Position', cols: 3, o: [['top-left', '↖'], ['top-center', '↑'], ['top-right', '↗'], ['bottom-left', '↙'], ['bottom-center', '↓'], ['bottom-right', '↘']] },
      { k: 'style.labels.reserve', t: 'check', l: 'Keep route clear of labels' },
      { k: 'style.labels.showDistance', t: 'check', l: 'Show distance' },
      { k: 'style.labels.units', t: 'seg', l: 'Units', o: [['km', 'Kilometres'], ['mi', 'Miles']] },
      { k: 'style.labels.font', t: 'select', l: 'Typeface', o: [['grotesk', 'Grotesk (Helvetica)'], ['geometric', 'Geometric (Futura)'], ['serif', 'Serif (Georgia)'], ['mono', 'Typewriter (Courier)'], ['condensed', 'Condensed (Arial Narrow)'], ['custom', 'Installed font (by name)…'], ['file', 'Font file (see below)']] },
      { k: 'style.labels.customFont', t: 'text', l: 'Font name', ph: 'e.g. Space Grotesk', hint: 'Exact name of a font installed on this computer. Exported SVGs keep it as live text, so it must also be installed wherever the file is opened — load the font file below instead to get outlines.', when: (s) => s.style.labels.font === 'custom' },
      { k: 'style.labels.outline', t: 'check', l: 'Convert text to outlines in exports', when: (s) => s.style.labels.font === 'file' },
      { k: 'style.labels.color', t: 'color', l: 'Text colour' },
      { k: 'style.labels.titleSize', t: 'range', l: 'Title size', min: 8, max: 72, step: 1, u: 'pt' },
      { k: 'style.labels.titleWeight', t: 'seg', l: 'Title weight', o: [[300, 'Light'], [400, 'Regular'], [700, 'Bold'], [900, 'Black']] },
      { k: 'style.labels.allCaps', t: 'check', l: 'All caps title' },
      { k: 'style.labels.tracking', t: 'range', l: 'Letter spacing', min: -0.05, max: 0.3, step: 0.01, u: 'em' },
      { k: 'style.labels.metaSize', t: 'range', l: 'Detail size', min: 5, max: 18, step: 0.5, u: 'pt' },
      { k: 'style.labels.plate', t: 'check', l: 'Backing plate behind text' },
      { k: 'style.labels.plateMatch', t: 'check', l: 'Plate uses background colour', when: (s) => s.style.labels.plate },
      { k: 'style.labels.plateColor', t: 'color', l: 'Plate colour', when: (s) => s.style.labels.plate && !s.style.labels.plateMatch },
      { k: 'style.labels.plateOpacity', t: 'range', l: 'Plate opacity', min: 0.1, max: 1, step: 0.05, pct: true, when: (s) => s.style.labels.plate },
    ],
    background: [
      { k: 'style.background.type', t: 'seg', l: 'Fill', o: [['solid', 'Solid'], ['gradient', 'Gradient'], ['none', 'Transparent']] },
      { k: 'style.background.color', t: 'color', l: 'Colour', when: (s) => s.style.background.type !== 'none' },
      { k: 'style.background.color2', t: 'color', l: 'Second colour', when: (s) => s.style.background.type === 'gradient' },
      { k: 'style.background.angle', t: 'range', l: 'Angle', min: 0, max: 360, step: 1, u: '°', when: (s) => s.style.background.type === 'gradient' },
      { k: 'style.background.pattern', t: 'seg', l: 'Pattern', o: [['none', 'None'], ['dots', 'Dots'], ['grid', 'Grid']] },
      { k: 'style.background.patternColor', t: 'color', l: 'Pattern colour', when: (s) => s.style.background.pattern !== 'none' },
      { k: 'style.background.patternSpacing', t: 'range', l: 'Spacing', min: 2, max: 20, step: 0.5, u: 'mm', when: (s) => s.style.background.pattern !== 'none' },
    ],
    basemap: [
      { k: 'style.basemap.show', t: 'check', l: 'Show basemap' },
      { k: 'style.basemap.opacity', t: 'range', l: 'Opacity', min: 0.1, max: 1, step: 0.05, pct: true },
      { k: 'style.basemap.roads', t: 'color', l: 'Streets' },
      { k: 'style.basemap.roadWidth', t: 'range', l: 'Street weight', min: 0.05, max: 1.5, step: 0.05, u: 'mm' },
      { k: 'style.basemap.majorScale', t: 'range', l: 'Main roads', min: 1, max: 4, step: 0.1, u: '×' },
      { k: 'style.basemap.minor', t: 'check', l: 'Footpaths & service roads' },
      { k: 'style.basemap.minorDash', t: 'check', l: 'Dashed footpaths', when: (s) => s.style.basemap.minor },
      { k: 'style.basemap.rail', t: 'check', l: 'Railways & trams' },
      { k: 'style.basemap.railColor', t: 'color', l: 'Rail colour', when: (s) => s.style.basemap.rail },
      { k: 'style.basemap.water', t: 'check', l: 'Water' },
      { k: 'style.basemap.waterColor', t: 'color', l: 'Water colour', when: (s) => s.style.basemap.water },
      { k: 'style.basemap.parks', t: 'check', l: 'Parks & green space' },
      { k: 'style.basemap.parkColor', t: 'color', l: 'Green colour', when: (s) => s.style.basemap.parks },
    ],
    extras: [
      { k: 'style.extras.border', t: 'check', l: 'Frame border (on the map inset)' },
      { k: 'style.extras.borderWidth', t: 'range', l: 'Border weight', min: 0.1, max: 3, step: 0.05, u: 'mm', when: (s) => s.style.extras.border },
      { k: 'style.extras.borderColor', t: 'color', l: 'Border colour', when: (s) => s.style.extras.border },
      { k: 'style.extras.northArrow', t: 'check', l: 'North arrow' },
      { k: 'style.extras.scaleBar', t: 'check', l: 'Scale bar' },
      { k: 'style.extras.color', t: 'color', l: 'Arrow, scale & credit colour' },
      { k: 'style.extras.credit', t: 'check', l: 'Map data credit line', hint: 'OpenStreetMap data is free to print, but must be credited.' },
    ],
  };

  const $ = (sel) => document.querySelector(sel);
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && e.append(c));
    return e;
  }
  MV.h = h;

  function fmtVal(v, f) {
    if (f.pct) return Math.round(v * 100) + '%';
    const dec = (String(f.step).split('.')[1] || '').length;
    return (+v).toFixed(dec) + (f.u ? (f.u === '°' || f.u === '×' ? f.u : ' ' + f.u) : '');
  }

  const bound = [];
  let uid = 0;

  function changed(commit) {
    if (MV.renderFonts) MV.renderFonts();
    MV.requestRender();
    MV.persistSoon();
    if (commit) MV.commit();
    updateVisibility();
  }

  function buildField(f) {
    const id = 'f' + ++uid;
    const get = () => MV.getPath(MV.state, f.k);
    const set = (v, commit) => { MV.setPath(MV.state, f.k, v); if (f.after) f.after(v); changed(commit); };
    const row = h('div', { class: 'field field-' + f.t });
    let sync = () => {};

    switch (f.t) {
      case 'range': {
        const input = h('input', { type: 'range', id, min: f.min, max: f.max, step: f.step });
        const out = h('output', { for: id });
        const label = h('label', { for: id, title: 'Double-click to reset' }, f.l);
        input.addEventListener('input', () => { set(+input.value); out.textContent = fmtVal(+input.value, f); });
        input.addEventListener('change', () => MV.commit());
        label.addEventListener('dblclick', () => {
          const def = f.reset !== undefined ? f.reset : MV.getPath({ style: MV.DEFAULT_STYLE }, f.k);
          if (def !== undefined) { set(def, true); sync(); }
        });
        row.append(h('div', { class: 'field-head' }, label, out), input);
        sync = () => { input.value = get(); out.textContent = fmtVal(get(), f); };
        break;
      }
      case 'color': {
        const input = h('input', { type: 'color', id });
        const hex = h('code', {});
        input.addEventListener('input', () => { set(input.value); hex.textContent = input.value; });
        input.addEventListener('change', () => MV.commit());
        row.append(h('label', { for: id }, f.l), h('span', { class: 'color-wrap' }, hex, input));
        sync = () => { input.value = get(); hex.textContent = get(); };
        break;
      }
      case 'check': {
        const input = h('input', { type: 'checkbox', id });
        input.addEventListener('change', () => set(input.checked, true));
        row.append(input, h('label', { for: id }, f.l));
        sync = () => { input.checked = !!get(); };
        break;
      }
      case 'select': {
        const sel = h('select', { id }, f.o.map(([v, l]) => h('option', { value: v }, l)));
        sel.addEventListener('change', () => set(sel.value, true));
        row.append(h('label', { for: id }, f.l), sel);
        sync = () => { sel.value = get(); };
        break;
      }
      case 'seg': {
        const btns = f.o.map(([v, l]) => {
          const b = h('button', { type: 'button', title: String(v) }, l);
          b.addEventListener('click', () => { set(v, true); sync(); });
          return { v, b };
        });
        const box = h('div', { class: 'seg', role: 'group', style: f.cols ? `grid-template-columns:repeat(${f.cols},1fr)` : `grid-template-columns:repeat(${btns.length},1fr)` }, btns.map((x) => x.b));
        row.append(h('span', { class: 'label' }, f.l), box);
        sync = () => btns.forEach(({ v, b }) => b.classList.toggle('on', v === get()));
        break;
      }
      case 'text':
      case 'area': {
        const input = f.t === 'area'
          ? h('textarea', { id, rows: f.rows || 2, placeholder: f.ph || '' })
          : h('input', { type: 'text', id, placeholder: f.ph || '', spellcheck: 'false' });
        input.addEventListener('input', () => set(input.value));
        input.addEventListener('change', () => MV.commit());
        row.append(h('label', { for: id }, f.l), input);
        sync = () => { if (document.activeElement !== input) input.value = get(); };
        break;
      }
      case 'number': {
        const input = h('input', { type: 'number', id, min: f.min, max: f.max, step: 0.1 });
        input.addEventListener('change', () => {
          const v = Math.min(f.max, Math.max(f.min, +input.value || f.min));
          input.value = v;
          set(v, true);
        });
        row.append(h('label', { for: id }, f.l), h('span', { class: 'num-wrap' }, input, h('span', { class: 'unit' }, f.u)));
        sync = () => { input.value = get(); };
        break;
      }
    }
    if (f.hint) row.append(h('div', { class: 'hint' }, f.hint));
    sync();
    bound.push({ f, row, sync });
    return row;
  }

  function updateVisibility() {
    bound.forEach(({ f, row }) => { if (f.when) row.hidden = !f.when(MV.state); });
  }
  MV.syncAll = function () {
    bound.forEach((b) => b.sync());
    updateVisibility();
  };

  // --- font file slots ---
  function renderFonts() {
    const box = $('#font-slots');
    box.innerHTML = '';
    [['regular', 'Regular'], ['bold', 'Bold (titles, numbers)']].forEach(([slot, label]) => {
      const loaded = MV.fonts.describe(slot);
      box.append(h('div', { class: 'font-row' },
        h('span', { class: 'font-slot' }, label),
        h('span', { class: 'font-name' + (loaded ? '' : ' muted') }, loaded || 'none'),
        h('button', { type: 'button', 'data-action': 'load-font', 'data-slot': slot }, loaded ? 'Replace…' : 'Load…'),
        loaded ? h('button', { type: 'button', class: 'icon', title: 'Remove font', 'data-action': 'remove-font', 'data-slot': slot }, '×') : null));
    });
    const st = MV.state;
    const status = $('#font-status');
    if (st.style.labels.font === 'file' && MV.fonts.available()) {
      status.textContent = st.style.labels.outline
        ? 'Exports convert all text to outlines — the SVG looks the same on any computer, no font install needed.'
        : 'Outlines are off: the SVG keeps live text and needs this font installed wherever it is opened.';
    } else if (MV.fonts.available()) {
      status.textContent = 'Font loaded. Pick “Font file” as the typeface above to use it.';
    } else {
      status.textContent = 'Load your zine’s font (TTF, OTF or WOFF) so exported text is converted to outlines. Without it, SVG text stays live and only looks right where the font is installed.';
    }
  }
  MV.renderFonts = renderFonts;

  // --- stops list ---
  function renderStops() {
    const box = $('#stops-list'), st = MV.state;
    box.innerHTML = '';
    if (!st.stops.length) {
      box.append(h('p', { class: 'hint' }, 'No stops yet. Use the Stops tool (S) to click them onto the page.'));
      return;
    }
    st.stops.forEach((s, i) => {
      const input = h('input', { type: 'text', value: s.name, placeholder: 'Stop ' + (i + 1) + ' name' });
      input.addEventListener('input', () => { s.name = input.value; MV.requestRender(); MV.persistSoon(); });
      input.addEventListener('change', () => MV.commit());
      const move = (d) => {
        const j = i + d;
        if (j < 0 || j >= st.stops.length) return;
        [st.stops[i], st.stops[j]] = [st.stops[j], st.stops[i]];
        renderStops(); MV.requestRender(); MV.commit();
      };
      box.append(h('div', { class: 'stop-row' },
        h('span', { class: 'stop-num' }, String(i + 1)),
        input,
        h('button', { type: 'button', class: 'icon', title: 'Move up', onclick: () => move(-1), disabled: i === 0 }, '↑'),
        h('button', { type: 'button', class: 'icon', title: 'Remove stop', onclick: () => { st.stops.splice(i, 1); renderStops(); MV.requestRender(); MV.commit(); } }, '×')));
    });
  }
  MV.renderStops = renderStops;

  function renderRouteInfo(scene) {
    const st = MV.state, el = $('#route-info');
    if (!st.route.length) { el.innerHTML = '<span class="muted">No route loaded</span>'; return; }
    el.innerHTML = '';
    el.append(
      h('strong', {}, st.routeName || 'Untitled route'),
      h('span', {}, `${st.route.length.toLocaleString()} points · ${scene.distText || '—'} · ${st.stops.length} stops`)
    );
  }

  MV.initUI = function () {
    document.querySelectorAll('[data-fields]').forEach((box) => {
      (FIELDS[box.dataset.fields] || []).forEach((f) => box.append(buildField(f)));
    });
    const sel = $('#theme-select');
    Object.entries(MV.THEMES).forEach(([id, t]) => sel.append(h('option', { value: id }, t.label)));
    MV.syncAll();
    renderStops();
    MV.on('restore', () => { MV.syncAll(); renderStops(); MV.requestRender(); });
    MV.on('stops', renderStops);
    MV.on('rendered', renderRouteInfo);
    MV.on('fonts', renderFonts);
    renderFonts();

    // remember which panels are open
    document.querySelectorAll('details[data-panel]').forEach((d) => {
      const key = 'mapvizard:panel:' + d.dataset.panel;
      try {
        const v = localStorage.getItem(key);
        if (v !== null) d.open = v === '1';
      } catch (e) { /* ignore */ }
      d.addEventListener('toggle', () => { try { localStorage.setItem(key, d.open ? '1' : '0'); } catch (e) { /* ignore */ } });
    });
  };
})();
