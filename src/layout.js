import { graphlib, layout } from '@dagrejs/dagre'
import { shapeMarkup, OUTSIDE, GLYPH_H } from './shapes.js'

const MAX_W = 300
const MAX_W_PILL = 320
const MAX_W_OUTSIDE = 150
const DECISION_W = 220
const CONNECTOR = 38

const classOf = (n) => `shape shape-${n.type}${n.assumed ? ' assumed' : ''}${n.tone ? ` tone-${n.tone}` : ''}`

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
      el.style.maxWidth = `${n.type === 'start' || n.type === 'end' ? MAX_W_PILL : OUTSIDE.has(n.type) || n.type === 'concept' ? MAX_W_OUTSIDE : MAX_W}px`
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
    } else if (n.type === 'concept') {
      // A circle must contain its text box: diameter = the box's diagonal plus a little air.
      w = h = Math.max(n.width || 0, 104, Math.ceil(Math.hypot(w, h)) + 8)
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
export function gridSize(sizes, roomy = false) {
  let w = 0
  let h = 0
  sizes.forEach(([sw, sh]) => {
    w = Math.max(w, sw)
    h = Math.max(h, sh)
  })
  // Ontologies get roomier cells: links carry labels that need space between circles.
  return { colW: snap(w) + (roomy ? 150 : 72), rowH: snap(h) + (roomy ? 110 : 56) }
}

// Grid placement. at="col,row" puts a node in that cell; at="col" pins only the column.
// A node inside a <zone> uses that zone's own grid: cell 1,1 is the zone's top-left cell, so a
// zone's contents can be arranged without caring where the zone sits on the page. A zone can
// itself carry at="col,row": the cell, in its parent zone's grid (or the page's), where its own
// grid starts, which places the whole group. Without it the zone stays where the automatic
// layout put it. `sizes` are the real node sizes (they set the cell size); `lsz` are the sizes
// used for spacing.
function pinToGrid(spec, sizes, lsz, pos) {
  const pinnedNodes = spec.nodes.filter((n) => n.at && n.at.col)
  const placedZones = spec.zones.filter((z) => z.at && z.at.col)
  if (pinnedNodes.length === 0 && placedZones.length === 0) return
  const { colW, rowH } = gridSize(sizes, spec.diagramType === 'ontology')
  const zt = zoneTree(spec)
  const live = new Set(spec.zones.filter((z) => zt.members(z.id).length > 0).map((z) => z.id))
  const PAGE = { x: -colW / 2, y: -rowH / 2 } // page grid: cell 1,1 is centred on (0,0)
  const left = (id) => pos.get(id).x - sizes.get(id)[0] / 2
  const top = (id) => pos.get(id).y - sizes.get(id)[1] / 2

  // 1. Where each zone's grid starts (the top-left corner of its cell 1,1). A zone with an `at`
  //    is moved there as a whole; the others stay where the automatic layout put them.
  const origin = new Map()
  spec.zones.forEach((z) => {
    if (!live.has(z.id)) return
    const ids = zt.members(z.id)
    const cur = { x: Math.min(...ids.map(left)), y: Math.min(...ids.map(top)) }
    if (z.at && z.at.col) {
      const base = z.parent && origin.get(z.parent) ? origin.get(z.parent) : PAGE
      const target = { x: base.x + (z.at.col - 1) * colW, y: z.at.row ? base.y + (z.at.row - 1) * rowH : cur.y }
      ids.forEach((id) => {
        pos.get(id).x += target.x - cur.x
        pos.get(id).y += target.y - cur.y
      })
      origin.set(z.id, target)
    } else origin.set(z.id, cur)
  })

  // 2. Nodes with an `at`: the cell is in the grid of the zone the node is in (else the page's).
  pinnedNodes.forEach((n) => {
    const base = n.zone && origin.get(n.zone) ? origin.get(n.zone) : PAGE
    const p = pos.get(n.id)
    p.x = base.x + (n.at.col - 0.5) * colW
    if (n.at.row) p.y = base.y + (n.at.row - 0.5) * rowH
  })

  // 3. Everything else that ended up on top of a pinned node slides clear.
  const pinnedIds = new Set(pinnedNodes.filter((n) => n.at.row).map((n) => n.id))
  const cross = spec.direction === 'TB' ? 'x' : 'y'
  const overlaps = (id) =>
    spec.nodes.some((o) => {
      if (o.id === id) return false
      const a = pos.get(o.id)
      const b = pos.get(id)
      return (
        Math.abs(a.x - b.x) < (lsz.get(o.id)[0] + lsz.get(id)[0]) / 2 + 16 &&
        Math.abs(a.y - b.y) < (lsz.get(o.id)[1] + lsz.get(id)[1]) / 2 + 16
      )
    })
  spec.nodes
    .filter((n) => !pinnedIds.has(n.id))
    .forEach((n) => {
      const p = pos.get(n.id)
      // A column-only pin keeps its column, so it slides up or down; any other node slides sideways.
      const axis = n.at && n.at.col ? 'y' : cross
      const start = p[axis]
      for (let k = 1; k <= 80 && overlaps(n.id); k++) p[axis] = start + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 8
    })
}

// For "Download HTML": turns dragged positions into grid cells, so the saved file says
// at="3,2" or at="2.5,2" and not pixels. Nodes inside a zone get cells in that zone's grid, and
// every zone gets the cell where its grid starts, so the layout reloads where it was. Each node
// takes the nearest free half-step cell in its own grid (a cell is taken when another node in
// the same grid is less than one cell away in both directions).
// Returns { nodes: Map id -> {col,row}, zones: Map zoneId -> {col,row} }.
export function snapToGrid(shapeNodes, roomy = false, spec = { zones: [], nodes: [] }) {
  const sizes = new Map(shapeNodes.map((n) => [n.id, [n.data.w, n.data.h]]))
  const { colW, rowH } = gridSize(sizes, roomy)
  const half = (v) => Math.round(v * 2) / 2
  const byId = new Map(shapeNodes.map((n) => [n.id, n]))
  const zt = zoneTree(spec)
  const zoneOf = new Map(spec.nodes.map((n) => [n.id, n.zone]))
  const live = spec.zones.filter((z) => zt.members(z.id).some((id) => byId.has(id)))
  const liveIds = new Set(live.map((z) => z.id))
  const PAGE = { x: -colW / 2, y: -rowH / 2 }
  const centre = (id) => {
    const n = byId.get(id)
    return { x: n.position.x + n.data.w / 2, y: n.position.y + n.data.h / 2 }
  }

  // Each zone's grid starts half a cell before its top-left node centre, so that node is cell 1.
  const origin = new Map()
  const zoneCell = new Map()
  live.forEach((z) => {
    const cs = zt.members(z.id).filter((id) => byId.has(id)).map(centre)
    const cur = { x: Math.min(...cs.map((c) => c.x)) - colW / 2, y: Math.min(...cs.map((c) => c.y)) - rowH / 2 }
    const base = z.parent && origin.get(z.parent) ? origin.get(z.parent) : PAGE
    const col = half((cur.x - base.x) / colW) + 1
    const row = half((cur.y - base.y) / rowH) + 1
    zoneCell.set(z.id, { col, row })
    origin.set(z.id, { x: base.x + (col - 1) * colW, y: base.y + (row - 1) * rowH })
  })

  const placed = new Map()
  const cells = new Map()
  shapeNodes.forEach((n) => {
    const z = zoneOf.get(n.id)
    const scope = z && liveIds.has(z) ? z : '(page)'
    const base = scope === '(page)' ? PAGE : origin.get(scope)
    const c = centre(n.id)
    const col = half((c.x - base.x) / colW + 0.5)
    const row = half((c.y - base.y) / rowH + 0.5)
    if (!placed.has(scope)) placed.set(scope, [])
    const list = placed.get(scope)
    const free = (cc, rr) => list.every((p) => Math.abs(p.col - cc) >= 1 || Math.abs(p.row - rr) >= 1)
    let spot = null
    for (let r = 0; r <= 20 && !spot; r += 0.5)
      for (let dy = -r; dy <= r && !spot; dy += 0.5)
        for (let dx = -r; dx <= r && !spot; dx += 0.5)
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && free(col + dx, row + dy)) spot = { col: col + dx, row: row + dy }
    list.push(spot)
    cells.set(n.id, spot)
  })

  // The page's own grid has no fixed origin, so shift it until its smallest cell is 1.
  const pageNodes = shapeNodes.filter((n) => !(zoneOf.get(n.id) && liveIds.has(zoneOf.get(n.id)))).map((n) => cells.get(n.id))
  const topZones = live.filter((z) => !z.parent || !liveIds.has(z.parent)).map((z) => zoneCell.get(z.id))
  const all = [...pageNodes, ...topZones]
  if (all.length) {
    const dCol = Math.min(...all.map((c) => c.col)) - 1
    const dRow = Math.min(...all.map((c) => c.row)) - 1
    all.forEach((c) => {
      c.col -= dCol
      c.row -= dRow
    })
  }
  return { nodes: cells, zones: zoneCell }
}
// Keeps diagrams tidy without anyone choosing sizes: nodes of the same type whose measured
// sizes are close get the SAME size (the largest in the group, so text is never clipped),
// and every size is rounded up to an 8px grid. Nodes with an explicit width/height attribute
// and fixed-size shapes are left alone.
function harmonize(nodes, sizes) {
  // Ontology circles are all one size (the largest needed), so the diagram reads as a set.
  const circles = nodes.filter((n) => n.type === 'concept' && !n.width)
  if (circles.length > 1) {
    const d = snap(Math.max(...circles.map((n) => sizes.get(n.id)[0])))
    circles.forEach((n) => sizes.set(n.id, [d, d]))
  }
  const byType = new Map()
  nodes.forEach((n) => {
    if (n.type === 'connector' || n.type === 'concept') return
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

// Zones: a labelled box around the nodes inside a <zone> (or marked zone="id"). Zones nest.
// The box is the bounding box of its nodes and inner zones plus padding, and it follows them
// when they are dragged.
const ZONE_PAD = 36

function zoneTree(spec) {
  const byId = new Map(spec.zones.map((z) => [z.id, z]))
  const children = new Map(spec.zones.map((z) => [z.id, []]))
  spec.zones.forEach((z) => {
    if (z.parent && children.has(z.parent)) children.get(z.parent).push(z.id)
  })
  const depth = (id) => {
    const p = byId.get(id)?.parent
    return p && byId.has(p) ? 1 + depth(p) : 1
  }
  const height = (id) => 1 + Math.max(0, ...children.get(id).map(height))
  // Every node in this zone or in a zone inside it.
  const members = (id) => [...spec.nodes.filter((n) => n.zone === id).map((n) => n.id), ...children.get(id).flatMap(members)]
  return { children, depth, height, members }
}

export function refreshZones(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const zoneByZid = new Map(nodes.filter((n) => n.type === 'zone').map((n) => [n.data.zid, n]))
  const memo = new Map()
  const rectOf = (zn) => {
    if (memo.has(zn.id)) return memo.get(zn.id)
    const rs = []
    zn.data.members.forEach((id) => {
      const m = byId.get(id)
      if (m) rs.push({ l: m.position.x, t: m.position.y, r: m.position.x + m.data.w, b: m.position.y + m.data.h })
    })
    zn.data.children.forEach((zid) => {
      const c = zoneByZid.get(zid)
      const cr = c && rectOf(c)
      if (cr) rs.push(cr)
    })
    const r = rs.length
      ? {
          l: Math.min(...rs.map((x) => x.l)) - ZONE_PAD,
          t: Math.min(...rs.map((x) => x.t)) - ZONE_PAD,
          r: Math.max(...rs.map((x) => x.r)) + ZONE_PAD,
          b: Math.max(...rs.map((x) => x.b)) + ZONE_PAD,
        }
      : null
    memo.set(zn.id, r)
    return r
  }
  return nodes.map((n) => {
    if (n.type !== 'zone') return n
    const r = rectOf(n)
    if (!r) return n
    return { ...n, position: { x: r.l, y: r.t }, data: { ...n.data, w: r.r - r.l, h: r.b - r.t }, style: { ...n.style, width: r.r - r.l, height: r.b - r.t } }
  })
}

// A node that is not in a zone but landed inside its box (for example an outside party that
// sits between two members in the flow) is moved just outside it, to whichever side is nearer.
function evictFromZones(spec, sizes, pos) {
  if (spec.zones.length === 0) return
  const zt = zoneTree(spec)
  const horizontal = spec.direction !== 'TB'
  const cross = horizontal ? 'y' : 'x'
  const crossIdx = horizontal ? 1 : 0
  const rectOf = (id) => {
    const p = pos.get(id)
    const [w, h] = sizes.get(id)
    return { l: p.x - w / 2, r: p.x + w / 2, t: p.y - h / 2, b: p.y + h / 2 }
  }
  spec.zones.forEach((z) => {
    const ids = zt.members(z.id)
    if (ids.length === 0) return
    const inside = new Set(ids)
    const pad = ZONE_PAD * zt.height(z.id)
    const rs = ids.map(rectOf)
    const L = Math.min(...rs.map((r) => r.l)) - pad
    const R = Math.max(...rs.map((r) => r.r)) + pad
    const T = Math.min(...rs.map((r) => r.t)) - pad
    const B = Math.max(...rs.map((r) => r.b)) + pad
    spec.nodes
      .filter((n) => !inside.has(n.id))
      .forEach((n) => {
        const r = rectOf(n.id)
        if (!(r.l < R && L < r.r && r.t < B && T < r.b)) return
        const p = pos.get(n.id)
        const half = sizes.get(n.id)[crossIdx] / 2
        const low = (horizontal ? T : L) - 28 - half
        const high = (horizontal ? B : R) + 28 + half
        p[cross] = Math.abs(p[cross] - low) <= Math.abs(p[cross] - high) ? low : high
      })
  })
}

function makeZones(spec, shapeNodes) {
  const zt = zoneTree(spec)
  const live = spec.zones.filter((z) => zt.members(z.id).length > 0)
  const liveIds = new Set(live.map((z) => z.id))
  const zoneNodes = live.map((z) => ({
    id: `zone:${z.id}`,
    type: 'zone',
    position: { x: 0, y: 0 },
    data: {
      zid: z.id,
      label: z.label,
      w: 0,
      h: 0,
      depth: zt.depth(z.id),
      members: spec.nodes.filter((n) => n.zone === z.id).map((n) => n.id),
      children: zt.children.get(z.id).filter((c) => liveIds.has(c)),
    },
    style: { width: 0, height: 0 },
    draggable: false,
    selectable: false,
    focusable: false,
    // Outer zones sit behind inner ones, all behind the nodes and above swimlane bands.
    zIndex: Math.min(-1, -4 + zt.depth(z.id)),
  }))
  const sized = refreshZones([...zoneNodes, ...shapeNodes]).filter((n) => n.type === 'zone')
  // A zone box must not sit on top of a node that is not in it.
  const problems = []
  sized.forEach((zn) => {
    const inside = new Set(zt.members(zn.data.zid))
    shapeNodes.forEach((n) => {
      if (inside.has(n.id)) return
      const clash =
        n.position.x < zn.position.x + zn.data.w &&
        zn.position.x < n.position.x + n.data.w &&
        n.position.y < zn.position.y + zn.data.h &&
        zn.position.y < n.position.y + n.data.h
      if (clash) problems.push(`Zone "${zn.data.label}" overlaps "${n.id}", which is not in it`)
    })
  })
  return { nodes: sized, problems }
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
    zIndex: -6,
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
      zIndex: -5,
    })
  }
  return { placed, laneNodes, problems }
}

// Spec + measured sizes -> React Flow nodes/edges. Positions come from dagre unless a node
// has x/y (set by "Download HTML" after you drag things) and useManual is true. With lanes,
// the lane layout always decides positions.
export function buildGraph(spec, sizes, { useManual = true } = {}) {
  const g = new graphlib.Graph({ compound: true })
  const net = spec.diagramType === 'ontology' // circles + straight links need more room
  g.setGraph({ rankdir: spec.direction, nodesep: net ? 96 : 64, ranksep: net ? 128 : 88, edgesep: 24, marginx: 24, marginy: 24 })
  g.setDefaultEdgeLabel(() => ({}))
  // Zone members are laid out as if larger by the zone padding (once per nesting level), so
  // the boxes drawn later never land on a neighbour. Zones are compound parents, which keeps
  // the members of a zone together.
  const zt = zoneTree(spec)
  const zoneIds = new Set(spec.zones.filter((z) => zt.members(z.id).length > 0).map((z) => z.id))
  const inZone = (n) => n.zone && zoneIds.has(n.zone)
  const lsz = new Map(
    spec.nodes.map((n) => {
      const [w, h] = sizes.get(n.id)
      const k = inZone(n) ? 2 * ZONE_PAD * zt.depth(n.zone) : 0
      return [n.id, [w + k, h + k]]
    }),
  )
  spec.zones.forEach((z) => {
    if (!zoneIds.has(z.id)) return
    g.setNode(z.id, {})
    if (z.parent && zoneIds.has(z.parent)) g.setParent(z.id, z.parent)
  })
  spec.nodes.forEach((n) => {
    const [width, height] = lsz.get(n.id)
    g.setNode(n.id, { width, height })
    if (inZone(n)) g.setParent(n.id, n.zone)
  })  // Labelled edges reserve room for their label so labels do not land on arrows or nodes.
  spec.edges.forEach((e) =>
    g.setEdge(e.from, e.to, e.label ? { width: Math.max(44, e.label.length * 7 + 20), height: 24, labelpos: 'c' } : {}),
  )
  layout(g)
  const pos = new Map(spec.nodes.map((n) => [n.id, g.node(n.id)]))
  if (spec.lanes.length === 0) {
    straighten(spec, lsz, pos)
    if (useManual) pinToGrid(spec, sizes, lsz, pos)
    evictFromZones(spec, sizes, pos)
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
        tone: n.tone,
        glyphH: OUTSIDE.has(n.type) ? GLYPH_H[n.type] : 0,
      },
      style: { width: w, height: h },
    }
  })

  const edges = spec.edges.map((e, i) => ({
    id: `e${i}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    type: net ? 'floating' : 'routed',
    label: e.label,
    markerEnd: { type: 'arrowclosed', width: 18, height: 18 },
    markerStart: e.both ? { type: 'arrowclosed', width: 18, height: 18 } : undefined,
    style: {
      stroke: 'var(--edge, #94a3b8)',
      strokeWidth: 1.6,
      strokeDasharray: e.dashed || e.assumed ? '6 5' : undefined,
    },
    labelStyle: { fill: 'var(--text, #0f172a)', fontSize: 12, fontWeight: 600 },
    labelBgStyle: { fill: 'var(--card, #ffffff)', stroke: 'var(--border, #cbd5e1)' },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 6,
  }))

  const zones = makeZones(spec, shapeNodes)
  const all = [...(lanes ? lanes.laneNodes : []), ...zones.nodes, ...shapeNodes]
  const routed = routeFor(spec, all, edges)
  return { nodes: routed.nodes, edges: routed.edges, problems: [...(lanes ? lanes.problems : []), ...zones.problems] }
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

  // U's: the longer the span, the further out, so nested ones do not overlap (per side).
  const offsetOf = new Map()
  sideNames.forEach((side) => {
    picks
      .map((p, i) => ({ p, i }))
      .filter((x) => x.p.back && x.p.src === side)
      .sort((x, y) => x.p.span - y.p.span)
      .forEach((x, rank) => offsetOf.set(x.i, 36 + rank * 18))
  })

  // Backward edges run as a U over or under the diagram. For each one (longest first) both
  // sides are tried against the forward routes and the U's already placed, and the side that
  // crosses fewer nodes and edges wins. Two U's whose spans partly overlap would cross on the
  // same side, so that counts too; nested or separate U's may share a side.
  const interval = (p) => (hFlow ? [Math.min(p.a.x, p.b.x), Math.max(p.a.x, p.b.x)] : [Math.min(p.a.y, p.b.y), Math.max(p.a.y, p.b.y)])
  const partlyOverlap = (p, q) => (p[0] < q[0] && q[0] < p[1] && p[1] < q[1]) || (q[0] < p[0] && p[0] < q[1] && q[1] < p[1])
  const forwardRoutes = picks.filter((p) => !p.back && p.prov).map((p) => p.prov)
  const placedU = []
  picks
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.back)
    .sort((x, y) => y.p.span - x.p.span)
    .forEach(({ p, i }) => {
      const e = edges[i]
      const iv = interval(p)
      const meanCross = hFlow ? (p.a.y + p.b.y) / 2 : (p.a.x + p.b.x) / 2
      const preferred = meanCross > (hFlow ? midY : midX) ? sideNames[1] : sideNames[0]
      const other = preferred === sideNames[0] ? sideNames[1] : sideNames[0]
      const costOf = (side) => {
        const a = attach(byId.get(e.source), side, 0.5)
        const b = attach(byId.get(e.target), side, 0.5)
        const O = 36
        const far = hFlow
          ? side === 'top' ? Math.min(a.y, b.y) - O : Math.max(a.y, b.y) + O
          : side === 'left' ? Math.min(a.x, b.x) - O : Math.max(a.x, b.x) + O
        const pl = hFlow ? [a, { x: a.x, y: far }, { x: b.x, y: far }, b] : [a, { x: far, y: a.y }, { x: far, y: b.y }, b]
        const clashes = placedU.filter((q) => q.side === side && partlyOverlap(q.iv, iv)).length
        return collisions(pl, [e.source, e.target]) * 1000 + (crossings(pl, forwardRoutes) + clashes) * 25 + (side === preferred ? 0 : 1)
      }
      const side = costOf(preferred) <= costOf(other) ? preferred : other
      p.src = p.tgt = side
      placedU.push({ side, iv })
    })

  // --- 2. attachment points along each side -------------------------------------------
  const groups = new Map()
  const add = (nodeId, side, role, i, other, bend, off) => {
    const key = `${nodeId}|${side}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ role, i, other, bend, off })
  }
  edges.forEach((e, i) => {
    const p = picks[i]
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    const sb = p.prov && p.prov.length > 2 ? p.prov[1] : null
    const tb = p.prov && p.prov.length > 2 ? p.prov[p.prov.length - 2] : null
    add(e.source, p.src, 'source', i, centre(t), sb, offsetOf.get(i))
    add(e.target, p.tgt, 'target', i, centre(s), tb, offsetOf.get(i))
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
      // How far out the first bend is. For a looped-back edge that is how deep its U runs, so
      // two U's meeting one node end side by side without crossing (the deeper one outside).
      it.dist = it.off !== undefined ? it.off : it.bend ? Math.abs(it.bend[mainAxis] - here[mainAxis]) : 0
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

// ---------------------------------------------------------------------------------------
// Ontology links: straight lines between circle edges (a gentle curve only when needed).
//  - Links between the same two nodes fan out; opposite directions go to opposite sides.
//  - A link that would pass through another circle bends around it.
// FloatingEdge draws them live from the nodes' positions, so they follow dragging.
export function floatingGeometry(a, b, bend) {
  const dx = b.cx - a.cx
  const dy = b.cy - a.cy
  const len = Math.hypot(dx, dy) || 1
  const c = { x: (a.cx + b.cx) / 2 + (-dy / len) * bend, y: (a.cy + b.cy) / 2 + (dx / len) * bend }
  // Where the line toward the control point leaves each ellipse.
  const onEdge = (n) => {
    const ex = c.x - n.cx
    const ey = c.y - n.cy
    const k = 1 / Math.sqrt((ex / n.rx) ** 2 + (ey / n.ry) ** 2 || 1e-9)
    return { x: n.cx + ex * k, y: n.cy + ey * k }
  }
  return { p0: onEdge(a), c, p1: onEdge(b) }
}

export function routeNetwork(nodes, edges) {
  const shapes = nodes.filter((n) => n.type === 'shape')
  if (shapes.length === 0) return { nodes, edges }
  const ell = new Map(
    shapes.map((n) => [n.id, { cx: n.position.x + n.data.w / 2, cy: n.position.y + n.data.h / 2, rx: n.data.w / 2, ry: n.data.h / 2 }]),
  )
  const groups = new Map()
  edges.forEach((e, i) => {
    const key = [e.source, e.target].sort().join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(i)
  })
  const base = new Map()
  groups.forEach((idx) =>
    idx.forEach((i, k) => base.set(i, (edges[i].source < edges[i].target ? 1 : -1) * (k - (idx.length - 1) / 2) * 44)),
  )
  const hits = (e, bend) => {
    const g = floatingGeometry(ell.get(e.source), ell.get(e.target), bend)
    for (let t = 0.08; t <= 0.92; t += 0.06) {
      const x = (1 - t) ** 2 * g.p0.x + 2 * (1 - t) * t * g.c.x + t * t * g.p1.x
      const y = (1 - t) ** 2 * g.p0.y + 2 * (1 - t) * t * g.c.y + t * t * g.p1.y
      for (const [id, el] of ell) {
        if (id === e.source || id === e.target) continue
        if (((x - el.cx) / (el.rx + 8)) ** 2 + ((y - el.cy) / (el.ry + 8)) ** 2 < 1) return true
      }
    }
    return false
  }
  const curve = (e, bend) => {
    const g = floatingGeometry(ell.get(e.source), ell.get(e.target), bend)
    const pts = []
    for (let k = 0; k <= 16; k++) {
      const t = k / 16
      pts.push({
        x: (1 - t) ** 2 * g.p0.x + 2 * (1 - t) * t * g.c.x + t * t * g.p1.x,
        y: (1 - t) ** 2 * g.p0.y + 2 * (1 - t) * t * g.c.y + t * t * g.p1.y,
      })
    }
    return pts
  }
  const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const crosses = (p, q, r, s) => orient(p, q, r) * orient(p, q, s) < 0 && orient(r, s, p) * orient(r, s, q) < 0
  // Each link tries a few gentle curves and keeps the one that avoids circles and crosses the
  // fewest links already placed (links that share a circle are allowed to meet there).
  const placed = []
  const outEdges = edges.map((e, i) => {
    const b0 = base.get(i) || 0
    let best = null
    for (const d of [0, 50, -50, 100, -100, 160, -160, 230, -230]) {
      const bend = b0 + d
      const pts = curve(e, bend)
      let crossings = 0
      placed.forEach((q) => {
        if ([q.e.source, q.e.target].some((id) => id === e.source || id === e.target)) return
        for (let k = 0; k < 16; k++) for (let m = 0; m < 16; m++) if (crosses(pts[k], pts[k + 1], q.pts[m], q.pts[m + 1])) crossings++
      })
      const cost = (hits(e, bend) ? 1000 : 0) + crossings * 25 + Math.abs(d) * 0.05
      if (!best || cost < best.cost) best = { bend, pts, cost }
      if (cost < 1) break
    }
    placed.push({ e, pts: best.pts })
    return { ...e, sourceHandle: 's', targetHandle: 't', data: { ...(e.data || {}), bend: best.bend } }
  })
  // RF needs a connection point on each node; the floating edge ignores where it is.
  const handles = [
    { id: 's', role: 'source', side: 'right', pct: 0.5 },
    { id: 't', role: 'target', side: 'left', pct: 0.5 },
  ]
  const outNodes = nodes.map((n) => (n.type === 'shape' ? { ...n, data: { ...n.data, handles } } : n))
  return { nodes: outNodes, edges: outEdges }
}

// Picks the router for the diagram's type. Used after layout and after a node is dragged.
export function routeFor(spec, nodes, edges) {
  return spec.diagramType === 'ontology' ? routeNetwork(nodes, edges) : routeEdges(nodes, edges, spec.direction)
}
