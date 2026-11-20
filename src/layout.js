import { graphlib, layout } from '@dagrejs/dagre'

// Default [width, height] per shape kind. A node can override with "width"/"height".
export const SIZES = {
  start: [170, 54],
  end: [170, 54],
  process: [200, 66],
  decision: [180, 116],
  data: [170, 84],
  note: [200, 66],
}
export const KINDS = Object.keys(SIZES)

const sizeOf = (n) => {
  const [w, h] = SIZES[n.type] || SIZES.process
  return [n.width || w, n.height || h]
}

// Turns the JSON spec into React Flow nodes/edges. Positions come from dagre
// (auto-layout) unless a node supplies its own "position": {x, y}.
export function buildGraph(spec) {
  const dir = spec.direction === 'TB' ? 'TB' : 'LR'
  const rawNodes = Array.isArray(spec.nodes) ? spec.nodes : []
  const rawEdges = Array.isArray(spec.edges) ? spec.edges : []
  const ids = new Set(rawNodes.map((n) => n.id))
  const problems = []

  const edges = rawEdges.filter((e) => {
    const ok = ids.has(e.from) && ids.has(e.to)
    if (!ok) problems.push(`Edge ${e.from} -> ${e.to} points at a missing node`)
    return ok
  })

  const g = new graphlib.Graph()
  g.setGraph({ rankdir: dir, nodesep: 56, ranksep: 96, marginx: 24, marginy: 24 })
  g.setDefaultEdgeLabel(() => ({}))
  rawNodes.forEach((n) => {
    const [width, height] = sizeOf(n)
    g.setNode(n.id, { width, height })
  })
  edges.forEach((e) => g.setEdge(e.from, e.to))
  layout(g)

  const nodes = rawNodes.map((n) => {
    const [w, h] = sizeOf(n)
    const p = g.node(n.id)
    const position = n.position || { x: p.x - w / 2, y: p.y - h / 2 }
    const kind = KINDS.includes(n.type) ? n.type : 'process'
    if (n.type && !KINDS.includes(n.type)) {
      problems.push(`Node "${n.id}" has unknown type "${n.type}" (using process)`)
    }
    return {
      id: n.id,
      type: 'shape',
      position,
      data: { label: n.label ?? n.id, sub: n.sub, kind, w, h, dir },
      style: { width: w, height: h },
    }
  })

  const flowEdges = edges.map((e, i) => ({
    id: `e${i}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    type: 'smoothstep',
    label: e.label,
    markerEnd: { type: 'arrowclosed', width: 18, height: 18 },
    style: {
      stroke: 'var(--edge)',
      strokeWidth: 1.6,
      strokeDasharray: e.dashed ? '6 5' : undefined,
    },
    labelStyle: { fill: 'var(--text)', fontSize: 12, fontWeight: 600 },
    labelBgStyle: { fill: 'var(--card)', stroke: 'var(--border)' },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 6,
  }))

  return { nodes, edges: flowEdges, problems }
}
