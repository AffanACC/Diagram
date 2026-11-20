// Usage:  node scripts/make.mjs [diagrams/foo.html ...]
// With no arguments, builds every diagrams/*.html -> out/<name>.html.
//
// A diagram source is plain HTML:
//   <diagram title=".." direction="LR"> <node id=".." type="card">any HTML</node> <edge from to/> </diagram>
// This script checks it, inlines local images as data: URIs (so the output stays ONE file),
// and injects it into the prebuilt viewer (template/index.html). No bundler, no network.
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
const SOURCE_TAG = /<template id="diagram-source">[\s\S]*?<\/template>/
if (!SOURCE_TAG.test(template)) {
  console.error('template/index.html has no diagram-source template. Rebuild the viewer: pnpm run build:viewer')
  process.exit(1)
}

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}
const MAX_IMAGE_WARN = 1024 * 1024

// Anything that could run code or fetch from the network is refused: client data stays local.
const FORBIDDEN = [
  [/<\s*script\b/i, '<script>'],
  [/<\s*(iframe|object|embed|link|meta|base|form)\b/i, 'iframe/object/embed/link/meta/base/form'],
  [/\son[a-z]+\s*=/i, 'inline event handler (onclick=...)'],
  [/javascript\s*:/i, 'javascript: URL'],
  [/@import/i, 'CSS @import'],
  [/<\/\s*template/i, '</template>'],
  [/\b(?:src|href|poster|srcset|action|data)\s*=\s*["']?\s*(?:https?:)?\/\//i, 'external URL in src/href'],
  [/url\(\s*["']?\s*(?:https?:)?\/\//i, 'external url() in CSS'],
]

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m ? (m[2] ?? m[3] ?? m[4]) : undefined
}

function inlineImages(markup, baseDir, warnings) {
  return markup.replace(/(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2/gi, (all, pre, q, src) => {
    if (/^data:/i.test(src)) return all
    const file = path.resolve(baseDir, decodeURI(src))
    if (!file.startsWith(root + path.sep)) throw new Error(`image outside the project folder: ${src}`)
    if (!fs.existsSync(file)) throw new Error(`image not found: ${src}`)
    const mime = MIME[path.extname(file).toLowerCase()]
    if (!mime) throw new Error(`unsupported image type: ${src} (use png, jpg, gif, webp or svg)`)
    const buf = fs.readFileSync(file)
    if (buf.length > MAX_IMAGE_WARN) {
      warnings.push(`${src} is ${(buf.length / 1048576).toFixed(1)} MB; large images make the HTML big`)
    }
    return `${pre}${q}data:${mime};base64,${buf.toString('base64')}${q}`
  })
}

const args = process.argv.slice(2)
const files = args.length
  ? args.map((a) => path.resolve(a))
  : fs
      .readdirSync(diagramsDir)
      .filter((f) => f.endsWith('.html'))
      .map((f) => path.join(diagramsDir, f))

fs.mkdirSync(outDir, { recursive: true })
let failed = false

for (const file of files) {
  const name = path.basename(file, '.html')
  const warnings = []
  try {
    const src = fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
    const m = /<diagram\b[\s\S]*<\/diagram\s*>/i.exec(src)
    if (!m) throw new Error('no <diagram>...</diagram> element found')
    let markup = m[0]

    for (const [re, label] of FORBIDDEN) {
      if (re.test(markup)) throw new Error(`not allowed in a diagram: ${label}`)
    }

    // <edge .../> is not valid HTML for unknown elements, so close it explicitly.
    markup = markup.replace(/<edge\b([^>]*?)\s*\/>/gi, '<edge$1></edge>')
    markup = inlineImages(markup, path.dirname(file), warnings)

    const ids = []
    const nodeTags = markup.match(/<node\b[^>]*>/gi) || []
    for (const t of nodeTags) {
      const id = attr(t, 'id')
      if (!id) warnings.push('a <node> has no id')
      else if (ids.includes(id)) warnings.push(`duplicate node id "${id}"`)
      else ids.push(id)
    }
    const edgeTags = markup.match(/<edge\b[^>]*>/gi) || []
    for (const t of edgeTags) {
      const from = attr(t, 'from')
      const to = attr(t, 'to')
      if (!ids.includes(from) || !ids.includes(to)) warnings.push(`edge ${from} -> ${to} references a missing node`)
    }

    const title = attr(/<diagram\b[^>]*>/i.exec(markup)[0], 'title') || name
    let html = template.replace(SOURCE_TAG, () => `<template id="diagram-source">${markup}</template>`)
    html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(title)}</title>`)

    const out = path.join(outDir, `${name}.html`)
    fs.writeFileSync(out, html)
    const kb = Math.round(fs.statSync(out).size / 1024)
    console.log(`✓ ${path.relative(root, out)}  (${nodeTags.length} nodes, ${edgeTags.length} edges, ${kb} KB)`)
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`)
    failed = true
  }
  warnings.forEach((w) => console.warn(`  ⚠ ${w}`))
}
process.exit(failed ? 1 : 0)
