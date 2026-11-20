# diagram

Local, offline diagram viewer. A JSON spec in `diagrams/` becomes one self-contained
HTML file in `out/` with an infinite canvas, pan/zoom and draggable nodes (React Flow).
No server, no CDN, no external requests.

```powershell
pnpm install              # once
pnpm run build:viewer     # once, or after changing src/ (writes template/index.html)
pnpm run make             # all diagrams/*.json -> out/*.html
node scripts/make.mjs diagrams/sample.json   # just one
```

Open `out/sample.html` by double-clicking it. See `CLAUDE.md` for the JSON format.

Dragging nodes is for exploring; positions are not saved. "Reset layout" restores the
automatic layout. To pin a position permanently, add `"position": {"x": 0, "y": 0}` to a node.
