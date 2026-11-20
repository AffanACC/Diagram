# Ontology (concept map / semantic network)

A very basic ontology: circles for concepts, labelled arrows for how they relate. There is no
single standard for this simple form; these rules are common practice from concept maps and
subject-predicate-object (triple) modelling, not read from a formal specification. Treat them as
defaults.

## Elements -> viewer
| Element | In the viewer |
|---|---|
| Concept (a kind of thing) | `<node>` inside `<diagram type="ontology">`; type defaults to `concept` (a circle) |
| Relation | `<edge from to label>`; reads source, then label, then target |
| Two-way relation | one `<edge ... both>` (arrowhead each end), named once |
| Not confirmed | `assumed` on the node or edge (dashed) |
| Category | `tone="..."` from the fixed palette (same tone = same category) |

## Checklist: an ontology must pass
1. Every node is a concept: a singular noun phrase of one to three words, capitalised ("Business term").
2. Every link has a label that is a short lower-case verb phrase ("contains", "linked to", "is a"); leave one unlabelled only if the user did.
3. Every link reads as a sentence from source to target: "Domain contains Product". If it reads backwards, flip the link or rename it.
4. Direction is meaningful. Use `both` only for a relation that truly runs both ways, and give it one label ("reads / writes").
5. One link per relation between two concepts; do not repeat a link. Different relations between the same two concepts are allowed (they fan out).
6. A subtype points from the specific to the general with the label "is a".
7. No sequence: no start, no end, no decisions. If the user describes steps, it is a flowchart or process flow, not an ontology.
8. Circles carry the name only; add at most one short second line (`<small>`) for an example or identifier.
9. Tones tell categories apart and are used sparingly (about five at most); say what each means in the reply.
10. Use the user's own words for concepts and relations; do not rename them.

## Authoring tips
- Circles are one size and links are straight, so spacing is automatic; use `at` only when the user wants a specific shape (a row of concepts with others offset above or below it: use half steps, `at="2.5,2"`).
- Disconnected groups are fine; they sit side by side.
