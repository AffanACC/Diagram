---
name: prototype-spec
description: Turn a diagramming conversation and its diagram into one spec the user can paste as-is into Copilot, Claude or any coding agent to build a prototype. Use when the user asks for a spec, a handoff, a prompt for an agent, "what do I give Copilot", or says the diagram looks right and wants to build from it. Not for writing code. Only contains what the user said or confirmed.
---

# Prototype spec

The diagram is the picture; the spec is the same thing in words an agent can build from. Write it
last, from the conversation and the final diagram, and nothing else.

## Rules
- Every line comes from the conversation or the diagram. Tag each line `[user said]`, `[assumed]` or `[TBD]`. Never fill a gap with your own idea; use `[TBD]`.
- List assumptions first with "Correct these before building."
- No repo, viewer or tool jargon (no `diagram-format`, no node `type` names). Describe the thing, not how it was drawn.
- Tool-agnostic: no framework or vendor unless the user named one. If they did not, write `Tech stack: [TBD]`.
- Short. Bullets and tables over prose. Measurable acceptance criteria ("shows an error if the order has no items"), not "easy" or "fast".
- Self-contained: an agent that never saw the diagram must be able to build from this alone.

## Template (fill in, keep this order, drop empty sections)
```markdown
# <Name> spec
Assumptions (correct these before building):
1. ...

## Objective
Problem, who it is for, why now. 1 to 3 lines.

## Flow
Numbered steps, or a list of "from -> to (label)" lines, in the order the diagram shows. Decisions as "If X: ... Otherwise: ...".
For a swimlane: group steps by role. For a data flow: list processes, stores, entities, and each flow with the data it carries.

## Users and roles
| Role | Does what |

## Screens / components  (only if the conversation covered them)
| Name | Purpose | Key content |

## Data
| Entity | Fields | Notes |

## Rules
Business rules and conditions, one per line.

## Acceptance criteria
One measurable, testable line per step or rule.

## Constraints
Platform, stack, integrations, data sensitivity. `[TBD]` if unstated.

## Out of scope
Everything the user ruled out, plus anything not discussed that an agent might add.

## Open questions
Unresolved items, as questions.
```

## Delivering it
1. Save to `C:\Users\affan.hamid\Tools\diagram\specs\<name>.md` (git-ignored, because specs may hold client information).
2. In chat, show the spec once inside a single markdown code block so it can be copied in one click, then one line: where it is saved.
3. Do not add commentary or a summary around it.
4. If the spec would reveal client names or data, say so in one line; the user decides what to paste where.
