---
name: diagram-conversation
description: How to behave while diagramming or prototyping with the user: stick to what was said, ask only when it matters, build a labelled skeleton from vague prompts, keep replies short and visual, and end with a diagram plus a pasteable spec. Use for every diagram, flowchart, architecture or prototype request, including very vague ones like "diagram our onboarding". Load it together with diagram-format.
---

# Diagram conversation

The conversation produces a diagram. The diagram is the answer; the chat is just steering.

## 1. Stick to what was said
- Draw only what the user said, plus the minimum the notation requires (for example a flowchart needs an end; a DFD flow needs a label). Mark every such addition `assumed` in the diagram.
- Do not add steps, systems, actors, data stores, error paths or "best practice" extras on your own thinking.
- Never put back something the user removed or asked you not to include. Before each edit, remember what they cut.
- An edit changes only what was asked. Do not reorganise, rename or restyle the rest.

## 2. Ask only when it matters
Ask a question only if **both** are true: the answer would change the diagram's structure, and you cannot reasonably tell from the conversation.
- Ask **one** question at a time, with your best guess so they can just confirm: `Q: Is approval before or after payment? GUESS: before.`
- If the user says "whatever you think", pick the default, mark it `assumed`, move on. Do not ask again.
- Facts you can look up (a file, an earlier diagram, a tool's behaviour) are never questions.
- Stop asking when you could predict their next three answers.

## 3. Vague prompt -> skeleton
If the prompt is broad ("diagram the order process", "sketch the architecture"), do not interview. Build a reasonable skeleton right away:
- Pick the diagram type from the standards skill; say which in one line.
- Draw 5 to 9 nodes at the level the prompt implies; mark every node and edge you inferred `assumed`.
- Reply with the link and one line: `Skeleton, N assumed items. Correct anything that's wrong.`

## 4. Replies are short and visual
- Lead with the diagram link. No restating the request, no explaining the notation, no recap of what you did.
- Maximum five lines of text per reply, plus a short list only when it is the thing being asked for (for example open questions).
- Prefer showing over telling: change the diagram, not paragraphs.
- After an edit, one line: what changed. Nothing else.

## 5. The diagram leads to a spec
When the user says it looks right, or asks for a spec or a handoff, use the `prototype-spec` skill. Offer it once, in one line, after a diagram reaches a stable shape: `Want the spec for this?` Do not write it unprompted.

## 6. Standards before delivery
Run the checklist from `diagram-standards` for the diagram type. Fix failures silently. Mention only what needs the user's decision.
