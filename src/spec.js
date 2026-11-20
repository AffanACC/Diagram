// Reads the authored diagram from the <template id="diagram-source"> element.
// The browser's own HTML parser does the work, so node content can be any HTML.
//
//   <diagram title=".." description=".." direction="LR|TB" pool="optional pool name">
//     <lane id="ops" label="Operations"></lane>              (optional swimlanes, LR only)
//     <node id="a" type="card" lane="ops" width="300" align="center" assumed>...any HTML...</node>
//     <node id="e" type="event" kind="start">Order received</node>
//     <node id="p" type="dfd-process" num="1.2">Validate order</node>
//     <edge from="a" to="b" label=".." dashed assumed></edge>
//   </diagram>
// Types and their attributes are listed at the top of shapes.js.

import { ALIASES, TYPES, EVENT_KINDS, GATEWAY_KINDS } from './shapes.js'

const num = (v) => {
  if (v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
// at="3,2" = column 3, row 2 on the diagram grid (1-based, from the top left). "3" alone
// sets only the column (used with swimlanes, where the lane decides the row).
function parseAt(v, id, problems) {
  if (v === null || v.trim() === '') return undefined
  const m = /^\s*(\d+)\s*(?:,\s*(\d+)\s*)?$/.exec(v)
  if (!m || Number(m[1]) < 1 || (m[2] !== undefined && Number(m[2]) < 1)) {
    problems.push(`Node "${id}" has an invalid at="${v}" (use column,row such as at="3,2")`)
    return undefined
  }
  return { col: Number(m[1]), row: m[2] === undefined ? undefined : Number(m[2]) }
}
const flag = (el, name) => el.hasAttribute(name) && el.getAttribute(name) !== 'false'

export function readSpec() {
  const problems = []
  const tpl = document.getElementById('diagram-source')
  const root = tpl && tpl.content.querySelector('diagram')
  if (!root) {
    return { title: 'No diagram found', nodes: [], edges: [], lanes: [], problems: ['No <diagram> element found'] }
  }
  const direction = root.getAttribute('direction') === 'TB' ? 'TB' : 'LR'

  const lanes = []
  root.querySelectorAll('lane').forEach((el) => {
    const id = el.getAttribute('id')
    if (!id) return problems.push('A <lane> has no id and was skipped')
    if (lanes.some((l) => l.id === id)) return problems.push(`Duplicate lane id "${id}" was skipped`)
    lanes.push({ id, label: el.getAttribute('label') || id })
  })
  if (lanes.length && direction === 'TB') problems.push('Lanes need direction="LR"; they were ignored')

  const seen = new Set()
  const nodes = []
  root.querySelectorAll('node').forEach((el) => {
    const id = el.getAttribute('id')
    if (!id) return problems.push('A <node> has no id and was skipped')
    if (seen.has(id)) return problems.push(`Duplicate node id "${id}" was skipped`)
    seen.add(id)

    const rawType = el.getAttribute('type') || 'card'
    let type = ALIASES[rawType] || rawType
    if (!TYPES.includes(type)) {
      problems.push(`Node "${id}" has unknown type "${rawType}" (using card)`)
      type = 'card'
    }
    let kind = el.getAttribute('kind') || undefined
    if (type === 'event') {
      if (!EVENT_KINDS.includes(kind)) {
        if (kind) problems.push(`Event "${id}" has unknown kind "${kind}" (using start)`)
        kind = 'start'
      }
    } else if (type === 'gateway') {
      if (!GATEWAY_KINDS.includes(kind)) {
        if (kind) problems.push(`Gateway "${id}" has unknown kind "${kind}" (using xor)`)
        kind = 'xor'
      }
    }
    const lane = el.getAttribute('lane') || undefined
    if (lane && lanes.length && !lanes.some((l) => l.id === lane)) {
      problems.push(`Node "${id}" is in unknown lane "${lane}"`)
    }
    nodes.push({
      id,
      type,
      kind,
      num: el.getAttribute('num') || '',
      lane,
      assumed: flag(el, 'assumed'),
      html: el.innerHTML.trim(),
      width: num(el.getAttribute('width')),
      height: num(el.getAttribute('height')),
      align: el.getAttribute('align') || undefined,
      at: parseAt(el.getAttribute('at'), id, problems),
    })
  })

  const edges = []
  root.querySelectorAll('edge').forEach((el) => {
    const from = el.getAttribute('from')
    const to = el.getAttribute('to')
    if (!seen.has(from) || !seen.has(to)) {
      return problems.push(`Edge ${from} -> ${to} points at a missing node`)
    }
    edges.push({
      from,
      to,
      label: el.getAttribute('label') || undefined,
      dashed: flag(el, 'dashed'),
      assumed: flag(el, 'assumed'),
    })
  })

  return {
    title: root.getAttribute('title') || 'Diagram',
    description: root.getAttribute('description') || '',
    pool: root.getAttribute('pool') || '',
    direction,
    lanes: direction === 'LR' ? lanes : [],
    nodes,
    edges,
    problems,
  }
}
