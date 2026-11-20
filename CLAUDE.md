# Diagram viewer: instructions for Claude

Purpose: turn a small JSON spec into ONE self-contained HTML file with an infinite,
pan/zoom canvas and draggable nodes (React Flow). Fully offline: no CDN, no network
at view time. Client data stays on this laptop, so never add CDN links, web fonts,
analytics or external fetches. The user only opens the HTML; you do all the work.

## Per diagram (the normal case, no rebuild)
1. Write or edit `diagrams/<name>.json`.
2. Run `node scripts/make.mjs diagrams/<name>.json` (or `pnpm run make` for all).
3. Output: `out/<name>.html`. Tell the user the path. Do not publish it as an Artifact.

Do not compute coordinates: layout is automatic (dagre). Only set `"position": {"x":..,"y":..}`
on a node if the user asks for a specific placement.

## JSON spec
```json
{
  "title": "Shown in the header and tab",
  "description": "optional one-liner",
  "direction": "LR",
  "nodes": [
    { "id": "a", "type": "start", "label": "Text", "sub": "optional second line" }
  ],
  "edges": [
    { "from": "a", "to": "b", "label": "optional", "dashed": false }
  ]
}
```
- `direction`: `LR` (left to right, default) or `TB` (top to bottom).
- `type` (node shape): `start`, `end` (pill, accent), `process` (default, rounded card),
  `decision` (diamond), `data` (cylinder), `note` (dashed, muted).
- Node `id`s are unique and have no spaces. Optional `width`/`height` override size.
- Keep labels short (about 3 to 5 words); put detail in `sub`.
- Label the outgoing edges of every `decision` (Yes/No, Low/High...).
- Bad edges or unknown types show a warning in the diagram header and in the make output.

## Changing the viewer itself (rare: new shape, new style, new feature)
Source is `src/` (App.jsx, ShapeNode.jsx, layout.js, style.css). Colours are CSS variables
at the top of `src/style.css` (light + dark). After editing, rebuild once with
`pnpm run build:viewer`, which rewrites `template/index.html` (committed), then re-run make.

## Tooling (Windows)
Node, Git and pnpm are installed. If a tool is not found in a session, call it by full path
(`C:\Program Files\nodejs\node.exe`, `%APPDATA%\npm\pnpm.cmd`) or refresh PATH first.
Preview with `node scripts/serve.mjs` (127.0.0.1 only); double-clicking the HTML also works.

## Style rules
Consistent, calm look: one accent colour, neutral cards, yellow for decisions, blue for data.
Do not add emoji or extra decoration to nodes.
