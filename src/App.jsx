import { useCallback, useEffect, useMemo, useState } from 'react'
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
import FileMenu from './FileMenu.jsx'
import { readSpec } from './spec.js'
import { measureNodes, buildGraph } from './layout.js'

const nodeTypes = { shape: ShapeNode }

function Flow() {
  const spec = useMemo(readSpec, [])
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [sizes, setSizes] = useState(null)
  const { fitView, getNodes } = useReactFlow()

  const refit = useCallback(
    () => requestAnimationFrame(() => requestAnimationFrame(() => fitView({ padding: 0.15, duration: 250 }))),
    [fitView],
  )

  // Measure every node's real HTML once, lay them out, then show them.
  useEffect(() => {
    let cancelled = false
    measureNodes(spec.nodes).then((s) => {
      if (cancelled) return
      const g = buildGraph(spec, s)
      setSizes(s)
      setNodes(g.nodes)
      setEdges(g.edges)
      refit()
    })
    return () => {
      cancelled = true
    }
  }, [spec, setNodes, setEdges, refit])

  const resetLayout = useCallback(() => {
    if (!sizes) return
    setNodes(buildGraph(spec, sizes, { useManual: false }).nodes)
    refit()
  }, [spec, sizes, setNodes, refit])

  // Saves a copy of this same page, with the current node positions written back into the
  // source (x/y attributes), so a layout you arranged by dragging is kept.
  const downloadHtml = useCallback(() => {
    const clone = document.documentElement.cloneNode(true)
    const root = clone.querySelector('#root')
    if (root) root.innerHTML = ''
    const tpl = clone.querySelector('template#diagram-source')
    const pos = new Map(getNodes().map((n) => [n.id, n.position]))
    tpl.content.querySelectorAll('node').forEach((el) => {
      const p = pos.get(el.getAttribute('id'))
      if (p) {
        el.setAttribute('x', String(Math.round(p.x)))
        el.setAttribute('y', String(Math.round(p.y)))
      }
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
      nodeTypes={nodeTypes}
      nodesConnectable={false}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.1}
      maxZoom={2.5}
      colorMode="light"
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} size={1.2} color="var(--border)" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor="var(--border)" maskColor="rgba(120,130,145,0.15)" />
      <Panel position="top-left">
        <FileMenu title={spec.title} problems={spec.problems} />
      </Panel>
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
