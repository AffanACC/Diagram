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
- No example files are kept. The snippets in this skill and `reference\types.md` are the reference. The user's earlier diagrams in `diagrams\` can be read for style but are their work: never copy their content elsewhere.
- Client information stays on this laptop: never add CDN links, web fonts, scripts or external URLs (make refuses them). Do not publish diagrams as Artifacts. Only commit or push when asked; `diagrams/`, `out/` and `specs/` are git-ignored; never force-add them.

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
- `<diagram>`: `title`, `direction` (`LR` default, `TB`), optional `description`, `pool` (name of a swimlane pool), `type="ontology"` (circles joined by labelled straight links; nodes default to `concept`).
- `<node>`: `id` (unique, no spaces), `type` (see below), `kind` (events and gateways), `num` (DFD numbering), `assumed` (flag), `at` (grid placement, optional). Lane and zone membership come from the parent tag (below). Content is plain HTML: text, `<h3>`, `<p>`, `<ul>`, `<table>`, `<small>`, `<img src="images/x.png">`.
- `<edge>`: `from`, `to`, `label`, `dashed`, `assumed`, `both` (arrowhead at both ends, for a genuinely two-way link). Write `<edge ...></edge>`.
- **Lanes (swimlanes):** a parent tag with its nodes inside: `<lane label="Operations"> <node ...>...</node> </lane>`, `direction="LR"` only. Lane order is the order written. The lane decides the row; steps stay on one row and an attached document or note hangs under its step. Edges go after the lanes, anywhere (they connect ids, even across lanes).
- **Zones:** a parent tag with its nodes inside: `<zone label="Order system"> <node ...>...</node> </zone>`. It draws a labelled box around what is inside (a system boundary on a DFD, a stage, an area, a trust boundary). Zones nest: a `<zone>` inside a `<zone>` gives a box inside a box. Nodes outside the tag are kept outside the box. Works on any diagram and can sit inside a lane or around lanes' nodes. If a box cannot avoid a node that is not in it, a warning pill appears. Edges stay outside the zone tags, because they usually cross the border.
- **Older attribute form** (still works, do not write new files this way): `<lane id="a" label="A"></lane>` / `<zone id="z" label="Z"></zone>` followed by `lane="a"` / `zone="z"` on each node.
- **Skeleton:** `skeleton` on `<diagram>` shows one badge saying the whole diagram is assumed. Use it for a first draft built from a vague prompt instead of marking every node `assumed` (see `diagram-conversation`).
- **Tone (colour):** `tone="blue"` on any node, from a fixed palette: `grey`, `blue`, `green`, `orange`, `purple`, `red`. There are no other colours and no colour values. Use a tone only to tell categories apart (same tone = same category) or when the user asks for a colour; never for decoration. Say what the tones mean in the reply.
- **Grid placement (`at`), the way to fix a position (see "When the user wants exact positions"):** `at="3,2"` = column 3, row 2 (1-based, from the top left; half steps such as `2.5` put a node between two columns, which is how to offset a row; `at="3"` sets only the column and is what swimlanes use). Cells are evenly spaced and sized by the viewer. Pin nodes only when the user asks for an exact arrangement; give every node in that area an `at`, because unpinned nodes are only nudged out of the way. Nodes without `at` stay fully automatic.
- Layout and arrows are automatic: connectors choose their sides, avoid nodes, and avoid crossing each other. Straight runs are kept straight. Do not try to fix a crossing by editing coordinates; change the structure or, if asked, pin with `at`.
- Mark anything the user did not say with `assumed`. It draws dashed with a small "assumed" tag. Remove it only when the user confirms.

## When the user wants exact positions
Use the grid, `at="col,row"`. Pixel coordinates do not exist in the source and must never be asked for or invented. Translate their words:
- "in one line" / "in a row": the same row number, columns 1, 2, 3...
- "above" / "below": a smaller / larger row number. "Offset" / "between": a half step, e.g. `at="2.5,2"` sits between columns 2 and 3.
- "left of" / "right of": a smaller / larger column.
Pin every node in the arrangement they described; unpinned nodes are only nudged out of the way, so anything the user said about placement must be pinned. Leave nodes they said nothing about on automatic layout.
Layout pasted from another tool (a draw.io file, a sketch, a screenshot): group the nodes by similar vertical position into rows and similar horizontal position into columns, keep their order, put nodes that sit between two columns on a half step, and never copy coordinates. If a position is unclear, ask one question with a guess ("Product between Domain and Source, one row up?").
A pasted file's content (names, labels) is the user's work: it goes in `diagrams\` (git-ignored), never into the example files that are committed.

## Node types
Short list; full table with symbols and rules in [reference/types.md](reference/types.md).
- General: `card` (process or task), `start`, `end`, `note`, `plain` (text or image with no frame)
- Flowchart: `decision`, `io`, `document`, `subprocess`, `manual`, `prep`, `data`, `connector`, `offpage`
- Process flow (BPMN): `event` + `kind=start|intermediate|end`, `gateway` + `kind=xor|and|or`, `task` (card), `dataobject`
- Data flow (DFD, Gane-Sarson): `dfd-process` + `num`, `datastore` + `num`, `entity`
- Ontology: `concept` (a circle; the default type inside `<diagram type="ontology">`)

Choose the diagram type and check it against the standards: see the `diagram-standards` skill.
For conversation rules see `diagram-conversation`; for the pasteable spec see `prototype-spec`.

## After make
- Read make's output. `⚠` lines are real problems (duplicate id, edge to a missing node, unknown lane). Fix them and re-run. `✗` means it refused the file; fix and re-run.
- Give the user the URL, not a description of the diagram. You do not need to check that the server is up: it reads files on every request. Only if the user says the page does not load, run `Start-ScheduledTask -TaskName DiagramServer`.
- Editing a diagram the user downloaded: take its `<diagram>` from the `<template id="diagram-source">` in the file, save it under `diagrams\`, edit, make. Saved `at="col,row"` values on nodes are the layout the user arranged by dragging, snapped to the grid; keep them unless asked to re-layout, and delete them all if you change the structure.
- The generated page contains the source, not coordinates: the layout is computed when it opens (always the same result). "Download HTML" writes the user's current arrangement back as `at` values.
- The viewer's code and tooling notes are in `C:\Users\affan.hamid\Tools\diagram\CLAUDE.md`. Only touch `src\` when asked.
