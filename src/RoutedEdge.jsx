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
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: data?.radius ?? 14,
    offset: data?.offset ?? 26,
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
