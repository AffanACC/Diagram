import { Handle, Position } from '@xyflow/react'

// One node component for every shape. Shape = data.kind:
// start | end | process | decision | data | note
export default function ShapeNode({ data }) {
  const { label, sub, kind, w, h, dir } = data
  const tpos = dir === 'TB' ? Position.Top : Position.Left
  const spos = dir === 'TB' ? Position.Bottom : Position.Right

  return (
    <div className={`shape shape-${kind}`} style={{ width: w, height: h }}>
      {kind === 'decision' && (
        <svg className="bg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon points="50,1 99,50 50,99 1,50" />
        </svg>
      )}
      {kind === 'data' && (
        <svg className="bg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M1,14 C1,2 99,2 99,14 L99,86 C99,98 1,98 1,86 Z" />
          <path d="M1,14 C1,26 99,26 99,14" fill="none" />
        </svg>
      )}
      <div className="text">
        <div className="label">{label}</div>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      <Handle type="target" position={tpos} className="handle" />
      <Handle type="source" position={spos} className="handle" />
    </div>
  )
}
