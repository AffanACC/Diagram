import { Handle, Position } from '@xyflow/react'

const POS = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom }

// Where on its side a connection point sits. Shapes with the label under a symbol connect at
// the symbol (glyphH), not at the middle of the label.
function handleStyle(h, glyphH) {
  const pct = `${h.pct * 100}%`
  if (h.side === 'left' || h.side === 'right') return { top: glyphH ? h.pct * glyphH : pct }
  if (h.side === 'top') return { left: pct }
  return glyphH ? { left: pct, bottom: 'auto', top: glyphH } : { left: pct }
}

// One node component for every shape. data.markup is the shape's inner HTML (see shapes.js);
// data.handles are the connection points chosen by routeEdges (see layout.js).
export default function ShapeNode({ data }) {
  const { markup, kind, w, h, assumed, glyphH, handles = [] } = data
  return (
    <div className={`shape shape-${kind}${assumed ? ' assumed' : ''}`} style={{ width: w, height: h }}>
      <div className="inner" dangerouslySetInnerHTML={{ __html: markup }} />
      {handles.map((hd) => (
        <Handle
          key={hd.id}
          id={hd.id}
          type={hd.role}
          position={POS[hd.side]}
          className="handle"
          style={handleStyle(hd, glyphH)}
        />
      ))}
    </div>
  )
}
