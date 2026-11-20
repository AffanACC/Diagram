import { BaseEdge, useInternalNode } from '@xyflow/react'
import { floatingGeometry } from './layout.js'

const ellipse = (n) => {
  const w = n.measured?.width ?? n.width ?? 0
  const h = n.measured?.height ?? n.height ?? 0
  const p = n.internals.positionAbsolute
  return { cx: p.x + w / 2, cy: p.y + h / 2, rx: w / 2, ry: h / 2 }
}

// An ontology link: a straight (or gently curved) line from circle edge to circle edge.
// It is drawn from the nodes' live positions, so it follows a node while you drag it.
export default function FloatingEdge({
  source,
  target,
  markerEnd,
  markerStart,
  style,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  data,
}) {
  const a = useInternalNode(source)
  const b = useInternalNode(target)
  if (!a || !b) return null
  const g = floatingGeometry(ellipse(a), ellipse(b), data?.bend ?? 0)
  const path = `M ${g.p0.x},${g.p0.y} Q ${g.c.x},${g.c.y} ${g.p1.x},${g.p1.y}`
  return (
    <BaseEdge
      path={path}
      labelX={0.25 * g.p0.x + 0.5 * g.c.x + 0.25 * g.p1.x}
      labelY={0.25 * g.p0.y + 0.5 * g.c.y + 0.25 * g.p1.y}
      label={label}
      labelStyle={labelStyle}
      labelShowBg
      labelBgStyle={labelBgStyle}
      labelBgPadding={labelBgPadding}
      labelBgBorderRadius={labelBgBorderRadius}
      markerEnd={markerEnd}
      markerStart={markerStart}
      style={style}
    />
  )
}
