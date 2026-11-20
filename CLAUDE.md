# Diagram viewer: instructions for Claude

Purpose: turn a plain-HTML diagram source into ONE self-contained HTML file with an infinite,
pan/zoom canvas and draggable nodes (React Flow). Fully offline: no CDN, no network at view
time. Client data stays on this laptop, so never add CDN links, web fonts, analytics or
external fetches. The user only opens the HTML; you do all the work.

## Per diagram (the normal case, no rebuild)
1. Write or edit `diagrams/<name>.html` (format below). Put images in `diagrams/images/`.
2. Run `node scripts/make.mjs diagrams/<name>.html` (or `pnpm run make` for all).
3. Output: `out/<name>.html`. Tell the user the path. Do not publish it as an Artifact.

Layout is automatic (dagre) and every node is measured from its real content, so never
compute coordinates. Only set `x`/`y` on a node if the user asks for a specific placement.

## Source format
```html
<diagram title="Shown in header and tab" description="optional one-liner" direction="LR">
  <node id="a" type="start">Request received</node>
  <node id="b" type="card" width="300">
    <h3>Heading</h3>
    <p>Any HTML: paragraphs, lists, tables, code, <b>bold</b>, images.</p>
    <img src="images/form.png">
  </node>
  <node id="c" type="decision"><b>OK?</b></node>
  <node id="d" type="plain"><h4>Free text</h4><p>No frame around this.</p></node>
  <edge from="a" to="b"></edge>
  <edge from="b" to="c" label="optional" dashed></edge>
</diagram>
```
- `direction`: `LR` (default) or `TB`.
- Node `type` is only the frame: `start`, `end` (pill, accent), `card` (default), `decision`
  (diamond), `data` (cylinder), `note` (dashed, muted), `plain` (no frame: just text/images).
- Node attributes: `id` (unique, no spaces), `width` (px, default fits content up to 300),
  `height`, `align` (`left`|`center`|`right`), `x`/`y` (fixed position).
- Content styling is shared: `h1`-`h4`, `p`, `ul`/`ol`, `table`, `code`/`pre`, `blockquote`,
  `small`, `img`. Do not add inline styles or colours; keep the look consistent.
- Write edges as `<edge ...></edge>` (a self-closing `<edge/>` is also accepted by make).
- Keep headings short; label the outgoing edges of every `decision` (Yes/No, Low/High...).
- Images: png, jpg, gif, webp or svg, inside the project folder. make inlines them as data:
  URIs so the output stays one file. Resize big images first (make warns above 1 MB).
- Refused by make (client data must stay local): `<script>`, iframe/object/embed/link/meta/
  form, `on...=` handlers, `javascript:`, CSS `@import`, and any http(s) or `//` URL in
  src/href/url(). Plain-text URLs in paragraphs are fine.
- Mistakes (duplicate ids, edges to missing nodes, unknown `type`) show as warnings in the
  make output and in the diagram header.

## In the viewer
- Drag nodes, scroll to zoom, drag the background to pan. "Reset layout" restores auto layout.
- "Download HTML" saves a copy of the diagram as a new `.html` file, with the current node
  positions written back as `x`/`y`, so a layout the user arranged is kept. It downloads
  straight from the browser, no server needed.

- Top left is a dropdown showing the diagram's title. It lists saved diagram files for
  switching between diagrams. It remembers file PATHS only (plus a display name), in the
  browser's localStorage; diagram content is never stored. Clicking a file opens it (a
  `file:///` link). "Add existing file…" adds another path: paste a full Windows path (quotes,
  `/` or `file:///` are fine). When the page was opened from disk and is not listed yet, it
  shows as "this file" with "Save to list". There is no title card; if problems exist (bad
  edge, unknown type) a small amber "⚠ n" pill appears next to the dropdown. The list is
  shared only between diagrams opened from disk in the same browser profile. Do not try to
  write this list from `make`.
- "+ New file" asks for a name and swaps the open page for an empty diagram (in memory only;
  nothing on disk changes). The user then presses "Download HTML" to get a blank `<name>.html`
  and later asks Claude to fill it in. To fill a downloaded blank (or to edit any downloaded
  file): take the `<diagram ...>` element from the `<template id="diagram-source">` in that
  file, save it as `diagrams/<name>.html`, edit it, and run make. Saved `x`/`y` on nodes are
  the user's dragged positions: keep them unless asked to re-layout (delete them to re-layout).
  The user only views and shares; Claude does all the editing.

## Changing the viewer itself (rare: new frame, new style, new feature)
Source is `src/` (App.jsx, ShapeNode.jsx, spec.js, layout.js, style.css). Colours are CSS
variables at the top of `src/style.css`. The viewer is always light mode, whatever the OS theme. After editing, rebuild once with
`pnpm run build:viewer`, which rewrites `template/index.html` (committed), then re-run make.

## Tooling (Windows)
Node, Git and pnpm are installed. If a tool is not found in a session, call it by full path
(`C:\Program Files\nodejs\node.exe`, `%APPDATA%\npm\pnpm.cmd`) or refresh PATH first.
Preview with `node scripts/serve.mjs` (127.0.0.1 only; port 4173); double-clicking the HTML
also works. Git has no identity configured, so commit with
`git -c user.name=diagram-local -c user.email=noreply@localhost commit ...`.

## Style rules
Calm look: one accent colour, neutral cards, yellow for decisions, blue for data. No emoji.
