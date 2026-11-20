# Data flow diagram (Gane-Sarson)

Sources: Wikipedia "Data-flow diagram" and university course-note digests. The Gane-Sarson symbol
shapes and most error rules are from lecture notes, not a primary standard. Items marked
[convention] are widely taught practice.

## Symbol -> viewer node type
| Concept | `type` | Symbol |
|---|---|---|
| Process | `dfd-process` with `num="1"`, `"1.2"`... | Rounded box with a number band on top |
| Data store | `datastore` with `num="D1"`... | Open-ended box with an id cell on the left |
| External entity | `entity` | Bold boxed name |
| Data flow | `<edge label="...">` | Labelled arrow |

## Levels
- **Context diagram (level 0)**: exactly one process for the whole system, the external entities, and the flows between them. No data stores.
- **Level 1**: breaks that process into 3 to 9 numbered processes (1, 2, 3...), adds the data stores.
- **Level 2**: breaks one level-1 process (numbered 1.1, 1.2...). One diagram per parent process.
- Keep the same entities and external flows on a child diagram as on its parent (balancing).

## Checklist: a DFD must pass
1. Context diagram: one process, no data stores.
2. Every flow starts or ends at a process: no store-to-store, entity-to-entity, entity-to-store or store-to-entity flows.
3. Every process has at least one input and one output (no black hole: inputs only; no miracle: outputs only).
4. Every output can be produced from the inputs shown (no grey hole).
5. Every flow has a label naming the data; labels are nouns, not verbs.
6. Every data store has at least one flow in and one flow out somewhere in the diagram set.
7. Process names are verb phrases, unique and numbered (1, 1.1, 1.1.1). Store names are plural nouns (Orders). Entities are nouns (Customer).
8. A child diagram is balanced with its parent: the same external flows, stores and entities.
9. About 3 to 9 processes per diagram [convention].
10. No control flow or decision logic: a DFD shows data, not sequence. If the user wants steps, switch to a flowchart.

## Authoring tips
- Use `direction="LR"`.
- An entity or store that both sends and receives creates a loop; the viewer routes backward flows over or under the diagram, so keep one node. Only draw a duplicate if the user asks.
- If a flow goes straight from an entity to a store, add the process that must sit between them and mark it `assumed`.
