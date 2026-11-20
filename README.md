# diagram

Local, offline diagram viewer. An HTML source file in `diagrams/` becomes one self-contained
HTML file in `out/` with an infinite canvas, pan/zoom and draggable nodes (React Flow).
Nodes can hold any HTML (headings, paragraphs, lists, tables, images). No server, no CDN,
no external requests.

```powershell
pnpm install              # once
pnpm run build:viewer     # once, or after changing src/ (writes template/index.html)
pnpm run make             # all diagrams/*.html -> out/*.html
node scripts/make.mjs diagrams/my-diagram.html   # just one
```

Open a generated `out/<name>.html` by double-clicking it, or browse everything at
**http://localhost:47831** (a small read-only server that starts at sign-in; see below).
See `CLAUDE.md` for the source format.

## Always-on server

`scripts/install-autostart.ps1` registers a per-user scheduled task, `DiagramServer`, that runs
`scripts/serve.mjs` hidden at every sign-in and restarts it if it stops. It listens on
127.0.0.1:47831 only, never writes files, and serves only `out/*.html`.

```powershell
Start-ScheduledTask -TaskName DiagramServer      # start now
Stop-ScheduledTask  -TaskName DiagramServer      # stop
scripts\uninstall-autostart.ps1                  # remove it
```

It runs while you are signed in and the laptop is awake.

The dropdown at the top left switches between diagrams: it remembers file paths only (in the
browser, never the diagram content) and opens a file when you click it. **Add existing file…**
adds a path (e.g. `C:\Users\you\Tools\diagram\out\my-diagram.html`; "Copy as path" in Explorer
works). **+ New file** starts a blank diagram: press **Download HTML** to save it as a file you
can open any time, then ask Claude to fill it in.

Dragging nodes is for exploring. **Download HTML** (top right) saves a copy of the diagram with
your current layout baked in; **Reset layout** restores the automatic layout.
