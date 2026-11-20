// A zone: a labelled box drawn behind a group of nodes. Not interactive; it follows its members.
export default function ZoneNode({ data }) {
  return (
    <div className="zone" style={{ width: data.w, height: data.h }}>
      <div className="zone-label">{data.label}</div>
    </div>
  )
}
