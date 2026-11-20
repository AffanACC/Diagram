// A swimlane band (or the pool strip). Drawn behind the shapes; not interactive.
export default function LaneNode({ data }) {
  const { label, w, h, odd, pool } = data
  return (
    <div className={`lane${odd ? ' odd' : ''}${pool ? ' pool' : ''}`} style={{ width: w, height: h }}>
      <div className="lane-label">{label}</div>
    </div>
  )
}
