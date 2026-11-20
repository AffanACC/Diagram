# Node types

`type="..."`. Aliases: `process` and `task` = `card`; `terminator` = `start`.
Content is the node's label (and optional detail). Do not set sizes.

## Flowchart (ISO 5807)
| type | Symbol | Use for |
|---|---|---|
| `start`, `end` | Rounded terminator | Where the flow begins and ends |
| `card` | Rectangle | A step that does something |
| `decision` | Diamond | A question with 2 or more labelled exits |
| `io` | Parallelogram | Input or output (forms, messages, reports) |
| `document` | Rectangle with wavy base | A document |
| `subprocess` | Rectangle with double side lines | A predefined process described elsewhere |
| `manual` | Trapezoid | A manual operation |
| `prep` | Hexagon | Preparation or set-up |
| `data` | Cylinder | Stored data, a database or file |
| `connector` | Small circle with a letter | On-page jump (content is one letter) |
| `offpage` | Pentagon | Continues on another page or diagram |

## Process flow (BPMN 2.0 core)
| type | Attributes | Symbol |
|---|---|---|
| `event` | `kind=start` thin circle, `intermediate` double circle, `end` thick circle | Label sits under the circle |
| `gateway` | `kind=xor` (X, one path), `and` (+, all paths), `or` (circle, one or more) | Diamond, label under it |
| `card` / `task` | none | Rounded task box |
| `subprocess` | none | Collapsed sub-process (drawn like the ISO predefined process) |
| `dataobject` | none | Page with folded corner; connect with a `dashed` edge |
Pools and lanes: `pool="..."` on `<diagram>` and `<lane>` elements (see SKILL.md). Message flow between pools: use a `dashed` edge.

## Data flow (Gane-Sarson)
| type | Attributes | Symbol |
|---|---|---|
| `dfd-process` | `num="1"`, `"1.2"` ... | Rounded box with a number band on top |
| `datastore` | `num="D1"` ... | Open-ended box with an id cell on the left |
| `entity` | none | Bold boxed external entity |
Every DFD edge needs a `label` naming the data.

## Ontology (`<diagram type="ontology">`, or per zone: `<zone type="ontology">`)
| type | Use for |
|---|---|
| `concept` | A circle with a bold label (default type in an ontology). Put a short example or identifier on a second line with `<small>`. All circles are drawn one size. |
Links are `<edge>` with a `label`; they are straight lines from circle edge to circle edge (curved only to get round another circle) and read source to target. `both` adds an arrowhead at each end. Nodes can be placed on the grid with `at`, including half steps.

## Tones (colour, any node type)
`tone="grey|blue|green|orange|purple|red"`. A fixed palette; nothing else is accepted (an unknown tone shows a warning and is ignored).

## General
| type | Use for |
|---|---|
| `card` | Heading + paragraph, list or table (any HTML), optional image |
| `note` | A dashed annotation |
| `plain` | Free text or an image with no frame |

## Groupings (not node types)
| Element | Use |
|---|---|
| `<lane label>` containing nodes | Swimlane rows by role (direction `LR`) |
| `<zone label>` containing nodes | A labelled box around a group: system boundary, stage, area, trust boundary. Zones nest. |
| `pool="..."` on `<diagram>` | Pool title strip for swimlanes |
| `skeleton` on `<diagram>` | Badge: the whole draft is assumed |

## Flags
`assumed` on a node or edge: dashed, tagged "assumed". Use for everything the user did not say.
