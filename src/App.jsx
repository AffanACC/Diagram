import { useCallback, useMemo } from 'react'
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
import { buildGraph } from './layout.js'

const nodeTypes = { shape: ShapeNode }

// The diagram is a JSON spec embedded in the page by scripts/make.mjs.
function readSpec() {
  try {
    return JSON.parse(document.getElementById('diagram-data').textContent)
  } catch (err) {
    console.error('Could not read diagram data', err)
    return { title: 'Could not read diagram data', nodes: [], edges: [] }
  }
}

function Flow() {
  const spec = useMemo(readSpec, [])
  const graph = useMemo(() => buildGraph(spec), [spec])
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)
  const [edges, , onEdgesChange] = useEdgesState(graph.edges)
  const { fitView } = useReactFlow()

  const resetLayout = useCallback(() => {
    setNodes(buildGraph(spec).nodes)
    requestAnimationFrame(() => fitView({ padding: 0.15, duration: 300 }))
  }, [spec, setNodes, fitView])

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
      colorMode="system"
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} size={1.2} color="var(--border)" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor="var(--border)" maskColor="rgba(120,130,145,0.15)" />
      <Panel position="top-left">
        <div className="hud">
          <h1>{spec.title || 'Diagram'}</h1>
          {spec.description ? <p>{spec.description}</p> : null}
          {graph.problems.length > 0 && (
            <div className="warn">
              {graph.problems.map((p) => (
                <div key={p}>⚠ {p}</div>
              ))}
            </div>
          )}
        </div>
      </Panel>
      <Panel position="top-right">
        <button className="btn" onClick={resetLayout}>
          Reset layout
        </button>
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
