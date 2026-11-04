# Map Vizard

A small static web app that turns a walking route (GPX, KML, JSON or hand-drawn) into a clean, print-ready map for a zine. It exports SVG (sized in millimetres) and PNG (with DPI metadata).

Everything runs in the browser. There's no backend, no build step and no accounts. The interface uses [Pico CSS](https://picocss.com) (MIT), vendored at `css/vendor/pico.min.css`.

## Run it

Open `index.html` in a browser. That's all.

You can also serve the folder with any static server, e.g. `npx serve .`, and deploy it anywhere that hosts static files.

## Workflow

The sidebar walks you through four steps. Each shows only what a first map needs; everything else sits under **More options** at the bottom of the step.

1. **Start.** Set the page size and orientation first, since they shape the layout. Then drop a `.gpx`, `.kml`, `.json` or `.geojson` file anywhere on the window, or click **Try the sample walk**. GPX waypoints and KML/GeoJSON points become numbered **stops**, which you can rename here.
2. **Look.** Pick a house style from thumbnails of your own map, add streets, and set the route colour and weight.
3. **Words.** Title, date, place, notes, where the text sits and the typeface.
4. **Export.** Set the PNG resolution, then **Export PNG** or **Export SVG**.

The route auto-fits the page and keeps clear of the title block. Panning or zooming switches auto-fit off; press **Fit** (F) to turn it back on.

### Tools (toolbar)

| Tool | Key | What it does |
|---|---|---|
| Pan | V | Drag to pan, scroll to zoom |
| Edit | E | Drag points, click the line to insert a point, Alt-click or double-click a point to delete it |
| Draw | D | Click to append points (drag still pans). Backspace removes the last point |
| Stops | S | Click to add a numbered stop, drag to move, Alt-click to delete. Name and reorder stops in the sidebar |

Undo/redo: ⌘Z / ⇧⌘Z (Ctrl on Windows/Linux). **Reset look** (Look → More options → Save this look) restores the defaults.

Raw GPS tracks have thousands of points. Run **Simplify points** (Start → More options) before editing by hand. The **Simplify** slider (Look → More options → Line) smooths jitter at render time without changing your data, and always keeps the line on stops that sit on it. **Corner length** in the same group sets how far each corner is rounded.

## Fonts and outlined text (important for print)

Live SVG text stores only the font's *name*, so it changes typeface on any computer that lacks that font. To avoid that:

- In **Words → More options → Your own font file**, load your zine's font (TTF, OTF or WOFF; WOFF2 isn't supported). You can load a regular and a bold cut. The typeface switches to *Font file*.
- With **Convert text to outlines in exports** on (the default), all SVG text (title, date, notes, stop numbers and names, scale bar, credit) is exported as vector paths. The SVG then looks identical everywhere, with no font install needed.
- PNG exports always use the loaded font file.
- If you export an SVG with live text, the app warns you which font has to be installed.

Font files are cached in the browser. They're also embedded in saved presets so a preset is self-contained, so be mindful of your font's licence before sharing preset files.

## Map language

**Words → More options → Language and units** (English or Polski) sets the language of the text the app itself puts on the map: the default title, the sample's place names, the decimal separator (`3,9 km`), the data credit (`© autorzy OpenStreetMap`) and place-search results. Text you typed or imported is never changed. The first time the app opens, the language follows your browser. The sidebar itself stays in English.

## Output for layout apps

- **SVG**: `width`/`height` are in mm, so it places at the exact page size in InDesign, Affinity or Scribus. Layers are named groups (`background`, `basemap`, `route`, `markers`, `labels`, `extras`) for easy editing in Illustrator or Inkscape.
- **PNG**: rendered at the chosen DPI (150/300/600). A `pHYs` chunk is written so layout apps place it at the correct physical size. Choose **Transparent** background for overlaying on your own artwork.

## Basemap

- **Add streets** (Look step) downloads streets, paths, rail, water and parks for the visible area. The data is OpenStreetMap, taken from [OpenFreeMap](https://openfreemap.org) vector tiles: free, no API key, served from a CDN, usually ready in a second or two. It's drawn as thin vector lines with no labels, and is clipped to the page (or to the *Map inset*).
- If the tile server is down, the app falls back to the public Overpass API. Those servers are often overloaded, so the app tries several, keeps the first to answer and gives up after 90 s. While a download runs, the button turns into **Cancel**.
- **Use my own GeoJSON** (Look → More options → Streets) lets you use your own shapes offline. OSM-style tags (`highway`, `waterway`, `natural`, `leisure`…) set the styling. Unknown lines draw as streets and unknown polygons as green space.
- OSM data is free to print but must be credited. The *Map data credit line* option (on by default) prints the right credit in the bottom margin, e.g. `© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors`.
- Place search (Start step) uses OpenStreetMap Nominatim.

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

See `samples/` for examples. The sample is a 3.4 km walk in Wrocław, from Hala Targowa along the Odra and the old-town moat to Dworzec Świebodzki, traced along OSM streets and paths.

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
