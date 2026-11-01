# Map Vizard

A small static web app that turns a walking route (GPX, KML, JSON or hand-drawn) into a clean, print-ready map for a zine. It exports SVG (sized in millimetres) and PNG (with DPI metadata).

Everything runs in the browser. There's no backend, no build step and no accounts.

## Run it

Open `index.html` in a browser. That's all.

You can also serve the folder with any static server, e.g. `npx serve .`, and deploy it anywhere that hosts static files.

## Workflow

1. **Import** by dropping a `.gpx`, `.kml`, `.json` or `.geojson` file anywhere on the window, or click **Load sample**. GPX waypoints and KML/GeoJSON points become numbered **stops**.
2. **Frame** it. Pick the page size (A6–A3, Half Letter, Letter, Square, Custom), margin and rotation. The route auto-fits the page and keeps clear of the title block. Panning or zooming switches auto-fit off; press **Fit** (F) to turn it back on.
3. **Style** the route line, markers, labels, background and basemap. The preview updates live.
4. **Export SVG** or **Export PNG** from the toolbar.

### Tools (toolbar)

| Tool | Key | What it does |
|---|---|---|
| Pan | V | Drag to pan, scroll to zoom |
| Edit | E | Drag points, click the line to insert a point, Alt-click or double-click a point to delete it |
| Draw | D | Click to append points (drag still pans). Backspace removes the last point |
| Stops | S | Click to add a numbered stop, drag to move, Alt-click to delete. Name and reorder stops in the sidebar |

Undo/redo: ⌘Z / ⇧⌘Z (Ctrl on Windows/Linux). **Reset styles** restores the defaults.

Raw GPS tracks have thousands of points. Run **Simplify points** in the Route panel before editing by hand. The **Simplify** slider in *Route line* smooths jitter at render time without changing your data.

## Fonts and outlined text (important for print)

Live SVG text stores only the font's *name*, so it changes typeface on any computer that lacks that font. To avoid that:

- In **Labels → Font file**, load your zine's font (TTF, OTF or WOFF; WOFF2 isn't supported). You can load a regular and a bold cut. The typeface switches to *Font file*.
- With **Convert text to outlines in exports** on (the default), all SVG text (title, date, notes, stop numbers and names, scale bar, credit) is exported as vector paths. The SVG then looks identical everywhere, with no font install needed.
- PNG exports always use the loaded font file.
- If you export an SVG with live text, the app warns you which font has to be installed.

Font files are cached in the browser. They're also embedded in saved presets so a preset is self-contained, so be mindful of your font's licence before sharing preset files.

## Map language

**Labels → Map language** (English or Polski) sets the language of the text the app itself puts on the map: the default title, the sample's place names, the decimal separator (`3,9 km`), the data credit (`© autorzy OpenStreetMap`) and place-search results. Text you typed or imported is never changed. The first time the app opens, the language follows your browser. The sidebar itself stays in English.

## Output for layout apps

- **SVG**: `width`/`height` are in mm, so it places at the exact page size in InDesign, Affinity or Scribus. Layers are named groups (`background`, `basemap`, `route`, `markers`, `labels`, `extras`) for easy editing in Illustrator or Inkscape.
- **PNG**: rendered at the chosen DPI (150/300/600). A `pHYs` chunk is written so layout apps place it at the correct physical size. Choose **Transparent** background for overlaying on your own artwork.

## Basemap

- **Fetch streets for this view** downloads streets, paths, rail, water and parks for the visible area. The data is OpenStreetMap, taken from [OpenFreeMap](https://openfreemap.org) vector tiles: free, no API key, served from a CDN, usually ready in a second or two. It's drawn as thin vector lines with no labels, and is clipped to the page (or to the *Map inset*).
- If the tile server is down, the app falls back to the public Overpass API. Those servers are often overloaded, so the app tries several, keeps the first to answer and gives up after 90 s. While a download runs, the button turns into **Cancel**.
- **Import GeoJSON** lets you use your own shapes offline. OSM-style tags (`highway`, `waterway`, `natural`, `leisure`…) set the styling. Unknown lines draw as streets and unknown polygons as green space.
- OSM data is free to print but must be credited. The *Map data credit line* option (on by default) prints the right credit in the bottom margin, e.g. `© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors`.
- Place search ("Draw from scratch") uses OpenStreetMap Nominatim.

## House style and presets

- **House style → Apply** gives you built-in looks: Paper, Ink, Riso pink + blue, Blueprint, Night, Abstract.
- **Save preset…** downloads a JSON file with colours, line weights, typography, page setup and any font files. Use **Load preset…** or drop the file on the window to keep every issue consistent.
- The last-used settings, route and basemap autosave in `localStorage`.

## Project files

- **Project file → Save project…** (⌘S) downloads one `.mapvizard.json` file. It holds every setting, the title and labels, the route, stops and framing, any loaded font files and, if **Include basemap streets** is ticked, the fetched streets.
- **Open project…** (⌘O), or dropping the file on the window, restores all of it exactly. It replaces the current map. Undo (⌘Z) brings back the previous route and settings, but not its streets.
- With streets included the file is a few MB (about 6 MB for the sample). Untick the box for a small file, then click *Fetch streets* again after opening.

## Supported route formats

- **GPX**: `trkpt` (falls back to `rtept`). `wpt` become stops. Track name becomes the title.
- **KML**: `LineString` coordinates (or `gx:Track`). `Point` placemarks become stops.
- **JSON**: an array of `{ "lat", "lon" }` (also `lng` / `latitude` / `longitude`) or `[lon, lat]` pairs. Or an object `{ "name", "points": [...], "stops": [{ "lat", "lon", "name" }] }`, which is the format **Save route** writes.
- **GeoJSON**: `LineString` / `MultiLineString` for the route, `Point` features for stops.

See `samples/` for examples. The sample is a 3.9 km walk in Wrocław, from Hala Targowa along the Odra and the old-town moat to Dworzec Świebodzki, routed along real footpaths.

## Project layout

```
index.html          single page
css/app.css         UI styles
js/state.js         defaults, themes, persistence, undo history
js/geo.js           projection, fitting, simplification, curve smoothing
js/parse.js         GPX / KML / JSON / GeoJSON parsing
js/fonts.js         font files: preview via FontFace, outlines via opentype.js
js/render.js        builds the scene as SVG (shared by preview and export)
js/mvt.js           minimal vector-tile (protobuf) decoder
js/basemap.js       tile + Overpass fetch, GeoJSON import, basemap rendering
js/export.js        SVG / PNG / JSON downloads, PNG DPI metadata
js/interact.js      pan, zoom, edit, draw, stops on the preview
js/ui.js            schema-driven sidebar controls
js/main.js          wiring, actions, keyboard, drag & drop
js/vendor/          opentype.js 1.3.4 (MIT)
```
