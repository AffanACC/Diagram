// Node types and the markup for each one. The same markup string is used to measure a node
// off-screen and to draw it, so what is measured is exactly what is shown.
//
// Types (what `type=` accepts):
//   flowchart (ISO 5807):  start, end (terminator), card (process), decision, io, document,
//                          subprocess (predefined process), manual, prep, data (stored data),
//                          connector, offpage
//   process flow (BPMN):   event (kind=start|intermediate|end), gateway (kind=xor|and|or),
//                          card (task), subprocess, dataobject
//   data flow (DFD):       dfd-process (num=), datastore (num=), entity
//   ontology:              concept (a circle; the default type in <diagram type="ontology">)
//   general:               note, plain
// Aliases: process, task -> card; terminator -> start.

export const ALIASES = { process: 'card', task: 'card', terminator: 'start' }
export const TYPES = [
  'start', 'end', 'card', 'decision', 'data', 'note', 'plain',
  'io', 'document', 'subprocess', 'manual', 'prep', 'connector', 'offpage',
  'event', 'gateway', 'dataobject',
  'dfd-process', 'datastore', 'entity',
  'concept',
]
// Colour tones tell categories apart (ontology circles, cards). Meaning is up to the diagram.
export const TONES = ['grey', 'blue', 'green', 'orange', 'purple', 'red']
export const EVENT_KINDS = ['start', 'intermediate', 'end']
export const GATEWAY_KINDS = ['xor', 'and', 'or']

// Shapes whose label sits under a fixed-size symbol (BPMN convention).
export const OUTSIDE = new Set(['event', 'gateway', 'dataobject'])
// Height of the symbol, so connectors can attach to its middle instead of the label.
export const GLYPH_H = { event: 40, gateway: 44, dataobject: 50 }

const LEFT_ALIGNED = new Set(['card', 'note', 'plain'])
export const alignFor = (n) => n.align || (LEFT_ALIGNED.has(n.type) ? 'left' : 'center')

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const svg = (inner) =>
  `<svg class="bg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${inner}</svg>`
const poly = (pts) => `<polygon points="${pts}"/>`

// Stretchable outlines (drawn to fill the node's box).
const BG = {
  decision: poly('50,1 99,50 50,99 1,50'),
  data: '<path d="M1,14 C1,2 99,2 99,14 L99,86 C99,98 1,98 1,86 Z"/><path d="M1,14 C1,26 99,26 99,14" fill="none"/>',
  io: poly('14,1 99,1 86,99 1,99'),
  manual: poly('1,1 99,1 88,99 12,99'),
  prep: poly('10,1 90,1 99,50 90,99 10,99 1,50'),
  offpage: poly('1,1 99,1 99,64 50,99 1,64'),
  document: '<path d="M1,1 H99 V86 C82,99 66,99 50,86 C34,73 18,73 1,86 Z"/>',
}

const gatewaySvg = (kind) => {
  const sym =
    kind === 'and' ? '<path class="sym" d="M22 11V33M11 22H33"/>'
    : kind === 'or' ? '<circle class="sym" cx="22" cy="22" r="9"/>'
    : '<path class="sym" d="M14 14L30 30M30 14L14 30"/>'
  return `<svg class="glyph-svg gateway" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><polygon points="22,1 43,22 22,43 1,22"/>${sym}</svg>`
}
const dataobjectSvg =
  '<svg class="glyph-svg dataobject" width="40" height="50" viewBox="0 0 40 50" aria-hidden="true"><path d="M1 1H27L39 13V49H1Z"/><path d="M27 1V13H39" fill="none"/></svg>'

// Everything inside a node's frame.
export function shapeMarkup(n) {
  // A class, not a style attribute: some hosts (document viewers) forbid inline styles.
  const text = `<div class="text"><div class="content align-${alignFor(n)}">${n.html}</div></div>`
  switch (n.type) {
    case 'event':
      return `<div class="glyph glyph-${n.kind || 'start'}"></div>${text}`
    case 'gateway':
      return gatewaySvg(n.kind || 'xor') + text
    case 'dataobject':
      return dataobjectSvg + text
    case 'dfd-process':
      return `<div class="idband">${esc(n.num)}</div>${text}`
    case 'datastore':
      return `<div class="idcell">${esc(n.num)}</div>${text}`
    default:
      return (BG[n.type] ? svg(BG[n.type]) : '') + text
  }
}
