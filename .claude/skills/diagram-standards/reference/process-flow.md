# Process flow (business / IT): BPMN 2.0 swimlane

Sources: Wikipedia "Business Process Model and Notation" and "Swimlane" (element shapes). BPMN is
OMG's standard (ISO/IEC 19510). Items marked [convention] are common BPMN style guidance, not
confirmed from the specification text.

## Element -> viewer node type
| BPMN element | `type` and attributes | Symbol |
|---|---|---|
| Start event | `event` `kind="start"` | Thin circle |
| Intermediate event | `event` `kind="intermediate"` | Double circle |
| End event | `event` `kind="end"` | Thick circle |
| Task | `task` (or `card`) | Rounded box |
| Sub-process | `subprocess` | Collapsed box (drawn like an ISO predefined process) |
| Exclusive gateway (XOR) | `gateway` `kind="xor"` | Diamond with X: one path |
| Parallel gateway (AND) | `gateway` `kind="and"` | Diamond with +: all paths |
| Inclusive gateway (OR) | `gateway` `kind="or"` | Diamond with circle: one or more |
| Data object | `dataobject` | Page; link with a `dashed` edge |
| Annotation | `note` | Dashed note |
| Pool | `pool="..."` on `<diagram>` | Container strip on the left |
| Lane | `<lane id label>` + `lane="id"` on nodes | Row band per role |
| Sequence flow | `<edge>` | Solid arrow, inside one pool |
| Message flow | `<edge dashed>` | Dashed arrow between different pools |

Use `direction="LR"` with lanes. Defer: event-based, complex and transaction gateways; call activities.

## Checklist: a process flow must pass
1. At least one start event and one end event; starts have no incoming flow, ends have no outgoing flow.
2. Every task and gateway has incoming and outgoing flow.
3. Sequence flow stays inside one pool; message flow connects different pools [convention].
4. Every node sits in exactly one lane; lanes are roles, teams or systems (nouns), not steps.
5. Every XOR/OR split has labelled outgoing flows; the gateway text is a question.
6. A split is closed by a matching join of the same kind (AND with AND, XOR with an XOR merge) [convention].
7. Gateways route only; they do no work.
8. Tasks are verb + object ("Approve invoice"); events are object + past participle ("Invoice received").
9. Data objects attach by dashed association, not sequence flow.
10. Every path ends in an end event; no dangling flows.
11. Handoffs between lanes are visible (an edge crosses the lane boundary).

## Authoring tips
- Put each step in the lane of whoever does it. If the user has not said who, use `assumed` on the lane assignment by marking the node `assumed`.
- 3 to 6 lanes reads well; split the process if there are more.
- Lanes fix node positions automatically, so dragging is for exploring only.
