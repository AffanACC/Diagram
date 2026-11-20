// Reads the authored diagram from the <template id="diagram-source"> element.
// The browser's own HTML parser does the work, so node content can be any HTML.
//
//   <diagram title=".." description=".." direction="LR|TB" pool="optional pool name" skeleton>
//     <lane label="Operations">                      swimlane row (LR only): nodes inside belong to it
//       <node id="a" type="card" at="3,2" assumed>...any HTML...</node>
//     </lane>
//     <zone label="Order system">                    labelled box around its nodes; zones can nest
//       <node id="p" type="dfd-process" num="1.2">Validate order</node>
//     </zone>
//     <node id="e" type="event" kind="start">Order received</node>
//     <edge from="a" to="b" label=".." dashed assumed></edge>
//   </diagram>
// The older attribute form also works: <lane id=".." label=".."></lane> then lane=".." on nodes,
// and zone=".." on nodes. Types and their attributes are listed at the top of shapes.js.

import { ALIASES, TYPES, TONES, EVENT_KINDS, GATEWAY_KINDS } from './shapes.js'

const num = (v) => {
  if (v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

// at="3,2" = column 3, row 2 on the diagram grid (1-based, from the top left). Half steps
// are allowed: at="2.5,2" sits between columns 2 and 3 (an offset row). "3" alone pins only
// the column: in swimlanes the lane decides the row, elsewhere the row stays automatic.
function parseAt(v, who, problems) {
  if (v === null || v.trim() === '') return undefined
  const m = /^\s*(\d+(?:\.5)?)\s*(?:,\s*(\d+(?:\.5)?)\s*)?$/.exec(v)
  if (!m || Number(m[1]) < 1 || (m[2] !== undefined && Number(m[2]) < 1)) {
    problems.push(`${who} has an invalid at="${v}" (use column,row such as at="3,2"; half steps like 2.5 are allowed)`)
    return undefined
  }
  return { col: Number(m[1]), row: m[2] === undefined ? undefined : Number(m[2]) }
}
// <zone type="ontology"> makes that zone an ontology (circles, straight links); type="flow" makes
// it an ordinary flow even inside an ontology file. Without a type a zone inherits from the zone
// around it, else from <diagram type>.
function zoneType(v, id, problems) {
  if (v === null || v === '') return undefined
  if (v === 'ontology' || v === 'flow') return v
  problems.push(`Zone "${id}" has unknown type "${v}" (use ontology or flow)`)
  return undefined
}
const flag = (el, name) => el.hasAttribute(name) && el.getAttribute(name) !== 'false'

// Reads <lane> or <zone> elements: id is optional (made up if missing), label defaults to the id.
function readGroups(root, tag, problems, fallbackLabel) {
  const groups = []
  const idOf = new Map()
  const used = new Set()
  root.querySelectorAll(tag).forEach((el, i) => {
    let id = el.getAttribute('id')
    if (id && used.has(id)) return problems.push(`Duplicate ${tag} id "${id}" was skipped`)
    if (!id) {
      let k = i + 1
      while (used.has(`${tag}-${k}`)) k++
      id = `${tag}-${k}`
    }
    used.add(id)
    idOf.set(el, id)
    const parentEl = el.parentElement ? el.parentElement.closest(tag) : null
    groups.push({
      id,
      label: el.getAttribute('label') || (el.getAttribute('id') ? id : fallbackLabel(i)),
      // A zone may carry at="col,row": where its own grid starts (see pinToGrid in layout.js).
      at: tag === 'zone' ? parseAt(el.getAttribute('at'), `Zone "${id}"`, problems) : undefined,
      // A zone may carry type="ontology" (or "flow" to opt out of an ontology file): see readSpec.
      own: tag === 'zone' ? zoneType(el.getAttribute('type'), id, problems) : undefined,
      parentEl,
    })
  })
  groups.forEach((g) => {
    g.parent = g.parentEl ? idOf.get(g.parentEl) : undefined
    delete g.parentEl
  })
  return { groups, idOf }
}

export function readSpec() {
  const problems = []
  const tpl = document.getElementById('diagram-source')
  const root = tpl && tpl.content.querySelector('diagram')
  if (!root) {
    return { title: 'No diagram found', nodes: [], edges: [], lanes: [], zones: [], problems: ['No <diagram> element found'] }
  }
  const direction = root.getAttribute('direction') === 'TB' ? 'TB' : 'LR'
  // <diagram type="ontology">: circles joined by labelled links (straight, not right-angled).
  const diagramType = root.getAttribute('type') === 'ontology' ? 'ontology' : ''

  const { groups: lanes, idOf: laneIdOf } = readGroups(root, 'lane', problems, (i) => `Lane ${i + 1}`)
  if (lanes.length && direction === 'TB') problems.push('Lanes need direction="LR"; they were ignored')
  const { groups: zones, idOf: zoneIdOf } = readGroups(root, 'zone', problems, (i) => `Zone ${i + 1}`)

  // The type that applies per zone: its own, else its parent zone's, else the file's. `net` = ontology.
  const zoneById = new Map(zones.map((z) => [z.id, z]))
  const resolve = (zoneId) => {
    for (let z = zoneById.get(zoneId), n = 0; z && n < 50; z = zoneById.get(z.parent), n++) if (z.own) return z.own === 'ontology'
    return diagramType === 'ontology'
  }
  zones.forEach((z) => (z.net = resolve(z.id)))
  zones.forEach((z) => delete z.own)
  const netOf = (zoneId) => (zoneById.has(zoneId) ? zoneById.get(zoneId).net : diagramType === 'ontology')

  const seen = new Set()
  const nodes = []
  root.querySelectorAll('node').forEach((el) => {
    const id = el.getAttribute('id')
    if (!id) return problems.push('A <node> has no id and was skipped')
    if (seen.has(id)) return problems.push(`Duplicate node id "${id}" was skipped`)
    seen.add(id)

    // Membership: the nearest <lane> / <zone> around the node, else the lane=/zone= attribute.
    const laneEl = el.closest('lane')
    const lane = (laneEl && laneIdOf.get(laneEl)) || el.getAttribute('lane') || undefined
    if (lane && lanes.length && !lanes.some((l) => l.id === lane)) {
      problems.push(`Node "${id}" is in unknown lane "${lane}"`)
    }
    const zoneEl = el.closest('zone')
    const zone = (zoneEl && zoneIdOf.get(zoneEl)) || el.getAttribute('zone') || undefined
    if (zone && !zones.some((z) => z.id === zone)) problems.push(`Node "${id}" is in unknown zone "${zone}"`)
    const net = netOf(zone)

    const rawType = el.getAttribute('type') || (net ? 'concept' : 'card')
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
    let tone = el.getAttribute('tone') || undefined
    if (tone && !TONES.includes(tone)) {
      problems.push(`Node "${id}" has unknown tone "${tone}" (use ${TONES.join(', ')})`)
      tone = undefined
    }
    nodes.push({
      id,
      tone,
      type,
      kind,
      num: el.getAttribute('num') || '',
      lane,
      zone,
      net,
      assumed: flag(el, 'assumed'),
      html: el.innerHTML.trim(),
      width: num(el.getAttribute('width')),
      height: num(el.getAttribute('height')),
      align: el.getAttribute('align') || undefined,
      at: parseAt(el.getAttribute('at'), `Node "${id}"`, problems),
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
      both: flag(el, 'both'),
    })
  })

  return {
    title: root.getAttribute('title') || 'Diagram',
    description: root.getAttribute('description') || '',
    pool: root.getAttribute('pool') || '',
    skeleton: flag(root, 'skeleton'),
    diagramType,
    direction,
    lanes: direction === 'LR' ? lanes : [],
    zones,
    nodes,
    edges,
    problems,
  }
}
