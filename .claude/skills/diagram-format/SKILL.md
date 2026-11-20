---
name: diagram-format
description: How to create, edit, regenerate and view diagrams in the user's offline diagram viewer. Use whenever the user asks for a diagram, flowchart, process flow, data flow diagram, swimlane, node graph or architecture picture, or mentions the diagram viewer, localhost:47831, a diagrams/*.html file or "make". Covers the HTML source format, node types, where files live, and the make and view steps. Read this before writing any diagram, even in a session that did not start in the diagram folder.
---

# Diagram format (offline viewer)

You write a small HTML source file; the viewer turns it into one self-contained, pannable,
zoomable page. The user only views and shares. You do all the editing.

## Where things are (absolute paths; works from any folder)
- Project: `C:\Users\affan.hamid\Tools\diagram`
- Source you write: `C:\Users\affan.hamid\Tools\diagram\diagrams\<name>.html`
- Generated page: `...\out\<name>.html`, shown at `http://localhost:47831/<name>.html`
- Generate: `& "C:\Program Files\nodejs\node.exe" "C:\Users\affan.hamid\Tools\diagram\scripts\make.mjs" "C:\Users\affan.hamid\Tools\diagram\diagrams\<name>.html"`
- Always-on server: scheduled task `DiagramServer`. If the URL does not load, run `Start-ScheduledTask -TaskName DiagramServer`.
- Working examples to copy from: `diagrams\example-flowchart.html`, `example-process-flow.html`, `example-dfd.html`.
- Client information stays on this laptop: never add CDN links, web fonts, scripts or external URLs (make refuses them). Do not publish diagrams as Artifacts. Only commit or push when asked; `diagrams/` and `specs/` are git-ignored except the examples.

## Your job is only: type + content
The viewer decides size, padding, spacing, alignment, colour, layout and routing. Same-type
nodes with similar sizes are made identical automatically, and nothing is ever clipped.
**Never set** `width`, `height`, `align`, `style`, colours or fonts.
The one placement tool is `at="col,row"` (see below): use it only when the user asks for a specific arrangement, never by default.

```html
<diagram title="Name shown in the tab" direction="LR">
  <node id="a" type="start">Request received</node>
  <node id="b" type="card"><h3>Validate</h3><p>Optional detail.</p></node>
  <node id="c" type="decision">Valid?</node>
  <edge from="a" to="b"></edge>
  <edge from="b" to="c" label="optional"></edge>
</diagram>
```
- `<diagram>`: `title`, `direction` (`LR` default, `TB`), optional `description`, `pool` (name of a swimlane pool).
- `<node>`: `id` (unique, no spaces), `type` (see below), `kind` (events and gateways), `num` (DFD numbering), `lane` (swimlanes), `assumed` (flag), `at` (grid placement, optional). Content is plain HTML: text, `<h3>`, `<p>`, `<ul>`, `<table>`, `<small>`, `<img src="images/x.png">`.
- `<edge>`: `from`, `to`, `label`, `dashed`, `assumed`. Write `<edge ...></edge>`.
- `<lane id="ops" label="Operations"></lane>` before the nodes, `direction="LR"` only. Every node gets `lane="ops"`. The lane decides the row; steps stay on one row and an attached document or note hangs under its step.
- **Grid placement (optional):** `at="3,2"` = column 3, row 2 (1-based, from the top left; `at="3"` sets only the column and is what swimlanes use). Cells are evenly spaced and sized by the viewer. Pin nodes only when the user asks for an exact arrangement; give every node in that area an `at`, because unpinned nodes are only nudged out of the way. Nodes without `at` stay fully automatic.
- Layout and arrows are automatic: connectors choose their sides, avoid nodes, and avoid crossing each other. Straight runs are kept straight. Do not try to fix a crossing by editing coordinates; change the structure or, if asked, pin with `at`.
- Mark anything the user did not say with `assumed`. It draws dashed with a small "assumed" tag. Remove it only when the user confirms.

## Node types
Short list; full table with symbols and rules in [reference/types.md](reference/types.md).
- General: `card` (process or task), `start`, `end`, `note`, `plain` (text or image with no frame)
- Flowchart: `decision`, `io`, `document`, `subprocess`, `manual`, `prep`, `data`, `connector`, `offpage`
- Process flow (BPMN): `event` + `kind=start|intermediate|end`, `gateway` + `kind=xor|and|or`, `task` (card), `dataobject`
- Data flow (DFD, Gane-Sarson): `dfd-process` + `num`, `datastore` + `num`, `entity`

Choose the diagram type and check it against the standards: see the `diagram-standards` skill.
For conversation rules see `diagram-conversation`; for the pasteable spec see `prototype-spec`.

## After make
- Read make's output. `⚠` lines are real problems (duplicate id, edge to a missing node, unknown lane). Fix them and re-run. `✗` means it refused the file; fix and re-run.
- Give the user the URL, not a description of the diagram.
- Editing a diagram the user downloaded: take its `<diagram>` from the `<template id="diagram-source">` in the file, save it under `diagrams\`, edit, make. Saved `at="col,row"` values on nodes are the layout the user arranged by dragging, snapped to the grid; keep them unless asked to re-layout, and delete them all if you change the structure.
- The generated page contains the source, not coordinates: the layout is computed when it opens (always the same result). "Download HTML" writes the user's current arrangement back as `at` values.
- The viewer's code and tooling notes are in `C:\Users\affan.hamid\Tools\diagram\CLAUDE.md`. Only touch `src\` when asked.
