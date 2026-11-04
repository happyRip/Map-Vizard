/* Map Vizard — sample route: a walk from Hala Targowa along the Odra and the old-town moat to Dworzec Świebodzki,
   Wrocław, traced along OSM streets and paths. */
(function () {
  'use strict';
  const MV = (window.MV = window.MV || {});

  // Street-centreline trace (only streets and paths the basemap draws), with street-crossing steps smoothed out.
  const waypoints = [
    [51.11239, 17.04066], [51.11260, 17.04155], [51.11213, 17.04245], [51.11152, 17.04311], [51.11154, 17.04440],
    [51.11188, 17.04502], [51.11153, 17.04616], [51.11076, 17.04567], [51.10907, 17.04541], [51.10886, 17.04729],
    [51.10814, 17.04689], [51.10740, 17.04424], [51.10734, 17.04370], [51.10756, 17.04256], [51.10725, 17.04122],
    [51.10754, 17.03912], [51.10762, 17.03747], [51.10549, 17.03690], [51.10507, 17.03655], [51.10426, 17.03523],
    [51.10455, 17.03363], [51.10459, 17.03201], [51.10432, 17.03025], [51.10566, 17.02726], [51.10796, 17.02131],
    [51.10804, 17.02046], [51.10765, 17.01977], [51.10750, 17.01891],
  ];

  function densify(pts, stepM) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dy = (b[0] - a[0]) * 111320, dx = (b[1] - a[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
      const n = Math.max(1, Math.round(Math.hypot(dx, dy) / stepM));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        out.push([
          +(a[0] + (b[0] - a[0]) * t).toFixed(6),
          +(a[1] + (b[1] - a[1]) * t).toFixed(6),
        ]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // Names per map language; MV.sample(lang) builds the route with that language's names.
  const NAMES = {
    route: { en: 'Market Hall to Świebodzki', pl: 'Od Hali Targowej na Świebodzki' },
    stops: [
      { en: 'Market Hall', pl: 'Hala Targowa' },
      { en: 'Dunikowski Boulevard', pl: 'Bulwar Dunikowskiego' },
      { en: 'Juliusz Słowacki Park', pl: 'Park Juliusza Słowackiego' },
      { en: 'Plac Społeczny', pl: 'Plac Społeczny' },
      { en: 'Nicolaus Copernicus Park', pl: 'Park Mikołaja Kopernika' },
      { en: 'Podwale', pl: 'Podwale' },
      { en: 'Świebodzki (food)', pl: 'Świebodzki (jedzenie)' },
    ],
  };
  const STOPS = [
    [51.11239, 17.04066], [51.11182, 17.04521], [51.10970, 17.04551], [51.10814, 17.04688],
    [51.10457, 17.03300], [51.10645, 17.02520], [51.10751, 17.01896],
  ];
  const route = densify(waypoints, 12);
  const pick = (names, lang) => names[lang] || names.en;

  MV.sample = function (lang) {
    return {
      name: pick(NAMES.route, lang),
      area: 'Wrocław',
      route,
      stops: STOPS.map(([lat, lon], i) => ({ lat, lon, name: pick(NAMES.stops[i], lang) })),
    };
  };

  // Swap built-in text (default title, sample names) into `lang`, leaving anything the user typed.
  MV.localizeContent = function (lang) {
    const swap = (str, sets) => {
      for (const names of sets) if (Object.values(names).includes(str)) return pick(names, lang);
      return str;
    };
    const titles = Object.fromEntries(Object.keys(MV.I18N).map((k) => [k, MV.t('title', k)]));
    const st = MV.state;
    st.content.title = swap(st.content.title, [titles, NAMES.route]);
    st.routeName = swap(st.routeName, [NAMES.route]);
    st.stops.forEach((p) => (p.name = swap(p.name, NAMES.stops)));
  };

  // True when `title` is a built-in default title in any language.
  MV.isDefaultTitle = (title) => Object.keys(MV.I18N).some((k) => MV.t('title', k) === title);
})();
