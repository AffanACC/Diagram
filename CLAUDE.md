# Diagram viewer: repo notes for Claude

Offline diagram viewer: a small HTML source file becomes one self-contained, pannable page
(React Flow). Client information stays on this laptop: no CDN, no web fonts, no external
requests, no Artifacts. The user only views and shares; Claude does the editing.

## Rules live in skills (read them, do not duplicate them here)
Source: `.claude\skills\` in this repo; installed to `%USERPROFILE%\.claude\skills\` by
`scripts\install-skills.ps1` (re-run after editing a skill) so every session finds them.
- `diagram-format`: the HTML source format, node types, `at` grid placement, where files go, `make`
- `diagram-conversation`: stick to the conversation, ask only when it matters, vague prompts, short replies
- `diagram-standards`: flowchart (ISO 5807), process flow (BPMN swimlane), data flow (Gane-Sarson) rules and checklists
- `diagram-styling`: slate tokens, what colours mean, content rules, how to change the theme
- `prototype-spec`: the paste-anywhere spec
Examples: `diagrams\example-flowchart.html`, `example-process-flow.html`, `example-dfd.html`, `sample.html`.

## Working on the viewer itself (only when asked)
Source is `src\`: `spec.js` (reads the HTML source), `shapes.js` (node types and their markup),
`layout.js` (measuring, harmonised sizes, dagre layout, straightening, swimlanes, grid, edge
routing), `ShapeNode.jsx`, `LaneNode.jsx`, `RoutedEdge.jsx`, `FileMenu.jsx`, `App.jsx`,
`style.css` (tokens at the top). After editing: `pnpm run build:viewer` (rewrites the committed
`template\index.html`), then `pnpm run make`. A change to node types or attributes must be
reflected in the `diagram-format` skill and `reference\types.md`.
Check layout changes on all four examples for connector crossings and connectors passing
through nodes; the routing code is built to give none.

## Server and tooling (Windows)
- `http://localhost:47831` is served by the scheduled task `DiagramServer` (per user, hidden, starts at sign-in, restarts on failure) running `scripts\serve.mjs`: read-only, 127.0.0.1 only, with a Content-Security-Policy that blocks any external request. New or changed diagrams show up after `make`; no restart needed. After changing `serve.mjs`: `Stop-ScheduledTask DiagramServer; Start-ScheduledTask DiagramServer`. Install/remove: `scripts\install-autostart.ps1` / `uninstall-autostart.ps1`.
- Node, Git and pnpm are installed. If a tool is not found, call it by full path (`C:\Program Files\nodejs\node.exe`, `%APPDATA%\npm\pnpm.cmd`) or refresh PATH first.
- Page output opens by double-click too (the dropdown then uses saved file paths instead of the server list).

## Git
The repo is the tool, not the user's work. `diagrams\`, `out\` and `specs\` are git-ignored except the examples, because they may hold client information: never force-add them. Commits use this repo's own git identity (`git config user.name` / `user.email`); do not reintroduce a placeholder. The remote `origin` is on GitHub: push only when the user asks.
