import { graphlib, layout } from '@dagrejs/dagre'
import { shapeMarkup, OUTSIDE, GLYPH_H } from './shapes.js'

const MAX_W = 300
const MAX_W_PILL = 320
const MAX_W_OUTSIDE = 150
const DECISION_W = 220
const CONNECTOR = 38

const classOf = (n) => `shape shape-${n.type}${n.assumed ? ' assumed' : ''}`

// Renders every node's real markup off-screen (same CSS as the final nodes) to learn its
// size, so dagre can lay out nodes of any content: headings, paragraphs, images...
export async function measureNodes(nodes) {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;'
  document.body.appendChild(host)

  const els = nodes.map((n) => {
    const el = document.createElement('div')
    el.className = classOf(n)
    if (n.type === 'decision') {
      el.style.width = `${n.width || DECISION_W}px`
    } else if (n.type === 'connector') {
      el.style.width = `${CONNECTOR}px`
      el.style.height = `${CONNECTOR}px`
    } else if (n.width) {
      el.style.width = `${n.width}px`
    } else {
      el.style.width = 'max-content'
      el.style.maxWidth = `${n.type === 'start' || n.type === 'end' ? MAX_W_PILL : OUTSIDE.has(n.type) ? MAX_W_OUTSIDE : MAX_W}px`
    }
    el.innerHTML = shapeMarkup(n)
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
      const textH = Math.ceil(els[i].querySelector('.text').getBoundingClientRect().height)
      h = Math.max(n.height || 0, 100, textH * 2)
    } else if (n.type === 'connector') {
      w = h = CONNECTOR
    } else if (n.height) {
      h = Math.max(h, n.height)
    }
    sizes.set(n.id, [w, h])
  })
  host.remove()
  harmonize(nodes, sizes)
  return sizes
}

const GRID = 8
const snap = (v) => Math.ceil(v / GRID) * GRID

// The diagram grid for at="col,row": one cell is the largest node plus breathing room, so any
// node fits any cell and a grid layout is always evenly spaced.
export function gridSize(sizes) {
  let w = 0
  let h = 0
  sizes.forEach(([sw, sh]) => {
    w = Math.max(w, sw)
    h = Math.max(h, sh)
  })
  return { colW: snap(w) + 72, rowH: snap(h) + 56 }
}

// Nodes with at="col,row" go to the middle of that cell. Automatic nodes that end up on top of
// a pinned one slide sideways until clear.
function pinToGrid(spec, sizes, pos) {
  const pinned = spec.nodes.filter((n) => n.at && n.at.col && n.at.row)
  if (pinned.length === 0) return
  const { colW, rowH } = gridSize(sizes)
  pinned.forEach((n) => {
    const p = pos.get(n.id)
    p.x = (n.at.col - 1) * colW
    p.y = (n.at.row - 1) * rowH
  })
  const pinnedIds = new Set(pinned.map((n) => n.id))
  const cross = spec.direction === 'TB' ? 'x' : 'y'
  const overlaps = (id) =>
    spec.nodes.some((o) => {
      if (o.id === id) return false
      const a = pos.get(o.id)
      const b = pos.get(id)
      return (
        Math.abs(a.x - b.x) < (sizes.get(o.id)[0] + sizes.get(id)[0]) / 2 + 16 &&
        Math.abs(a.y - b.y) < (sizes.get(o.id)[1] + sizes.get(id)[1]) / 2 + 16
      )
    })
  spec.nodes
    .filter((n) => !pinnedIds.has(n.id))
    .forEach((n) => {
      const p = pos.get(n.id)
      const start = p[cross]
      for (let k = 1; k <= 80 && overlaps(n.id); k++) p[cross] = start + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 8
    })
}

// For "Download HTML": turns dragged positions into grid cells (nearest free cell each), so the
// saved file says at="3,2" and not pixels.
export function snapToGrid(shapeNodes) {
  const { colW, rowH } = gridSize(new Map(shapeNodes.map((n) => [n.id, [n.data.w, n.data.h]])))
  const taken = new Set()
  const cells = new Map()
  shapeNodes.forEach((n) => {
    const col = Math.round((n.position.x + n.data.w / 2) / colW)
    const row = Math.round((n.position.y + n.data.h / 2) / rowH)
    let spot = null
    for (let r = 0; r < 20 && !spot; r++)
      for (let dy = -r; dy <= r && !spot; dy++)
        for (let dx = -r; dx <= r && !spot; dx++)
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && !taken.has(`${col + dx},${row + dy}`)) spot = { col: col + dx, row: row + dy }
    taken.add(`${spot.col},${spot.row}`)
    cells.set(n.id, spot)
  })
  const minCol = Math.min(...[...cells.values()].map((c) => c.col))
  const minRow = Math.min(...[...cells.values()].map((c) => c.row))
  cells.forEach((c) => {
    c.col = c.col - minCol + 1
    c.row = c.row - minRow + 1
  })
  return cells
}

// Keeps diagrams tidy without anyone choosing sizes: nodes of the same type whose measured
// sizes are close get the SAME size (the largest in the group, so text is never clipped),
// and every size is rounded up to an 8px grid. Nodes with an explicit width/height attribute
// and fixed-size shapes are left alone.
function harmonize(nodes, sizes) {
  const byType = new Map()
  nodes.forEach((n) => {
    if (n.type === 'connector') return
    if (!byType.has(n.type)) byType.set(n.type, [])
    byType.get(n.type).push(n)
  })
  for (const group of byType.values()) {
    for (const dim of [0, 1]) {
      const auto = group.filter((n) => (dim === 0 ? !n.width : !n.height))
      const sorted = [...auto].sort((a, b) => sizes.get(a.id)[dim] - sizes.get(b.id)[dim])
      let i = 0
      while (i < sorted.length) {
        const start = sizes.get(sorted[i].id)[dim]
        let j = i
        while (j + 1 < sorted.length && sizes.get(sorted[j + 1].id)[dim] - start <= Math.max(32, start * 0.25)) j++
        const size = snap(sizes.get(sorted[j].id)[dim])
        for (let k = i; k <= j; k++) sizes.get(sorted[k].id)[dim] = size
        i = j + 1
      }
    }
  }
}

// Straightening: connectors with a bend that serves no purpose are removed by sliding nodes.
//  1. Where one node leads only to one next node (and that node is fed only by it), slide the
//     next node so the connector is a straight line. Chains of steps end up in one line.
//  2. Branches that are only a little off line are lined up too; a neighbour in the same
//     column may be nudged away to make room.
//  3. Chains are straightened again, since step 2 may have moved a node.
// A move is only made if it keeps a gap to every other node. Real branches keep their bends.
function straighten(spec, sizes, pos) {
  const horizontal = spec.direction !== 'TB'
  const cross = horizontal ? 'y' : 'x'
  const main = horizontal ? 'x' : 'y'
  const typeOf = new Map(spec.nodes.map((n) => [n.id, n.type]))
  const span = (id, axis) => sizes.get(id)[axis === 'x' ? 0 : 1]
  // Shapes with the label under a symbol connect at the symbol, so line up the symbol.
  const anchor = (id) => (horizontal && OUTSIDE.has(typeOf.get(id)) ? GLYPH_H[typeOf.get(id)] / 2 - span(id, 'y') / 2 : 0)

  const forward = spec.edges.filter((e) => e.from !== e.to && pos.get(e.to)[main] > pos.get(e.from)[main])
  const outs = new Map()
  const ins = new Map()
  forward.forEach((e) => {
    if (!outs.has(e.from)) outs.set(e.from, new Set())
    if (!ins.has(e.to)) ins.set(e.to, new Set())
    outs.get(e.from).add(e.to)
    ins.get(e.to).add(e.from)
  })
  const wantFor = (e) => pos.get(e.from)[cross] + (horizontal ? anchor(e.from) - anchor(e.to) : 0)
  const blockersOf = (id, c) =>
    spec.nodes.filter((o) => {
      if (o.id === id) return false
      const p = pos.get(o.id)
      const closeMain = Math.abs(p[main] - pos.get(id)[main]) < (span(o.id, main) + span(id, main)) / 2 + 16
      const closeCross = Math.abs(p[cross] - c) < (span(o.id, cross) + span(id, cross)) / 2 + 16
      return closeMain && closeCross
    })
  const order = [...spec.nodes].sort((a, b) => pos.get(a.id)[main] - pos.get(b.id)[main])

  const chains = () =>
    order.forEach((u) => {
      const targets = outs.get(u.id)
      if (!targets || targets.size !== 1) return
      const v = [...targets][0]
      if (ins.get(v).size !== 1) return
      const want = wantFor({ from: u.id, to: v })
      if (Math.abs(pos.get(v)[cross] - want) > 0.5 && blockersOf(v, want).length === 0) pos.get(v)[cross] = want
    })

  const branches = () =>
    forward.forEach((e) => {
      const v = e.to
      if (ins.get(v).size !== 1) return
      const want = wantFor(e)
      const off = Math.abs(pos.get(v)[cross] - want)
      // "A little off" = less than the node's own size across: that is a jog, not a branch.
      if (!(off > 0.5 && off <= Math.max(48, span(v, cross) * 0.8))) return
      const blockers = blockersOf(v, want)
      if (blockers.length === 0) {
        pos.get(v)[cross] = want
        return
      }
      // Only nudge neighbours in the same column.
      if (blockers.some((b) => Math.abs(pos.get(b.id)[main] - pos.get(v)[main]) > 1)) return
      const moves = blockers.map((b) => {
        const dir = Math.sign(pos.get(b.id)[cross] - want) || 1
        return [b.id, want + dir * ((span(b.id, cross) + span(v, cross)) / 2 + 24)]
      })
      const before = new Map([[v, pos.get(v)[cross]], ...moves.map(([id]) => [id, pos.get(id)[cross]])])
      moves.forEach(([id, c]) => (pos.get(id)[cross] = c))
      pos.get(v)[cross] = want
      const ok = [...before.keys()].every((id) => blockersOf(id, pos.get(id)[cross]).length === 0)
      if (!ok) before.forEach((c, id) => (pos.get(id)[cross] = c))
    })

  chains()
  branches()
  chains()
}

// Swimlanes: dagre gives each node a column (x); lanes give it a row band (y).
//  - A node in a lane takes the same row as the step before it, so a run of steps is one line.
//  - Nodes that would overlap sideways are stacked on extra rows inside the lane.
//  - A document, note or free text with a single link to a step in the same lane is placed
//    directly under that step, so its connector is a short straight line.
function laneLayout(spec, sizes, pos, useManual) {
  const PAD = 28
  const GAP = 24
  const SIDE_GAP = 28
  const LABEL_W = 40
  const POOL_W = spec.pool ? 38 : 0
  const ANNOTATION = new Set(['dataobject', 'note', 'plain'])
  const problems = []
  const laneIndex = new Map(spec.lanes.map((l, i) => [l.id, i]))

  const laneOf = new Map()
  const groups = spec.lanes.map(() => [])
  spec.nodes.forEach((n) => {
    let i = laneIndex.get(n.lane)
    if (i === undefined) {
      if (!n.lane) problems.push(`Node "${n.id}" has no lane (placed in the first lane)`)
      i = 0
    }
    laneOf.set(n.id, i)
    groups[i].push(n)
  })

  const neighbours = new Map(spec.nodes.map((n) => [n.id, []]))
  const incoming = new Map(spec.nodes.map((n) => [n.id, []]))
  spec.edges.forEach((e) => {
    neighbours.get(e.from).push(e.to)
    neighbours.get(e.to).push(e.from)
    incoming.get(e.to).push(e.from)
  })

  const minX = Math.min(...spec.nodes.map((n) => pos.get(n.id).x - sizes.get(n.id)[0] / 2))
  const maxX = Math.max(...spec.nodes.map((n) => pos.get(n.id).x + sizes.get(n.id)[0] / 2))
  const shift = POOL_W + LABEL_W + 48 - minX
  // A node with at="col" is placed on the column grid; the others follow the automatic layout.
  const { colW } = gridSize(sizes)
  const x0Of = (n) =>
    useManual && n.at
      ? POOL_W + LABEL_W + 48 + (n.at.col - 1) * colW + (colW - sizes.get(n.id)[0]) / 2
      : pos.get(n.id).x - sizes.get(n.id)[0] / 2 + shift
  let maxRight = maxX + shift

  const placed = new Map()
  const bands = []
  let top = 0
  groups.forEach((members, li) => {
    // Annotations with one link to a step in this lane hang under that step.
    const hangs = new Map()
    members.forEach((n) => {
      const nb = neighbours.get(n.id)
      if (!ANNOTATION.has(n.type) || nb.length !== 1) return
      const anchor = spec.nodes.find((m) => m.id === nb[0])
      if (anchor && laneOf.get(anchor.id) === li && !ANNOTATION.has(anchor.type)) hangs.set(n.id, anchor.id)
    })
    const mains = members.filter((n) => !hangs.has(n.id))

    const rows = []
    const rowOf = new Map()
    const xOf = new Map()
    const fits = (r, l, right) => (rows[r] || []).every(([al, ar]) => right + SIDE_GAP <= al || l >= ar + SIDE_GAP)
    const put = (id, r, l, w) => {
      if (!rows[r]) rows[r] = []
      rows[r].push([l, l + w])
      rowOf.set(id, r)
      xOf.set(id, l)
    }

    ;[...mains]
      .sort((a, b) => x0Of(a) - x0Of(b) || (ANNOTATION.has(a.type) ? 1 : 0) - (ANNOTATION.has(b.type) ? 1 : 0) || pos.get(a.id).y - pos.get(b.id).y)
      .forEach((n) => {
        const w = sizes.get(n.id)[0]
        const l = x0Of(n)
        let r = incoming.get(n.id).filter((id) => rowOf.has(id)).map((id) => rowOf.get(id)).find((pr) => fits(pr, l, l + w))
        if (r === undefined) {
          r = 0
          while (!fits(r, l, l + w)) r++
        }
        put(n.id, r, l, w)
      })
    hangs.forEach((anchorId, id) => {
      const w = sizes.get(id)[0]
      const aw = sizes.get(anchorId)[0]
      const l = xOf.get(anchorId) + aw / 2 - w / 2
      let r = rowOf.get(anchorId) + 1
      while (!fits(r, l, l + w)) r++
      put(id, r, l, w)
    })

    const rowCount = Math.max(1, rows.length)
    const rowH = Math.max(40, ...members.map((n) => sizes.get(n.id)[1]))
    const height = Math.max(120, rowCount * rowH + (rowCount - 1) * GAP + PAD * 2)
    members.forEach((n) => {
      const h = sizes.get(n.id)[1]
      // Rows line up on the point connectors attach to: the middle of the shape, or of the
      // symbol when the label sits under it (events, gateways).
      const anchor = OUTSIDE.has(n.type) ? GLYPH_H[n.type] / 2 : h / 2
      const centre = rowCount === 1 ? top + height / 2 : top + PAD + rowOf.get(n.id) * (rowH + GAP) + rowH / 2
      placed.set(n.id, { x: xOf.get(n.id), y: centre - anchor })
      maxRight = Math.max(maxRight, xOf.get(n.id) + sizes.get(n.id)[0])
    })
    bands.push({ id: spec.lanes[li].id, label: spec.lanes[li].label, top, height, odd: li % 2 === 1 })
    top += height
  })

  const bandX = POOL_W
  const bandW = maxRight + 48 - bandX
  const laneNodes = bands.map((b) => ({
    id: `lane:${b.id}`,
    type: 'lane',
    position: { x: bandX, y: b.top },
    data: { label: b.label, w: bandW, h: b.height, odd: b.odd },
    style: { width: bandW, height: b.height },
    draggable: false,
    selectable: false,
    focusable: false,
    zIndex: -2,
  }))
  if (spec.pool) {
    laneNodes.push({
      id: 'lane:__pool',
      type: 'lane',
      position: { x: 0, y: 0 },
      data: { label: spec.pool, w: POOL_W, h: top, pool: true },
      style: { width: POOL_W, height: top },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
    })
  }
  return { placed, laneNodes, problems }
}

// Spec + measured sizes -> React Flow nodes/edges. Positions come from dagre unless a node
// has x/y (set by "Download HTML" after you drag things) and useManual is true. With lanes,
// the lane layout always decides positions.
export function buildGraph(spec, sizes, { useManual = true } = {}) {
  const g = new graphlib.Graph()
  g.setGraph({ rankdir: spec.direction, nodesep: 64, ranksep: 88, edgesep: 24, marginx: 24, marginy: 24 })
  g.setDefaultEdgeLabel(() => ({}))
  spec.nodes.forEach((n) => {
    const [width, height] = sizes.get(n.id)
    g.setNode(n.id, { width, height })
  })
  // Labelled edges reserve room for their label so labels do not land on arrows or nodes.
  spec.edges.forEach((e) =>
    g.setEdge(e.from, e.to, e.label ? { width: Math.max(44, e.label.length * 7 + 20), height: 24, labelpos: 'c' } : {}),
  )
  layout(g)
  const pos = new Map(spec.nodes.map((n) => [n.id, g.node(n.id)]))
  if (spec.lanes.length === 0) {
    straighten(spec, sizes, pos)
    if (useManual) pinToGrid(spec, sizes, pos)
  }

  const lanes = spec.lanes.length > 0 && spec.nodes.length > 0 ? laneLayout(spec, sizes, pos, useManual) : null

  const shapeNodes = spec.nodes.map((n) => {
    const [w, h] = sizes.get(n.id)
    const p = pos.get(n.id)
    let position = { x: p.x - w / 2, y: p.y - h / 2 }
    if (lanes) position = lanes.placed.get(n.id)
    return {
      id: n.id,
      type: 'shape',
      position,
      data: {
        markup: shapeMarkup(n),
        kind: n.type,
        w,
        h,
        dir: spec.direction,
        assumed: n.assumed,
        glyphH: OUTSIDE.has(n.type) ? GLYPH_H[n.type] : 0,
      },
      style: { width: w, height: h },
    }
  })

  const edges = spec.edges.map((e, i) => ({
    id: `e${i}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    type: 'routed',
    label: e.label,
    markerEnd: { type: 'arrowclosed', width: 18, height: 18 },
    style: {
      stroke: 'var(--edge)',
      strokeWidth: 1.6,
      strokeDasharray: e.dashed || e.assumed ? '6 5' : undefined,
    },
    labelStyle: { fill: 'var(--text)', fontSize: 12, fontWeight: 600 },
    labelBgStyle: { fill: 'var(--card)', stroke: 'var(--border)' },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 6,
  }))

  const all = lanes ? [...lanes.laneNodes, ...shapeNodes] : shapeNodes
  const routed = routeEdges(all, edges, spec.direction)
  return { nodes: routed.nodes, edges: routed.edges, problems: lanes ? lanes.problems : [] }
}

// ---------------------------------------------------------------------------------------
// Edge routing. Called after layout and again after a node is dragged. For every edge it
//  1. picks the sides to leave and enter by (several options are tried; one that runs through
//     no node wins; backward edges go as a U over or under the diagram on opposite sides when
//     their spans would otherwise cross),
//  2. spreads edges that share a side along it, ordered so arrows do not swap over each other
//     (an edge that is exactly in line gets the middle point, so it is a straight line),
//  3. picks where each bend sits (a channel clear of nodes and of earlier edges).
// The result is passed to RoutedEdge (see RoutedEdge.jsx).
export function routeEdges(nodes, edges, dir) {
  const shapes = nodes.filter((n) => n.type === 'shape')
  if (shapes.length === 0 || edges.length === 0) return { nodes, edges }
  const byId = new Map(shapes.map((n) => [n.id, n]))
  const hFlow = dir !== 'TB'
  const sideNames = hFlow ? ['top', 'bottom'] : ['left', 'right']
  const VEC = { right: [1, 0], left: [-1, 0], top: [0, -1], bottom: [0, 1] }
  const isH = (s) => s === 'left' || s === 'right'
  const MARGIN = 6
  const STUB = 14

  const rects = new Map(
    shapes.map((n) => [n.id, { l: n.position.x, t: n.position.y, r: n.position.x + n.data.w, b: n.position.y + n.data.h }]),
  )
  // Where connections attach: the middle of the shape (or of the symbol, when the label sits under it).
  const centre = (n) => ({ x: n.position.x + n.data.w / 2, y: n.position.y + (n.data.glyphH || n.data.h) / 2 })
  const attach = (n, side, pct) => {
    const { x, y } = n.position
    const { w, h, glyphH } = n.data
    if (side === 'left') return { x, y: y + (glyphH ? pct * glyphH : pct * h) }
    if (side === 'right') return { x: x + w, y: y + (glyphH ? pct * glyphH : pct * h) }
    if (side === 'top') return { x: x + pct * w, y }
    return { x: x + pct * w, y: y + (glyphH || h) }
  }
  const cs = shapes.map(centre)
  const midX = (Math.min(...cs.map((c) => c.x)) + Math.max(...cs.map((c) => c.x))) / 2
  const midY = (Math.min(...cs.map((c) => c.y)) + Math.max(...cs.map((c) => c.y))) / 2

  // --- geometry helpers: polylines are made of horizontal/vertical segments
  const poly = (ss, ts, a, b, c) => {
    if (isH(ss) && isH(ts)) return [a, { x: c, y: a.y }, { x: c, y: b.y }, b]
    if (!isH(ss) && !isH(ts)) return [a, { x: a.x, y: c }, { x: b.x, y: c }, b]
    return isH(ss) ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b]
  }
  const dirOf = (p, q) => [Math.sign(q.x - p.x), Math.sign(q.y - p.y)]
  const isZero = (d) => d[0] === 0 && d[1] === 0
  // The first segment must leave the node outwards, and the last must arrive into the node.
  const valid = (ss, ts, pl) => {
    let i = 0
    while (i < pl.length - 2 && isZero(dirOf(pl[i], pl[i + 1]))) i++
    const d0 = dirOf(pl[i], pl[i + 1])
    if (d0[0] * VEC[ss][0] + d0[1] * VEC[ss][1] <= 0) return false
    let j = pl.length - 1
    while (j > 1 && isZero(dirOf(pl[j - 1], pl[j]))) j--
    const d1 = dirOf(pl[j - 1], pl[j])
    return d1[0] * -VEC[ts][0] + d1[1] * -VEC[ts][1] > 0
  }
  const segHits = (p, q, R) => {
    if (Math.abs(p.y - q.y) < 0.5)
      return p.y > R.t - MARGIN && p.y < R.b + MARGIN && Math.max(p.x, q.x) > R.l - MARGIN && Math.min(p.x, q.x) < R.r + MARGIN
    if (Math.abs(p.x - q.x) < 0.5)
      return p.x > R.l - MARGIN && p.x < R.r + MARGIN && Math.max(p.y, q.y) > R.t - MARGIN && Math.min(p.y, q.y) < R.b + MARGIN
    return false
  }
  const collisions = (pl, skip) => {
    let n = 0
    rects.forEach((R, id) => {
      if (skip.includes(id)) return
      for (let k = 0; k < pl.length - 1; k++)
        if (segHits(pl[k], pl[k + 1], R)) {
          n++
          break
        }
    })
    return n
  }
  const segCross = (p, q, r, s) => {
    const ph = Math.abs(p.y - q.y) < 0.5
    const rh = Math.abs(r.y - s.y) < 0.5
    if (ph === rh) return false
    const [h1, h2, v1, v2] = ph ? [p, q, r, s] : [r, s, p, q]
    return Math.min(h1.x, h2.x) < v1.x && v1.x < Math.max(h1.x, h2.x) && Math.min(v1.y, v2.y) < h1.y && h1.y < Math.max(v1.y, v2.y)
  }
  const crossings = (pl, routed) => {
    let n = 0
    for (let k = 0; k < pl.length - 1; k++) for (const other of routed) for (let m = 0; m < other.length - 1; m++) if (segCross(pl[k], pl[k + 1], other[m], other[m + 1])) n++
    return n
  }
  // Best bend position for a given pair of sides and end points.
  const search = (ss, ts, a, b, skip, routed) => {
    let cands
    if (isH(ss) === isH(ts)) {
      const a0 = isH(ss) ? a.x : a.y
      const b0 = isH(ss) ? b.x : b.y
      const lo = Math.min(a0, b0) + STUB
      const hi = Math.max(a0, b0) - STUB
      const mid = (a0 + b0) / 2
      const vals = []
      if (hi < lo) vals.push(mid)
      else for (let c = lo; c <= hi; c += 8) vals.push(c)
      vals.sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid))
      cands = vals.slice(0, 120).map((c) => ({ c, mid }))
    } else cands = [{ c: undefined, mid: 0 }]
    let best = null
    for (const { c, mid } of cands) {
      const pl = poly(ss, ts, a, b, c)
      if (!valid(ss, ts, pl)) continue
      const hits = collisions(pl, skip)
      const cross = crossings(pl, routed)
      const cost = hits * 1000 + cross * 25 + (c === undefined ? 0 : Math.abs(c - mid) * 0.05)
      if (!best || cost < best.cost) best = { pl, c, cost }
      if (hits === 0 && cross === 0) break
    }
    return best
  }

  // --- 1. sides ---------------------------------------------------------------------
  const picks = edges.map((e) => {
    const a = centre(byId.get(e.source))
    const b = centre(byId.get(e.target))
    const dx = b.x - a.x
    const dy = b.y - a.y
    let src, tgt
    let back = false
    if (hFlow) {
      if (Math.abs(dy) > 2 * Math.abs(dx)) [src, tgt] = dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
      else if (dx >= 0) [src, tgt] = ['right', 'left']
      else back = true
    } else if (Math.abs(dx) > 2 * Math.abs(dy)) [src, tgt] = dx >= 0 ? ['right', 'left'] : ['left', 'right']
    else if (dy >= 0) [src, tgt] = ['bottom', 'top']
    else back = true
    return { src, tgt, back, span: Math.abs(dx) + Math.abs(dy), a, b, dx, dy }
  })

  // Backward edges run as a U over or under the diagram. Two U's whose spans partly overlap
  // would cross on the same side, so they get opposite sides; nested or separate ones may share.
  const interval = (p) => (hFlow ? [Math.min(p.a.x, p.b.x), Math.max(p.a.x, p.b.x)] : [Math.min(p.a.y, p.b.y), Math.max(p.a.y, p.b.y)])
  const partlyOverlap = (p, q) => (p[0] < q[0] && q[0] < p[1] && p[1] < q[1]) || (q[0] < p[0] && p[0] < q[1] && q[1] < p[1])
  const placedU = []
  picks
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.back)
    .sort((x, y) => y.p.span - x.p.span)
    .forEach(({ p }) => {
      const iv = interval(p)
      const meanCross = hFlow ? (p.a.y + p.b.y) / 2 : (p.a.x + p.b.x) / 2
      const preferred = meanCross > (hFlow ? midY : midX) ? sideNames[1] : sideNames[0]
      const other = preferred === sideNames[0] ? sideNames[1] : sideNames[0]
      const clashes = (s) => placedU.filter((q) => q.side === s && partlyOverlap(q.iv, iv)).length
      const side = clashes(preferred) <= clashes(other) ? preferred : other
      p.src = p.tgt = side
      placedU.push({ side, iv })
    })

  // Forward edges: try the usual sides first, then others, and keep the one that avoids nodes.
  edges.forEach((e, i) => {
    const p = picks[i]
    if (p.back) return
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    const hs = p.dx >= 0 ? 'right' : 'left'
    const ht = p.dx >= 0 ? 'left' : 'right'
    const vs = p.dy >= 0 ? 'bottom' : 'top'
    const vt = p.dy >= 0 ? 'top' : 'bottom'
    const options = [[p.src, p.tgt, 0], [hs, ht, 40], [vs, vt, 40], [hs, vt, 60], [vs, ht, 60]].filter(
      (o, k, all) => all.findIndex((q) => q[0] === o[0] && q[1] === o[1]) === k,
    )
    let best = null
    options.forEach(([ss, ts, penalty]) => {
      const r = search(ss, ts, attach(s, ss, 0.5), attach(t, ts, 0.5), [e.source, e.target], [])
      if (r && (!best || r.cost + penalty < best.cost)) best = { ss, ts, pl: r.pl, cost: r.cost + penalty }
    })
    if (best) {
      p.src = best.ss
      p.tgt = best.ts
      p.prov = best.pl
    } else {
      p.src = p.src || hs
      p.tgt = p.tgt || ht
    }
  })

  // --- 2. attachment points along each side -------------------------------------------
  const groups = new Map()
  const add = (nodeId, side, role, i, other, bend) => {
    const key = `${nodeId}|${side}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ role, i, other, bend })
  }
  edges.forEach((e, i) => {
    const p = picks[i]
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    const sb = p.prov && p.prov.length > 2 ? p.prov[1] : null
    const tb = p.prov && p.prov.length > 2 ? p.prov[p.prov.length - 2] : null
    add(e.source, p.src, 'source', i, centre(t), sb)
    add(e.target, p.tgt, 'target', i, centre(s), tb)
  })
  const handles = new Map()
  const handleOf = new Map()
  const pctOf = new Map()
  groups.forEach((list, key) => {
    const [nodeId, side] = key.split('|')
    const node = byId.get(nodeId)
    const along = isH(side) ? 'y' : 'x'
    const mainAxis = isH(side) ? 'x' : 'y'
    const me = centre(node)[along]
    const here = attach(node, side, 0.5)
    // Up / level / down relative to this node; going up, the nearest bend takes the top slot;
    // going down, the nearest bend takes the bottom slot. That keeps arrows from swapping over.
    list.forEach((it) => {
      const d = it.other[along] - me
      it.g = Math.abs(d) <= 2 ? 0 : Math.sign(d)
      it.dist = it.bend ? Math.abs(it.bend[mainAxis] - here[mainAxis]) : 0
    })
    list.sort((p, q) => p.g - q.g || (p.g < 0 ? p.dist - q.dist : p.g > 0 ? q.dist - p.dist : p.other[along] - q.other[along]))
    const ai = list.findIndex((it) => it.g === 0)
    const n = list.length
    list.forEach((it, k) => {
      const pct = ai === -1 || n === 1 ? (k + 1) / (n + 1) : k === ai ? 0.5 : k < ai ? (0.5 * (k + 1)) / (ai + 1) : 0.5 + (0.5 * (k - ai)) / (n - ai)
      const id = `${it.role}-${side}-${k}-of-${n}`
      if (!handles.has(nodeId)) handles.set(nodeId, [])
      handles.get(nodeId).push({ id, role: it.role, side, pct })
      handleOf.set(`${it.role}|${it.i}`, id)
      pctOf.set(`${it.role}|${it.i}`, pct)
    })
  })

  // --- 3. bends -------------------------------------------------------------------------
  // U's: the longer the span, the further out, so nested ones do not overlap (per side).
  const offsetOf = new Map()
  sideNames.forEach((side) => {
    picks
      .map((p, i) => ({ p, i }))
      .filter((x) => x.p.back && x.p.src === side)
      .sort((x, y) => x.p.span - y.p.span)
      .forEach((x, rank) => offsetOf.set(x.i, 36 + rank * 18))
  })
  const routed = []
  const bendOf = new Map()
  const endPoints = (i) => {
    const e = edges[i]
    const p = picks[i]
    return [attach(byId.get(e.source), p.src, pctOf.get(`source|${i}`)), attach(byId.get(e.target), p.tgt, pctOf.get(`target|${i}`))]
  }
  picks.forEach((p, i) => {
    if (!p.back) return
    const [a, b] = endPoints(i)
    const o = offsetOf.get(i)
    if (hFlow) {
      const y0 = p.src === 'top' ? Math.min(a.y, b.y) - o : Math.max(a.y, b.y) + o
      routed.push([a, { x: a.x, y: y0 }, { x: b.x, y: y0 }, b])
    } else {
      const x0 = p.src === 'left' ? Math.min(a.x, b.x) - o : Math.max(a.x, b.x) + o
      routed.push([a, { x: x0, y: a.y }, { x: x0, y: b.y }, b])
    }
  })
  picks
    .map((p, i) => ({ p, i }))
    .filter((x) => !x.p.back)
    .sort((x, y) => x.p.span - y.p.span)
    .forEach(({ p, i }) => {
      const [a, b] = endPoints(i)
      const r = search(p.src, p.tgt, a, b, [edges[i].source, edges[i].target], routed)
      if (r) {
        routed.push(r.pl)
        bendOf.set(i, r.c)
      }
    })

  const outEdges = edges.map((e, i) => {
    const p = picks[i]
    const c = bendOf.get(i)
    return {
      ...e,
      sourceHandle: handleOf.get(`source|${i}`),
      targetHandle: handleOf.get(`target|${i}`),
      data: {
        ...(e.data || {}),
        cx: isH(p.src) && c !== undefined ? c : undefined,
        cy: !isH(p.src) && c !== undefined ? c : undefined,
        offset: offsetOf.get(i) ?? 26,
        radius: 14,
      },
    }
  })
  const outNodes = nodes.map((n) => (n.type === 'shape' ? { ...n, data: { ...n.data, handles: handles.get(n.id) || [] } } : n))
  return { nodes: outNodes, edges: outEdges }
}
