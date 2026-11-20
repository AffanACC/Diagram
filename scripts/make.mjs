// Usage:  node scripts/make.mjs [diagrams/foo.json ...]
// With no arguments, builds every diagrams/*.json -> out/<name>.html.
// Injects the JSON spec into the prebuilt viewer (template/index.html). No bundler,
// no network, no rebuild of the viewer.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const templatePath = path.join(root, 'template', 'index.html')
const diagramsDir = path.join(root, 'diagrams')
const outDir = path.join(root, 'out')

if (!fs.existsSync(templatePath)) {
  console.error('Viewer template missing. Run: pnpm install && pnpm run build:viewer')
  process.exit(1)
}
const template = fs.readFileSync(templatePath, 'utf8')
const DATA_TAG = /(<script id="diagram-data" type="application\/json">)[\s\S]*?(<\/script>)/
if (!DATA_TAG.test(template)) {
  console.error('template/index.html has no <script id="diagram-data"> tag. Rebuild the viewer.')
  process.exit(1)
}

const args = process.argv.slice(2)
const files = args.length
  ? args.map((a) => path.resolve(a))
  : fs
      .readdirSync(diagramsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(diagramsDir, f))

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
fs.mkdirSync(outDir, { recursive: true })
let failed = false

for (const file of files) {
  const name = path.basename(file, '.json')
  let spec
  try {
    spec = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''))
  } catch (err) {
    console.error(`✗ ${name}: invalid JSON - ${err.message}`)
    failed = true
    continue
  }

  const nodes = Array.isArray(spec.nodes) ? spec.nodes : []
  const edges = Array.isArray(spec.edges) ? spec.edges : []
  const ids = new Set()
  const warnings = []
  for (const n of nodes) {
    if (!n.id) warnings.push('a node has no id')
    else if (ids.has(n.id)) warnings.push(`duplicate node id "${n.id}"`)
    ids.add(n.id)
  }
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) warnings.push(`edge ${e.from} -> ${e.to} references a missing node`)
  }

  // "<" is escaped so nothing in the data can close the script tag early.
  const json = JSON.stringify(spec).replace(/</g, '\\u003c')
  let html = template.replace(DATA_TAG, (_, open, close) => open + json + close)
  html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(spec.title || name)}</title>`)

  const out = path.join(outDir, `${name}.html`)
  fs.writeFileSync(out, html)
  console.log(`✓ ${path.relative(root, out)}  (${nodes.length} nodes, ${edges.length} edges)`)
  warnings.forEach((w) => console.warn(`  ⚠ ${w}`))
}
process.exit(failed ? 1 : 0)
