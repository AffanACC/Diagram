---
name: diagram-styling
description: The look of diagrams in the user's offline viewer: the slate design tokens, which colour means what, content rules for labels, and how to change the theme. Use when the user comments on how a diagram looks, asks for a style change, or when writing node content so the result stays consistent. The viewer already applies the style; do not restyle individual nodes.
---

# Diagram styling

The viewer applies one premium, calm theme to everything. Your job is to keep content clean and,
if the user asks for a different look, change the theme tokens once, in one place, from a named
source. Never style individual nodes.

## What you must not do
- No `style=`, colours, fonts, sizes, `width`, `height` or `align` on nodes or in content.
- No emoji or decorative characters in labels.
- No web fonts, CDN links or external images (client data stays local; make refuses them).
- Do not invent a new palette. Take values from a named, openly licensed source and record it.

## What the colours mean (so shapes carry the meaning)
| Role | Used by | Tone |
|---|---|---|
| Accent (indigo) | `start`, `end`, BPMN events | Entry and exit points |
| Warm (amber) | `decision`, `gateway` | Branching |
| Cool (sky) | `data`, data stores | Stored data |
| Neutral card | steps, tasks, ISO shapes, DFD processes | Work |
| Heavy outline | `entity` | Things outside the system |
| Dashed + "assumed" tag | anything marked `assumed` | Not yet confirmed |
If something needs emphasis, use its node type; do not colour it.

## Content rules
- Labels 2 to 5 words; detail in `<small>` or a card body.
- A `card` body is at most a heading plus two short lines, a short list, or a small table, unless the user gave more.
- Images only if the user supplied them (`<img src="images/name.png">`, file in `diagrams\images\`, a screenshot or logo). No stock or generated imagery.
- Plain `<h3>`, `<p>`, `<ul>`, `<table>`, `<small>`, `<b>`. The viewer styles them.

## Tokens (slate theme, light only)
Defined at the top of `C:\Users\affan.hamid\Tools\diagram\src\style.css` as CSS variables.
Source: Tailwind CSS default palette (MIT): slate-50 `#f8fafc` canvas, slate-300 `#cbd5e1` border, slate-400 `#94a3b8` lines, slate-500 `#64748b` muted text, slate-900 `#0f172a` text, indigo-600 `#4f46e5` + indigo-50 `#eef2ff` accent, amber-600 `#d97706` + amber-50 `#fffbeb` decision, sky-600 `#0284c7` + sky-50 `#f0f9ff` data. 12px radius, 1.25px stroke, soft shadow, 8px size grid, system font stack (Segoe UI). Values were written from the published palette, not re-checked against the repo.
Other open sources considered: the `cathrynlavery/diagram-design` editorial tokens (MIT; paper `#f5f5f5`, ink `#2d3142`, accent `#bf4520`, no shadows).

## Changing the look (only when asked)
1. Edit the `:root` variables in `src\style.css` (one place).
2. Rebuild once: `pnpm run build:viewer` in `C:\Users\affan.hamid\Tools\diagram`, then `pnpm run make`.
3. Say which source the new values came from.
A custom font means embedding it as base64 (licence permitting, for example OFL fonts); it adds roughly 100 to 300 KB per diagram. Ask first.
