# Flowchart (ISO 5807 / ANSI)

Sources: ISO 5807:1985 as summarised on Wikipedia "Flowchart" (symbols and meanings). Items marked
[convention] are common practice, not confirmed from the standard text.

## Symbol -> viewer node type
| Symbol | Meaning | `type` |
|---|---|---|
| Rounded terminator | Start or end | `start`, `end` |
| Rectangle | Process step | `card` |
| Diamond | Decision | `decision` |
| Parallelogram | Input / output | `io` |
| Rectangle, wavy base | Document | `document` |
| Rectangle, double side lines | Predefined process (defined elsewhere) | `subprocess` |
| Trapezoid | Manual operation | `manual` |
| Hexagon | Preparation / initialisation | `prep` |
| Cylinder | Stored data, file, database | `data` |
| Small circle with a letter | On-page connector | `connector` |
| Pentagon | Off-page connector | `offpage` |
| Dashed note | Annotation | `note` |

## Checklist: a flowchart must pass
1. Exactly one `start` [convention]; it has no incoming edge.
2. At least one `end`; it has no outgoing edge.
3. Every other node has at least one incoming and one outgoing edge.
4. Every path from the start reaches an end: no dead ends, no unreachable nodes.
5. Every `decision` has two or more outgoing edges, each with a label (Yes/No or the outcome).
6. Decision text is a question; process text is verb + object [convention].
7. Non-decision nodes have a single exit [convention].
8. Shapes are used only for their standard meaning (`io` for input/output, `document` for paper, `data` for storage).
9. Connectors come in matching pairs by letter; an `offpage` points to something that exists.
10. Flow reads top to bottom or left to right: use `direction="TB"` (default choice for flowcharts) or `LR`.

## Authoring tips
- `direction="TB"` for algorithms and procedures.
- Keep the happy path straight; put exceptions off to the side (the layout does this for you).
- Loops back to an earlier step are fine; just label the decision that causes them.
