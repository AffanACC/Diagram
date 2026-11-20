import { graphlib, layout } from '@dagrejs/dagre'

const MAX_W = 300
const MAX_W_PILL = 320
const DECISION_W = 220

const SAME_AS_MEASURED_ALIGN = { start: 'center', end: 'center', decision: 'center', data: 'center' }
export const alignFor = (n) => n.align || SAME_AS_MEASURED_ALIGN[n.type] || 'left'

// Renders every node's real HTML off-screen (same CSS as the final nodes) to learn its
// size, so dagre can lay out nodes of any content: headings, paragraphs, images...
export async function measureNodes(nodes) {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;'
  document.body.appendChild(host)

  const els = nodes.map((n) => {
    const el = document.createElement('div')
    el.className = `shape shape-${n.type}`
    if (n.type === 'decision') {
      el.style.width = `${n.width || DECISION_W}px`
    } else if (n.width) {
      el.style.width = `${n.width}px`
    } else {
      el.style.width = 'max-content'
      el.style.maxWidth = `${n.type === 'start' || n.type === 'end' ? MAX_W_PILL : MAX_W}px`
    }
    el.innerHTML = `<div class="text"><div class="content" style="text-align:${alignFor(n)}">${n.html}</div></div>`
    host.appendChild(el)
    return el
  })

  // Wait for images (they are inlined data: URIs, so this is quick).
  const imgs = [...host.querySelectorAll('img')].filter((i) => !i.complete)
  await Promise.all(imgs.map((i) => i.decode().catch(() => {})))

  const sizes = new Map()
  nodes.forEach((n, i) => {
    const r = els[i].getBoundingClientRect()
    let w = Math.ceil(r.width)
    let h = Math.ceil(r.height)
    if (n.type === 'decision') {
      // A diamond only fits text in its middle half, so it needs about twice the text height.
      w = n.width || DECISION_W
      h = Math.max(n.height || 0, 100, h * 2)
    } else {
      if (n.height) h = Math.max(h, n.height)
    }
    sizes.set(n.id, [w, h])
  })
  host.remove()
  return sizes
}

// Spec + measured sizes -> React Flow nodes/edges. Positions come from dagre unless a node
// has x/y (set by "Download HTML" after you drag things) and useManual is true.
export function buildGraph(spec, sizes, { useManual = true } = {}) {
  const g = new graphlib.Graph()
  g.setGraph({ rankdir: spec.direction, nodesep: 56, ranksep: 96, marginx: 24, marginy: 24 })
  g.setDefaultEdgeLabel(() => ({}))
  spec.nodes.forEach((n) => {
    const [width, height] = sizes.get(n.id)
    g.setNode(n.id, { width, height })
  })
  spec.edges.forEach((e) => g.setEdge(e.from, e.to))
  layout(g)

  const nodes = spec.nodes.map((n) => {
    const [w, h] = sizes.get(n.id)
    const p = g.node(n.id)
    const manual = useManual && n.x !== undefined && n.y !== undefined
    return {
      id: n.id,
      type: 'shape',
      position: manual ? { x: n.x, y: n.y } : { x: p.x - w / 2, y: p.y - h / 2 },
      data: { html: n.html, kind: n.type, w, h, dir: spec.direction, align: alignFor(n) },
      style: { width: w, height: h },
    }
  })

  const edges = spec.edges.map((e, i) => ({
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

  return { nodes, edges }
}
