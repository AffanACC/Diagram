// Reads the authored diagram from the <template id="diagram-source"> element.
// The browser's own HTML parser does the work, so node content can be any HTML.
//
//   <diagram title=".." description=".." direction="LR|TB">
//     <node id="a" type="card" width="300" align="center" x="10" y="20"> ...any HTML... </node>
//     <edge from="a" to="b" label=".." dashed></edge>
//   </diagram>

export const KINDS = ['start', 'end', 'card', 'decision', 'data', 'note', 'plain']
const normKind = (t) => (t === 'process' ? 'card' : t)

const num = (v) => {
  if (v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export function readSpec() {
  const problems = []
  const tpl = document.getElementById('diagram-source')
  const root = tpl && tpl.content.querySelector('diagram')
  if (!root) {
    return { title: 'No diagram found', nodes: [], edges: [], problems: ['No <diagram> element found'] }
  }

  const seen = new Set()
  const nodes = []
  root.querySelectorAll('node').forEach((el) => {
    const id = el.getAttribute('id')
    if (!id) return problems.push('A <node> has no id and was skipped')
    if (seen.has(id)) return problems.push(`Duplicate node id "${id}" was skipped`)
    seen.add(id)
    const rawType = el.getAttribute('type') || 'card'
    const type = normKind(rawType)
    if (!KINDS.includes(type)) problems.push(`Node "${id}" has unknown type "${rawType}" (using card)`)
    nodes.push({
      id,
      type: KINDS.includes(type) ? type : 'card',
      html: el.innerHTML.trim(),
      width: num(el.getAttribute('width')),
      height: num(el.getAttribute('height')),
      align: el.getAttribute('align') || undefined,
      x: num(el.getAttribute('x')),
      y: num(el.getAttribute('y')),
    })
  })

  const edges = []
  root.querySelectorAll('edge').forEach((el) => {
    const from = el.getAttribute('from')
    const to = el.getAttribute('to')
    if (!seen.has(from) || !seen.has(to)) {
      return problems.push(`Edge ${from} -> ${to} points at a missing node`)
    }
    const dashed = el.hasAttribute('dashed') && el.getAttribute('dashed') !== 'false'
    edges.push({ from, to, label: el.getAttribute('label') || undefined, dashed })
  })

  return {
    title: root.getAttribute('title') || 'Diagram',
    description: root.getAttribute('description') || '',
    direction: root.getAttribute('direction') === 'TB' ? 'TB' : 'LR',
    nodes,
    edges,
    problems,
  }
}
