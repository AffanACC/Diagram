---
name: diagram-standards
description: Pick the right diagram notation and check a diagram against it before showing it. Covers flowcharts (ISO 5807), process flow diagrams as BPMN swimlanes, and data flow diagrams (Gane-Sarson, context diagram and levels). Use whenever drawing or reviewing any flowchart, process flow, swimlane, BPMN or DFD, so symbols and rules follow the standard rather than improvisation.
---

# Diagram standards

## 1. Pick the type from what the user wants to show
| The user wants to show... | Use | Notation | Reference |
|---|---|---|---|
| Steps and decisions of one procedure or algorithm | Flowchart | ISO 5807 symbols | [flowchart.md](reference/flowchart.md) |
| Who does what, handoffs between people, teams or systems | Process flow (swimlane) | BPMN 2.0 core | [process-flow.md](reference/process-flow.md) |
| How data moves between processes, stores and outside parties | Data flow diagram | Gane-Sarson | [dfd.md](reference/dfd.md) |
| What things are and how they relate (concepts and links, no sequence) | Ontology | Concept circles with labelled directed links | [ontology.md](reference/ontology.md) |

"Process flow diagram" means the business/IT swimlane meaning (BPMN), not the chemical-engineering plant diagram. If the user clearly means a plant diagram, say it is out of scope for this viewer.
Mixed asks: draw one diagram per question. Do not mix notations in one diagram.
If the type is not obvious, choose the closest and say which in one line.

## 2. Map the notation onto viewer node types
Each reference file ends with a symbol-to-`type` table. Use only those types (see `diagram-format`). Never invent a shape or improvise a symbol's meaning.

## 3. Check before delivering
Open the reference for the chosen type and run its checklist against the diagram.
- Fix failures yourself and re-run `make`. Do not narrate the check.
- If a fix needs content the user did not give (a missing end, an unnamed data flow), add the minimum and mark it `assumed`.
- Tell the user only about failures that need their decision.

## 4. Size
Aim for 6 to 15 nodes per diagram so it reads at a glance. More than that: split by level (DFD: context diagram then level 1), by sub-process (use a `subprocess` node and a second diagram), or by lane. Do not shrink labels to fit.

## 5. Naming (all types)
- Short labels, 2 to 5 words. Detail goes in a `<small>` line or a `card` body.
- Steps: verb + object ("Validate order"). Decisions: a question ("Order valid?"), every exit labelled. Events: object + past participle ("Invoice received"). Data flows: nouns naming the information ("Order details").
- Use the user's own words for names. Do not rename their terms.

## 6. Where sources disagree (our decisions)
- A flowchart decision may have more than two exits if every exit is labelled.
- DFD notation is Gane-Sarson (rounded process with a number band, open-ended store). Yourdon-DeMarco circles are not supported.
- DFD level naming: context diagram = level 0; first breakdown = level 1; number processes 1, 2, 3 and children 1.1, 1.2.
- Rules marked "common convention" in the references are widely used practice, not read from the standard text itself (ISO 5807 is paywalled; the BPMN spec PDF was not read). Treat them as defaults, not law.
