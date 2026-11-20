import { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './style.css'
import ShapeNode from './ShapeNode.jsx'
import LaneNode from './LaneNode.jsx'
import RoutedEdge from './RoutedEdge.jsx'
import FileMenu from './FileMenu.jsx'
import { readSpec } from './spec.js'
import ZoneNode from './ZoneNode.jsx'
import FloatingEdge from './FloatingEdge.jsx'
import { measureNodes, buildGraph, routeFor, refreshZones, snapToGrid } from './layout.js'

const nodeTypes = { shape: ShapeNode, lane: LaneNode, zone: ZoneNode }
const edgeTypes = { routed: RoutedEdge, floating: FloatingEdge }

function Flow() {
  const [spec, setSpec] = useState(readSpec)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [sizes, setSizes] = useState(null)
  const [layoutProblems, setLayoutProblems] = useState([])
  const { fitView, getNodes, getEdges } = useReactFlow()

  // After dragging a node, re-pick which sides its connections use.
  const onNodeDragStop = useCallback(() => {
    const r = routeFor(spec, getNodes(), getEdges())
    setNodes(refreshZones(r.nodes))
    setEdges(r.edges)
  }, [getNodes, getEdges, spec, setNodes, setEdges])

  const refit = useCallback(
    () => requestAnimationFrame(() => requestAnimationFrame(() => fitView({ padding: '8%', duration: 250 }))),
    [fitView],
  )

  // Measure every node's real HTML once, lay them out, then show them.
  useEffect(() => {
    let cancelled = false
    measureNodes(spec.nodes).then((s) => {
      if (cancelled) return
      const g = buildGraph(spec, s)
      setSizes(s)
      setLayoutProblems(g.problems)
      setNodes(g.nodes)
      setEdges(g.edges)
      refit()
    })
    return () => {
      cancelled = true
    }
  }, [spec, setNodes, setEdges, refit])

  useEffect(() => {
    document.title = spec.title
  }, [spec.title])
  // "+ New file": swap the page's diagram source for an empty one. Nothing on disk changes;
  // "Download HTML" then saves it as a new file.
  const newBlank = useCallback((name) => {
    const t = (name || '').trim() || 'Untitled diagram'
    const esc = t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    document.getElementById('diagram-source').innerHTML = `<diagram title="${esc}" direction="LR"></diagram>`
    setSpec(readSpec())
  }, [])

  const resetLayout = useCallback(() => {
    if (!sizes) return
    const g = buildGraph(spec, sizes, { useManual: false })
    setNodes(g.nodes)
    setEdges(g.edges)
    refit()
  }, [spec, sizes, setNodes, setEdges, refit])

  // Saves a copy of this same page, with the current node positions written back into the
  // source (x/y attributes), so a layout you arranged by dragging is kept.
  const downloadHtml = useCallback(() => {
    const clone = document.documentElement.cloneNode(true)
    const root = clone.querySelector('#root')
    if (root) root.innerHTML = ''
    const tpl = clone.querySelector('template#diagram-source')
    // Swimlane layouts decide positions themselves, so only other diagrams get grid cells.
    const cells = spec.lanes.length ? new Map() : snapToGrid(getNodes().filter((n) => n.type === 'shape'), spec.diagramType === 'ontology')
    tpl.content.querySelectorAll('node').forEach((el) => {
      const c = cells.get(el.getAttribute('id'))
      el.removeAttribute('x')
      el.removeAttribute('y')
      if (c) el.setAttribute('at', `${c.col},${c.row}`)
    })
    const html = '<!doctype html>\n' + clone.outerHTML
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const slug = (spec.title || 'diagram').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    a.href = url
    a.download = `${slug || 'diagram'}.html`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [spec, getNodes])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesConnectable={false}
      fitView
      fitViewOptions={{ padding: '8%' }}
      minZoom={0.1}
      maxZoom={2.5}
      colorMode="light"
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} size={1.2} color="var(--border)" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor="var(--border)" maskColor="rgba(120,130,145,0.15)" />
      <Panel position="top-left">
        <FileMenu title={spec.title} problems={[...spec.problems, ...layoutProblems]} hasNodes={spec.nodes.length > 0} onNew={newBlank} />
      </Panel>
      {spec.skeleton && (
        <Panel position="top-center">
          <div className="skeleton-badge">Skeleton: assumed from a short brief, not confirmed</div>
        </Panel>
      )}
      {spec.nodes.length === 0 && (
        <Panel position="top-center" style={{ marginTop: '22vh' }}>
          <div className="blank-hint">
            <strong>Blank diagram</strong>
            <span>Press “Download HTML” to save it as a file, then ask Claude to fill it in.</span>
          </div>
        </Panel>
      )}
      <Panel position="top-right">
        <div className="toolbar">
          <button className="btn" onClick={resetLayout} title="Go back to the automatic layout">
            Reset layout
          </button>
          <button className="btn primary" onClick={downloadHtml} title="Save this diagram as an HTML file, keeping your current layout">
            Download HTML
          </button>
        </div>
      </Panel>
    </ReactFlow>
  )
}

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlowProvider>
        <Flow />
      </ReactFlowProvider>
    </div>
  )
}
