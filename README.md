# diagram

Local, offline diagram viewer. An HTML source file in `diagrams/` becomes one self-contained
HTML file in `out/` with an infinite canvas, pan/zoom and draggable nodes (React Flow).
Nodes can hold any HTML (headings, paragraphs, lists, tables, images). No server, no CDN,
no external requests.

```powershell
pnpm install              # once
pnpm run build:viewer     # once, or after changing src/ (writes template/index.html)
pnpm run make             # all diagrams/*.html -> out/*.html
node scripts/make.mjs diagrams/sample.html   # just one
```

Open `out/sample.html` by double-clicking it. See `CLAUDE.md` for the source format.

Dragging nodes is for exploring. **Download HTML** (top right) saves a copy of the diagram with
your current layout baked in; **Reset layout** restores the automatic layout.
