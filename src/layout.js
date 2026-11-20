import { graphlib, layout } from '@dagrejs/dagre'
import { shapeMarkup, OUTSIDE, GLYPH_H } from './shapes.js'

const MAX_W = 220
const MAX_W_PILL = 240
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
const median = (v) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0)

// The empty space between neighbouring cells. Ontologies get roomier gaps (links carry labels
// that need space between circles); other diagrams get gaps in proportion to the typical node,
// so small nodes pack tighter.
function gapsOf(sizes, roomy) {
  const clamp = (v, lo, hi) => Math.round(Math.min(hi, Math.max(lo, v)))
  const all = [...sizes.values()]
  return {
    // Never tighter than connectors need to fan out and bend between neighbours.
    gx: roomy ? 150 : clamp(median(all.map((s) => s[0])) * 0.4, 80, 96),
    gy: roomy ? 110 : clamp(median(all.map((s) => s[1])) * 0.6, 32, 56),
  }
}

export function gridSize(sizes, roomy = false) {
  let w = 0
  let h = 0
  sizes.forEach(([sw, sh]) => {
    w = Math.max(w, sw)
    h = Math.max(h, sh)
  })
  const { gx, gy } = gapsOf(sizes, roomy)
  return { colW: snap(w) + gx, rowH: snap(h) + gy }
}

// Column and row positions for at="col,row": each column is only as wide as the widest node
// pinned to it and each row only as tall as the tallest one, so one wide node or decision does
// not stretch everything else. A half step (2.5) is midway between columns 2 and 3. Returns
// functions giving the centre of a column / row, measured from the left / top edge of column /
// row 1.
function makeTracks(items, sizes, roomy, statNodes = items) {
  // The typical size and the gaps come from ALL the nodes of the scope (`statNodes`), not just the
  // pinned ones, so pinning one more node never moves the nodes that are already pinned.
  const { gx, gy } = gapsOf(new Map(statNodes.map((n) => [n.id, sizes.get(n.id)])), roomy)
  const build = (key, dim, gap) => {
    const typical = snap(median(statNodes.map((n) => sizes.get(n.id)[dim])))
    const widest = new Map()
    items.forEach((n) => {
      const v = n.at[key]
      if (v !== undefined && v % 1 === 0) widest.set(v, Math.max(widest.get(v) || 0, sizes.get(n.id)[dim]))
    })
    const last = Math.max(1, ...items.map((n) => Math.ceil(n.at[key] || 1))) + 1
    const size = (c) => (widest.has(c) ? snap(widest.get(c)) : typical)
    const centre = [0, size(1) / 2]
    for (let c = 2; c <= last; c++) centre[c] = centre[c - 1] + size(c - 1) / 2 + gap + size(c) / 2
    return (v) => {
      const c = Math.floor(v)
      return v === c ? centre[c] : (centre[c] + centre[c + 1]) / 2
    }
  }
  return { x: build('col', 0, gx), y: build('row', 1, gy) }
}

// Grid placement. at="col,row" puts a node in that cell; at="col" pins only the column.
// A node inside a <zone> uses that zone's own grid: cell 1,1 is the zone's top-left cell, so a
// zone's contents can be arranged without caring where the zone sits on the page.
// A zone's own at="col,row" is RELATIVE to its sibling zones (the ones with the same parent, or
// all top-level zones): the numbers only give the order. Zones in the same column sit one
// below the other, zones in the same row side by side, and every column and row is as big as
// the biggest zone in it, so zones never overlap however tall they are. Half steps and gaps in
// the numbers do not matter; only the order does. Zones without an at stay where the automatic
// layout put them. `sizes` are the real node sizes (they set the cell size); `lsz` are the
// sizes used for spacing.

// Cell size for ontology (circles, roomier) and for ordinary flow nodes, each from its own nodes.
function gridsFor(spec, sizes) {
  const of = (net) => {
    const sub = new Map(spec.nodes.filter((n) => !!n.net === net && sizes.has(n.id)).map((n) => [n.id, sizes.get(n.id)]))
    return gridSize(sub.size ? sub : sizes, net)
  }
  const grids = { flow: of(false), net: of(true) }
  const pageNet = spec.diagramType === 'ontology'
  const zoneNet = new Map(spec.zones.map((z) => [z.id, z.net]))
  // The grid a zone's own cells use (zone = null: the page's).
  return (zone) => ((zone ? zoneNet.get(zone) : pageNet) ? grids.net : grids.flow)
}

// Sibling zones that carry an at, grouped by parent zone ('' = top level), deepest parents first
// (so a zone is moved as a whole only after the zones inside it have been placed).
function placedZoneGroups(spec, live, zt) {
  const groups = new Map()
  spec.zones
    .filter((z) => z.at && z.at.col && live.has(z.id))
    .forEach((z) => {
      const k = z.parent && live.has(z.parent) ? z.parent : ''
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(z)
    })
  return [...groups.entries()].sort((a, b) => (b[0] ? zt.depth(b[0]) : 0) - (a[0] ? zt.depth(a[0]) : 0))
}

const ZONE_GAP = 40

function pinToGrid(spec, sizes, lsz, pos, locked = new Set()) {
  const pinnedNodes = spec.nodes.filter((n) => n.at && n.at.col && !locked.has(n.id))
  const hasZoneAt = spec.zones.some((z) => z.at && z.at.col)
  if (pinnedNodes.length === 0 && !hasZoneAt) return
  const gridOf = gridsFor(spec, sizes)
  const page = gridOf(null)
  const zt = zoneTree(spec)
  const live = new Set(spec.zones.filter((z) => zt.members(z.id).length > 0).map((z) => z.id))
  const PAGE = { x: -page.colW / 2, y: -page.rowH / 2 } // page grid: cell 1,1 is centred on (0,0)
  const left = (id) => pos.get(id).x - sizes.get(id)[0] / 2
  const top = (id) => pos.get(id).y - sizes.get(id)[1] / 2

  // 1. Where each zone's own grid starts (the top-left corner of its cell 1,1).
  const origin = new Map()
  spec.zones.forEach((z) => {
    if (!live.has(z.id)) return
    const ids = zt.members(z.id)
    origin.set(z.id, { x: Math.min(...ids.map(left)), y: Math.min(...ids.map(top)) })
  })

  // 2. Nodes with an `at`: the cell is in the grid of the zone the node is in (else the page's).
  const trackCache = new Map()
  const tracksFor = (scope) => {
    const key = scope || ''
    if (!trackCache.has(key)) {
      const items = pinnedNodes.filter((n) => (scope ? n.zone === scope : !(n.zone && origin.get(n.zone))))
      const roomy = scope ? spec.zones.find((z) => z.id === scope).net : spec.diagramType === 'ontology'
      const everyone = spec.nodes.filter((n) => !n.phantom && (scope ? n.zone === scope : !(n.zone && origin.get(n.zone))))
      trackCache.set(key, makeTracks(items, sizes, roomy, everyone.length ? everyone : items))
    }
    return trackCache.get(key)
  }
  pinnedNodes.forEach((n) => {
    const scope = n.zone && origin.get(n.zone) ? n.zone : null
    const t = tracksFor(scope)
    // Zone: column / row 1 starts at the zone's origin. Page: column / row 1 is centred on 0,0.
    const bx = scope ? origin.get(scope).x : -t.x(1)
    const by = scope ? origin.get(scope).y : -t.y(1)
    const p = pos.get(n.id)
    p.x = bx + t.x(n.at.col)
    if (n.at.row) p.y = by + t.y(n.at.row)
  })

  // 3. Zones with an `at`: sibling zones are laid out as a grid of their own, by order.
  const box = (z) => {
    const ids = zt.members(z.id)
    const pad = ZONE_PAD * zt.height(z.id)
    return [
      Math.min(...ids.map(left)) - pad,
      Math.min(...ids.map(top)) - pad,
      Math.max(...ids.map((id) => left(id) + sizes.get(id)[0])) + pad,
      Math.max(...ids.map((id) => top(id) + sizes.get(id)[1])) + pad,
    ]
  }
  placedZoneGroups(spec, live, zt).forEach(([, zs]) => {
    const boxes = new Map(zs.map((z) => [z.id, box(z)]))
    const rowKey = (z) => z.at.row || 1
    const rows = [...new Set(zs.map(rowKey))].sort((a, b) => a - b)
    const h = new Map()
    zs.forEach((z) => {
      const b = boxes.get(z.id)
      h.set(rowKey(z), Math.max(h.get(rowKey(z)) || 0, b[3] - b[1]))
    })
    const yOf = new Map()
    const x0 = Math.min(...[...boxes.values()].map((b) => b[0]))
    let y = Math.min(...[...boxes.values()].map((b) => b[1]))
    rows.forEach((r) => (yOf.set(r, y), (y += h.get(r) + ZONE_GAP)))
    // Within a row the zones are packed left to right by their own widths (so a narrow zone sits
    // right next to its neighbour, not a whole wide column away); rows stack as tall as their tallest.
    const xOf = new Map()
    rows.forEach((r) => {
      let x = x0
      zs.filter((z) => rowKey(z) === r)
        .sort((a, b) => a.at.col - b.at.col)
        .forEach((z) => {
          const b = boxes.get(z.id)
          xOf.set(z.id, x)
          x += b[2] - b[0] + ZONE_GAP
        })
    })
    zs.forEach((z) => {
      const b = boxes.get(z.id)
      const dx = xOf.get(z.id) - b[0]
      const dy = yOf.get(rowKey(z)) - b[1]
      zt.members(z.id).forEach((id) => {
        pos.get(id).x += dx
        pos.get(id).y += dy
      })
    })
  })

  // 4. Everything else that ended up on top of a pinned node slides clear.
  const pinnedIds = new Set(pinnedNodes.filter((n) => n.at.row).map((n) => n.id))
  const cross = spec.direction === 'TB' ? 'x' : 'y'
  const zoneOfNode = new Map(spec.nodes.map((n) => [n.id, n.zone]))
  const overlaps = (id) =>
    spec.nodes.some((o) => {
      // Only a pinned node can have been put on top of this one; how unpinned nodes sit relative
      // to each other is the automatic layout's business and is left as it is.
      if (o.id === id || !(o.at && o.at.col)) return false
      const a = pos.get(o.id)
      const b = pos.get(id)
      // Zone padding is only needed between neighbours in the same zone; nodes of different
      // zones only must not touch (zones are kept apart by their own placement).
      const k = zoneOfNode.get(o.id) === zoneOfNode.get(id) ? lsz : sizes
      return (
        Math.abs(a.x - b.x) < (k.get(o.id)[0] + k.get(id)[0]) / 2 + 16 &&
        Math.abs(a.y - b.y) < (k.get(o.id)[1] + k.get(id)[1]) / 2 + 16
      )
    })
  spec.nodes
    .filter((n) => !pinnedIds.has(n.id) && !locked.has(n.id))
    .forEach((n) => {
      const p = pos.get(n.id)
      // A column-only pin keeps its column, so it slides up or down; any other node slides sideways.
      const axis = n.at && n.at.col ? 'y' : cross
      const start = p[axis]
      for (let k = 1; k <= 80 && overlaps(n.id); k++) p[axis] = start + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 8
    })
}

// For "Download HTML": turns dragged positions into grid cells, so the saved file says
// at="3,2" or at="2.5,2" and not pixels. Nodes inside a zone get cells in that zone's own grid
// (cell 1,1 = its top-left node), the others in the page grid. Each node takes the nearest free
// half-step cell in its own grid (a cell is taken when another node in the same grid is less
// than one cell away in both directions). Zones get their order among sibling zones: zones that
// overlap in height share a row, zones that overlap in width share a column.
// Returns { nodes: Map id -> {col,row}, zones: Map zoneId -> {col,row} }.
export function snapToGrid(shapeNodes, spec = { zones: [], nodes: [] }) {
  const sizes = new Map(shapeNodes.map((n) => [n.id, [n.data.w, n.data.h]]))
  const gridOf = gridsFor(spec, sizes)
  const page = gridOf(null)
  const half = (v) => Math.round(v * 2) / 2
  const byId = new Map(shapeNodes.map((n) => [n.id, n]))
  const zt = zoneTree(spec)
  const zoneOf = new Map(spec.nodes.map((n) => [n.id, n.zone]))
  const live = spec.zones.filter((z) => zt.members(z.id).some((id) => byId.has(id)))
  const liveIds = new Set(live.map((z) => z.id))
  const PAGE = { x: -page.colW / 2, y: -page.rowH / 2 }
  const rect = (id) => {
    const n = byId.get(id)
    return [n.position.x, n.position.y, n.position.x + n.data.w, n.position.y + n.data.h]
  }
  const centre = (id) => {
    const r = rect(id)
    return { x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2 }
  }

  // Each zone's grid starts half a cell before its top-left node centre, so that node is cell 1.
  const origin = new Map()
  live.forEach((z) => {
    const cs = zt.members(z.id).filter((id) => byId.has(id)).map(centre)
    const own = gridOf(z.id)
    origin.set(z.id, { x: Math.min(...cs.map((c) => c.x)) - own.colW / 2, y: Math.min(...cs.map((c) => c.y)) - own.rowH / 2 })
  })

  const placed = new Map()
  const cells = new Map()
  shapeNodes.forEach((n) => {
    const z = zoneOf.get(n.id)
    const scope = z && liveIds.has(z) ? z : '(page)'
    const base = scope === '(page)' ? PAGE : origin.get(scope)
    const { colW, rowH } = gridOf(scope === '(page)' ? null : scope)
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
  if (pageNodes.length) {
    const dCol = Math.min(...pageNodes.map((c) => c.col)) - 1
    const dRow = Math.min(...pageNodes.map((c) => c.row)) - 1
    pageNodes.forEach((c) => {
      c.col -= dCol
      c.row -= dRow
    })
  }

  // Zones: order among siblings. A column is a run of zones whose widths overlap (sorted by left
  // edge); a row is a run whose heights overlap.
  const zoneCell = new Map()
  const groups = new Map()
  live.forEach((z) => {
    const k = z.parent && liveIds.has(z.parent) ? z.parent : ''
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(z)
  })
  const boxOf = (z) => {
    const rs = zt.members(z.id).filter((id) => byId.has(id)).map(rect)
    return [Math.min(...rs.map((r) => r[0])), Math.min(...rs.map((r) => r[1])), Math.max(...rs.map((r) => r[2])), Math.max(...rs.map((r) => r[3]))]
  }
  const runs = (zs, lo, hi) => {
    const out = new Map()
    let idx = 0
    let reach = -Infinity
    ;[...zs].sort((a, b) => boxOf(a)[lo] - boxOf(b)[lo]).forEach((z) => {
      const b = boxOf(z)
      if (b[lo] >= reach) idx++
      reach = Math.max(reach, b[hi])
      out.set(z.id, idx)
    })
    return out
  }
  groups.forEach((zs) => {
    const cols = runs(zs, 0, 2)
    const rows = runs(zs, 1, 3)
    zs.forEach((z) => zoneCell.set(z.id, { col: cols.get(z.id), row: rows.get(z.id) }))
  })
  return { nodes: cells, zones: zoneCell }
}

// For "Download HTML": which nodes got a new `at` because they were dragged, so that the saved
// copy lays out the way the viewer showed it. Only nodes that moved from where the viewer put
// them (`initial`: id -> {x, y}) get a cell; every other node keeps what its source says, so a
// copy without drags is identical to the source. In a scope (a zone, or the page) that has
// unmoved pinned nodes, a moved node gets the nearest cell of that scope's own column / row
// layout (the same one pinToGrid uses). In a scope with none, every node of the scope is pinned
// (as snapToGrid does), since there is nothing to anchor a single node to.
// Nodes in swimlane blocks are never rewritten. Returns Map id -> {col, row}.
export function cellsForMoved(shapeNodes, spec, initial) {
  const out = new Map()
  const byId = new Map(shapeNodes.map((n) => [n.id, n]))
  const sizes = new Map(shapeNodes.map((n) => [n.id, [n.data.w, n.data.h]]))
  const lockedIds = new Set()
  if (spec.lanes.length) laneBlocks(spec).forEach((b) => b.nodes.forEach((n) => lockedIds.add(n.id)))
  const moved = new Set(
    shapeNodes
      .filter((n) => {
        const i = initial.get(n.id)
        return i && (Math.abs(n.position.x - i.x) > 2 || Math.abs(n.position.y - i.y) > 2)
      })
      .map((n) => n.id),
  )
  if (moved.size === 0) return out
  const uniform = snapToGrid(shapeNodes, spec).nodes
  const zt = zoneTree(spec)
  const liveZones = new Set(spec.zones.filter((z) => zt.members(z.id).some((id) => byId.has(id))).map((z) => z.id))
  const scopes = new Map()
  spec.nodes
    .filter((n) => byId.has(n.id) && !lockedIds.has(n.id))
    .forEach((n) => {
      const s = n.zone && liveZones.has(n.zone) ? n.zone : ''
      if (!scopes.has(s)) scopes.set(s, [])
      scopes.get(s).push(n)
    })
  const centre = (id) => {
    const n = byId.get(id)
    return { x: n.position.x + n.data.w / 2, y: n.position.y + n.data.h / 2 }
  }
  scopes.forEach((nodes, scope) => {
    const mv = nodes.filter((n) => moved.has(n.id))
    if (mv.length === 0) return
    const roomy = scope ? spec.zones.find((z) => z.id === scope).net : spec.diagramType === 'ontology'
    const refs = nodes.filter((n) => !moved.has(n.id) && n.at && n.at.col && n.at.row)
    const zone = scope ? spec.zones.find((z) => z.id === scope) : null
    // A zone that is itself placed with `at` has a frame we cannot recover here: pin its nodes all.
    if (refs.length === 0 && zone && zone.at) {
      nodes.forEach((n) => out.set(n.id, uniform.get(n.id)))
      return
    }
    const prov = mv.map((n) => ({ id: n.id, at: uniform.get(n.id) }))
    // The same tracks pinToGrid will use on reload: every pinned node of the scope (the ones that
    // did not move keep their authored cells), sized from all the scope's nodes.
    const keep = nodes.filter((n) => !moved.has(n.id) && n.at && n.at.col)
    const items = [...keep, ...prov]
    const t = makeTracks(items, sizes, roomy, nodes)
    let ox
    let oy
    if (refs.length) {
      // Anchor on a pinned node that did not move: it sits at origin + its own cell.
      const c0 = centre(refs[0].id)
      ox = c0.x - t.x(refs[0].at.col)
      oy = c0.y - t.y(refs[0].at.row)
    } else if (!scope) {
      // Page frame: cell 1,1 is centred on 0,0 (see pinToGrid).
      ox = -t.x(1)
      oy = -t.y(1)
    } else {
      // Unpinned zone: its grid starts at the top-left of where the viewer put its members.
      const rs = zt.members(scope).map((id) => initial.get(id)).filter(Boolean)
      ox = Math.min(...rs.map((p) => p.x))
      oy = Math.min(...rs.map((p) => p.y))
    }
    const maxCol = Math.max(...items.map((n) => n.at.col)) + 1
    const maxRow = Math.max(...items.map((n) => n.at.row || 1)) + 1
    const nearest = (f, target, max) => {
      let best = 1
      for (let v = 1; v <= max; v += 0.5) if (Math.abs(f(v) - target) < Math.abs(f(best) - target)) best = v
      return best
    }
    mv.forEach((n) => {
      const c = centre(n.id)
      out.set(n.id, { col: nearest(t.x, c.x - ox, maxCol), row: nearest(t.y, c.y - oy, maxRow) })
    })
  })
  return out
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
function evictFromZones(spec, sizes, pos, locked = new Set()) {
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
      .filter((n) => !inside.has(n.id) && !locked.has(n.id) && !(n.at && n.at.row)) // pinned / lane nodes stay where they were put
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

function makeZones(spec, shapeNodes, laneNodes = []) {
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
      // A zone that holds lanes also wraps their bands.
      members: [...spec.nodes.filter((n) => n.zone === z.id).map((n) => n.id), ...laneNodes.filter((l) => l.data.zid === z.id).map((l) => l.id)],
      children: zt.children.get(z.id).filter((c) => liveIds.has(c)),
    },
    style: { width: 0, height: 0 },
    draggable: false,
    selectable: false,
    focusable: false,
    // Outer zones sit behind inner ones, all behind the nodes and above swimlane bands.
    zIndex: Math.min(-1, -4 + zt.depth(z.id)),
  }))
  const sized = refreshZones([...zoneNodes, ...shapeNodes, ...laneNodes]).filter((n) => n.type === 'zone')
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
function straighten(spec, sizes, pos, locked = new Set()) {
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
      if (locked.has(v) || ins.get(v).size !== 1) return
      const want = wantFor({ from: u.id, to: v })
      if (Math.abs(pos.get(v)[cross] - want) > 0.5 && blockersOf(v, want).length === 0) pos.get(v)[cross] = want
    })

  const branches = () =>
    forward.forEach((e) => {
      const v = e.to
      if (locked.has(v) || ins.get(v).size !== 1) return
      const want = wantFor(e)
      const off = Math.abs(pos.get(v)[cross] - want)
      // "A little off" = less than the node's own size across: that is a jog, not a branch.
      if (!(off > 0.5 && off <= Math.max(48, span(v, cross) * 0.8))) return
      const blockers = blockersOf(v, want)
      if (blockers.length === 0) {
        pos.get(v)[cross] = want
        return
      }
      // Only nudge neighbours in the same column (never ones locked in place).
      if (blockers.some((b) => locked.has(b.id) || Math.abs(pos.get(b.id)[main] - pos.get(v)[main]) > 1)) return
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
  const shift = POOL_W + LABEL_W + 48 - minX
  // A node with at="col" is placed on the column grid (each column as wide as the widest node
  // pinned to it); the others follow the automatic layout.
  const tracks = makeTracks(spec.nodes.filter((n) => n.at && n.at.col), sizes, false, spec.nodes)
  const x0Of = (n) =>
    useManual && n.at
      ? POOL_W + LABEL_W + 48 + tracks.x(n.at.col) - sizes.get(n.id)[0] / 2
      : pos.get(n.id).x - sizes.get(n.id)[0] / 2 + shift
  let maxRight = 0 // grows to the right edge of the placed nodes

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

// One node leading to several nodes that stand in a line (one column in a left-to-right
// diagram, one row in a top-down one): those nodes get the same size across the flow (width,
// or height top-down), so their edges all end the same distance from the start and the
// column / row has one clean edge. Only nodes of one type, with no size set by hand, and the
// widest keeps its size, so nothing is clipped. Returns a new sizes map.
function alignFanOuts(spec, sizes, pos, locked = new Set()) {
  const horizontal = spec.direction !== 'TB'
  const along = horizontal ? 'x' : 'y'
  const dim = horizontal ? 0 : 1
  const byId = new Map(spec.nodes.map((n) => [n.id, n]))
  const FIXED = new Set(['connector', 'concept', 'offpage'])
  const out = new Map(sizes)
  const targets = new Map()
  spec.edges.forEach((e) => {
    if (e.from === e.to || !(pos.get(e.to)[along] > pos.get(e.from)[along])) return
    if (!targets.has(e.from)) targets.set(e.from, new Set())
    targets.get(e.from).add(e.to)
  })
  targets.forEach((set) => {
    const ids = [...set].sort((a, b) => pos.get(a)[along] - pos.get(b)[along])
    let run = []
    const flush = () => {
      const nodes = run.map((id) => byId.get(id))
      if (run.length > 1 && nodes.every((n) => n.type === nodes[0].type && !FIXED.has(n.type) && !n.width && !n.height && !locked.has(n.id))) {
        const v = Math.max(...run.map((id) => out.get(id)[dim]))
        run.forEach((id) => {
          const s = [...out.get(id)]
          s[dim] = v
          out.set(id, s)
        })
      }
      run = []
    }
    ids.forEach((id) => {
      if (run.length && pos.get(id)[along] - pos.get(run[run.length - 1])[along] > 24) flush()
      run.push(id)
    })
    flush()
  })
  return out
}

// The automatic layout leaves more room between columns than needed: nodes in zones are laid out
// larger (so zone boxes fit), and that padding is counted again in every gap. Here the columns
// (ranks) are spaced again from the real node sizes: each column starts one gap after the widest
// node of the one before, or a little more when a label sits on an edge between them. The first
// column stays put. Nothing moves across the flow, so rows are unchanged.
function compactRanks(spec, sizes, pos, locked = new Set()) {
  const flow = spec.nodes.filter((n) => !n.net && !locked.has(n.id))
  // Ontology nodes are not compacted; if any of them is free (no `at`), leave the layout alone.
  if (flow.length === 0 || spec.nodes.some((n) => n.net && !(n.at && n.at.col))) return
  const horizontal = spec.direction !== 'TB'
  const m = horizontal ? 'x' : 'y'
  const d = horizontal ? 0 : 1
  const { gx } = gapsOf(new Map(flow.map((n) => [n.id, sizes.get(n.id)])), false)
  const gap = horizontal ? gx : Math.max(32, gx - 24)
  const sorted = [...flow].sort((a, b) => pos.get(a.id)[m] - pos.get(b.id)[m])
  const cols = []
  sorted.forEach((n) => {
    const c = cols[cols.length - 1]
    if (c && Math.abs(pos.get(n.id)[m] - c.centre) <= 2) c.ids.push(n.id)
    else cols.push({ centre: pos.get(n.id)[m], ids: [n.id] })
  })
  const colOf = new Map()
  cols.forEach((c, i) => c.ids.forEach((id) => colOf.set(id, i)))
  const need = cols.map(() => gap)
  spec.edges.forEach((e) => {
    if (!e.label || !colOf.has(e.from) || !colOf.has(e.to)) return
    const a = colOf.get(e.from)
    const b = colOf.get(e.to)
    if (b === a + 1) need[b] = Math.max(need[b], e.label.length * 7 + 20 + 2 * 24)
  })
  let right = 0
  cols.forEach((c, i) => {
    const half = Math.max(...c.ids.map((id) => sizes.get(id)[d] / 2))
    const centre = i === 0 ? c.centre : Math.min(c.centre, right + need[i] + half)
    c.ids.forEach((id) => (pos.get(id)[m] = centre))
    right = centre + half
  })
}

// Spec + measured sizes -> React Flow nodes/edges. Positions come from dagre unless a node
// has x/y (set by "Download HTML" after you drag things) and useManual is true. With lanes,
// the lane layout always decides positions.
export function buildGraph(spec, sizes, { useManual = true } = {}) {
  const g = new graphlib.Graph({ compound: true })
  const allNet = spec.nodes.length > 0 && spec.nodes.every((n) => n.net)
  // Spacing follows the node size: small nodes sit closer together, big ones get more room.
  // Ontology circles and their straight links need more room (fixed 96 / 128): in a mixed
  // diagram their nodes are laid out slightly larger, so only they get the extra space.
  const med = (v) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0)
  const flowSizes = spec.nodes.filter((n) => !n.net).map((n) => sizes.get(n.id))
  const LR = spec.direction !== 'TB'
  const crossMed = med(flowSizes.map((s) => s[LR ? 1 : 0]))
  const mainMed = med(flowSizes.map((s) => s[LR ? 0 : 1]))
  const clamp = (v, lo, hi) => Math.round(Math.min(hi, Math.max(lo, v)))
  const nodesep = allNet ? 96 : clamp(crossMed * 0.6, 32, 64)
  const ranksep = allNet ? 128 : clamp(mainMed * 0.4, 80, 96)
  const extraMain = allNet ? 0 : 128 - ranksep
  const extraCross = allNet ? 0 : 96 - nodesep
  g.setGraph({ rankdir: spec.direction, nodesep, ranksep, edgesep: 24, marginx: 24, marginy: 24 })
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
      const ex = n.net ? (LR ? extraMain : extraCross) : 0
      const ey = n.net ? (LR ? extraCross : extraMain) : 0
      return [n.id, [w + k + ex, h + k + ey]]
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

  // Swimlanes: the lanes of a zone are laid out as one block of their own (lanes outside any zone
  // make a page-level block). Each block is laid out by laneLayout, moved to where the automatic
  // layout had its nodes, and then travels with its zone like any other member: zone placement
  // (at) moves it, and the zone box wraps its bands. Nodes of a block are "locked": the steps
  // below (pinning, straightening, eviction ...) leave them where the lane layout put them.
  const locked = new Set()
  const blockLanes = []
  const phantoms = []
  const problems = []
  const blocks = spec.lanes.length ? laneBlocks(spec) : new Map()
  blocks.forEach((b, key) => {
    if (b.nodes.length === 0) return
    b.nodes.forEach((n) => locked.add(n.id))
    const ids = new Set(b.nodes.map((n) => n.id))
    const bspec = {
      ...spec,
      lanes: b.lanes,
      nodes: b.nodes,
      edges: spec.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
      pool: blocks.size === 1 || key === '' ? spec.pool : '',
    }
    const r = laneLayout(bspec, sizes, pos, useManual)
    problems.push(...r.problems)
    const rects = r.laneNodes.map((n) => [n.position.x, n.position.y, n.position.x + n.data.w, n.position.y + n.data.h])
    const L = Math.min(...rects.map((q) => q[0]))
    const T = Math.min(...rects.map((q) => q[1]))
    const R = Math.max(...rects.map((q) => q[2]))
    const B = Math.max(...rects.map((q) => q[3]))
    // Start where the automatic layout had this block's nodes (top-left corner).
    const dx = Math.min(...b.nodes.map((n) => pos.get(n.id).x - sizes.get(n.id)[0] / 2)) - L
    const dy = Math.min(...b.nodes.map((n) => pos.get(n.id).y - sizes.get(n.id)[1] / 2)) - T
    r.placed.forEach((p, id) => {
      const [w, h] = sizes.get(id)
      pos.set(id, { x: p.x + dx + w / 2, y: p.y + dy + h / 2 })
    })
    const info = { key, nodes: r.laneNodes.map((n) => ({ ...n, position: { x: n.position.x + dx, y: n.position.y + dy }, data: { ...n.data, zid: key } })) }
    if (key) {
      // The bands count as a member of the zone, so the zone is placed and sized to include them.
      const id = `~lanes:${key}`
      const size = [R - L, B - T]
      phantoms.push({ id, zone: key, type: 'note', net: false, phantom: true })
      sizes.set(id, size)
      lsz.set(id, size)
      pos.set(id, { x: L + dx + size[0] / 2, y: T + dy + size[1] / 2 })
      locked.add(id)
      info.probe = id
    } else info.probe = b.nodes[0].id
    info.start = { x: pos.get(info.probe).x, y: pos.get(info.probe).y }
    blockLanes.push(info)
  })

  const spec2 = phantoms.length ? { ...spec, nodes: [...spec.nodes, ...phantoms] } : spec
  compactRanks(spec2, sizes, pos, locked)
  straighten(spec2, lsz, pos, locked)
  if (useManual) pinToGrid(spec2, sizes, lsz, pos, locked)
  evictFromZones(spec2, sizes, pos, locked)
  sizes = alignFanOuts(spec2, sizes, pos, locked)

  // Whatever moved a block (its zone being placed) moves its lane bands the same way.
  const laneNodes = []
  blockLanes.forEach((info) => {
    const dx = pos.get(info.probe).x - info.start.x
    const dy = pos.get(info.probe).y - info.start.y
    info.nodes.forEach((n) => laneNodes.push({ ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }))
  })

  const shapeNodes = spec.nodes.map((n) => {
    const [w, h] = sizes.get(n.id)
    const p = pos.get(n.id)
    const position = { x: p.x - w / 2, y: p.y - h / 2 }
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

  // A link is a straight ontology link when both ends are ontology nodes; otherwise it is routed.
  const netNode = new Map(spec.nodes.map((n) => [n.id, n.net]))
  const edges = spec.edges.map((e, i) => ({
    id: `e${i}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    type: netNode.get(e.from) && netNode.get(e.to) ? 'floating' : 'routed',
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

  const zones = makeZones(spec, shapeNodes, laneNodes)
  const all = [...laneNodes, ...zones.nodes, ...shapeNodes]
  const routed = routeFor(spec, all, edges)
  return { nodes: routed.nodes, edges: routed.edges, problems: [...problems, ...zones.problems] }
}

// Groups the lanes by the zone they sit in ('' = not in a zone) and says which block each node
// belongs to: its lane's block; else the nearest zone around it that has lanes (it goes in that
// block's first lane); else, if it is in some other zone, none (it is laid out freely); else, if
// the page has lanes of its own, the page-level block.
export function laneBlocks(spec) {
  const blocks = new Map()
  spec.lanes.forEach((l) => {
    const key = l.zone || ''
    if (!blocks.has(key)) blocks.set(key, { lanes: [], nodes: [] })
    blocks.get(key).lanes.push(l)
  })
  const laneById = new Map(spec.lanes.map((l) => [l.id, l]))
  const parentOf = new Map(spec.zones.map((z) => [z.id, z.parent]))
  spec.nodes.forEach((n) => {
    let key = null
    const lane = laneById.get(n.lane)
    if (lane) key = lane.zone || ''
    else {
      for (let z = n.zone, k = 0; z && k < 50; z = parentOf.get(z), k++) {
        if (blocks.has(z)) {
          key = z
          break
        }
      }
      if (key === null && !n.zone && blocks.has('')) key = ''
    }
    if (key !== null) blocks.get(key).nodes.push(n)
  })
  return blocks
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

  // Edges that leave one node for several nodes in the same column (or that arrive at one node
  // from several nodes in the same column) all use the same pair of sides, so a fan-out looks
  // like one thing and a far-off sibling does not suddenly leave from the bottom.
  const alongFlow = (c) => (hFlow ? c.x : c.y)
  ;[
    [(e) => e.source, (p) => p.b],
    [(e) => e.target, (p) => p.a],
  ].forEach(([nodeOf, otherEnd]) => {
    const groups = new Map()
    edges.forEach((e, i) => {
      if (picks[i].back) return
      const k = nodeOf(e)
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(i)
    })
    groups.forEach((idx) => {
      const sorted = [...idx].sort((i, j) => alongFlow(otherEnd(picks[i])) - alongFlow(otherEnd(picks[j])))
      let run = []
      const flush = () => {
        if (run.length > 1)
          run.forEach((i) => {
            const p = picks[i]
            ;[p.src, p.tgt] = hFlow ? (p.dx >= 0 ? ['right', 'left'] : ['left', 'right']) : p.dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
            p.lock = true
          })
        run = []
      }
      sorted.forEach((i) => {
        if (run.length && alongFlow(otherEnd(picks[i])) - alongFlow(otherEnd(picks[run[run.length - 1]])) > 24) flush()
        run.push(i)
      })
      flush()
    })
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
    const tryOptions = (list) =>
      list.forEach(([ss, ts, penalty]) => {
        const r = search(ss, ts, attach(s, ss, 0.5), attach(t, ts, 0.5), [e.source, e.target], [])
        if (r && (!best || r.cost + penalty < best.cost)) best = { ss, ts, pl: r.pl, cost: r.cost + penalty }
      })
    // A locked pair (see above) is used as long as it can be routed at all.
    tryOptions(p.lock ? options.slice(0, 1) : options)
    if (!best && p.lock) tryOptions(options)
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
    // Connectors that start on the same side of a node leave from ONE point, and connectors that
    // end on the same side arrive at ONE point: they combine into a single line that splits where
    // the routes part. So a side has at most two points (one for leaving, one for arriving).
    const reps = ['source', 'target'].map((r) => list.find((it) => it.role === r)).filter(Boolean)
    reps.sort((p, q) => p.g - q.g || (p.g < 0 ? p.dist - q.dist : p.g > 0 ? q.dist - p.dist : p.other[along] - q.other[along]))
    const ai = reps.findIndex((it) => it.g === 0)
    const n = reps.length
    const slot = new Map()
    reps.forEach((it, k) => {
      const pct = ai === -1 || n === 1 ? (k + 1) / (n + 1) : k === ai ? 0.5 : k < ai ? (0.5 * (k + 1)) / (ai + 1) : 0.5 + (0.5 * (k - ai)) / (n - ai)
      const id = `${it.role}-${side}-${k}-of-${n}`
      if (!handles.has(nodeId)) handles.set(nodeId, [])
      handles.get(nodeId).push({ id, role: it.role, side, pct })
      slot.set(it.role, { id, pct })
    })
    list.forEach((it) => {
      handleOf.set(`${it.role}|${it.i}`, slot.get(it.role).id)
      pctOf.set(`${it.role}|${it.i}`, slot.get(it.role).pct)
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
  // Add the link points to the circles that have a link (keeping any points routed edges use).
  const ends = new Set(edges.flatMap((e) => [e.source, e.target]))
  const outNodes = nodes.map((n) =>
    n.type === 'shape' && ends.has(n.id) ? { ...n, data: { ...n.data, handles: [...(n.data.handles || []).filter((h) => h.id !== 's' && h.id !== 't'), ...handles] } } : n,
  )
  return { nodes: outNodes, edges: outEdges }
}

// Picks the router per link: ontology links (type 'floating', both ends in ontology zones or an
// ontology file) are straight lines, every other link is routed at right angles. Used after
// layout and after a node is dragged.
export function routeFor(spec, nodes, edges) {
  const order = new Map(edges.map((e, i) => [e.id, i]))
  const flow = routeEdges(nodes, edges.filter((e) => e.type !== 'floating'), spec.direction)
  const net = routeNetwork(flow.nodes, edges.filter((e) => e.type === 'floating'))
  return { nodes: net.nodes, edges: [...flow.edges, ...net.edges].sort((a, b) => order.get(a.id) - order.get(b.id)) }
}
