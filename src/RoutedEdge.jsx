import { BaseEdge, Position, getSmoothStepPath } from '@xyflow/react'

// A right-angled connector whose bend position is chosen by the router (data.cx / data.cy),
// so it runs through free space instead of through nodes. See routeEdges in layout.js.
export default function RoutedEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  data,
}) {
  const horizontal = sourcePosition === Position.Left || sourcePosition === Position.Right
  // The path steps out `offset` from each node before it bends. If the gap between the two nodes
  // is less than twice that, the two step-outs cross and leave a small jog in the middle of the
  // line, so the step-out is shrunk to fit the gap (only for ordinary forward connections).
  let offset = data?.offset ?? 26
  if (data?.offset === undefined) {
    const opposite = { [Position.Right]: Position.Left, [Position.Left]: Position.Right, [Position.Bottom]: Position.Top, [Position.Top]: Position.Bottom }
    const gap = { [Position.Right]: targetX - sourceX, [Position.Left]: sourceX - targetX, [Position.Bottom]: targetY - sourceY, [Position.Top]: sourceY - targetY }[sourcePosition]
    if (opposite[sourcePosition] === targetPosition && gap > 0) offset = Math.max(4, Math.min(offset, gap / 2 - 1))
  }
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: data?.radius ?? 14,
    offset,
    centerX: horizontal ? data?.cx : undefined,
    centerY: horizontal ? undefined : data?.cy,
  })
  return (
    <BaseEdge
      path={path}
      labelX={labelX}
      labelY={labelY}
      label={label}
      labelStyle={labelStyle}
      labelShowBg
      labelBgStyle={labelBgStyle}
      labelBgPadding={labelBgPadding}
      labelBgBorderRadius={labelBgBorderRadius}
      markerEnd={markerEnd}
      style={style}
    />
  )
}
