// Always-on local server for the diagrams in out/.
//   node scripts/serve.mjs            -> http://localhost:47831
// Read-only: it never writes files. Listens on 127.0.0.1 only, serves only out/*.html plus a
// home page and a JSON list, and sends a Content-Security-Policy that blocks any external
// request from the pages (client data stays on this laptop). Diagrams also still work when
// opened straight from disk without this server.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out')
const PORT = Number(process.env.PORT) || 47831
const HOST = '127.0.0.1'
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`])
const FILE_RE = /^[\w .()\-]+\.html$/i

const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

const decodeEntities = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function titleOf(file) {
  try {
    const fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(8192)
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    fs.closeSync(fd)
    const m = /<title>([\s\S]*?)<\/title>/i.exec(buf.toString('utf8', 0, n))
    return m ? decodeEntities(m[1]).trim() : ''
  } catch {
    return ''
  }
}

function listDiagrams() {
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root)
    .filter((f) => FILE_RE.test(f))
    .map((f) => {
      const full = path.join(root, f)
      const st = fs.statSync(full)
      return { file: f, title: titleOf(full) || f.replace(/\.html$/i, ''), modified: st.mtime.toISOString(), mtime: st.mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
    .map(({ mtime, ...rest }) => rest)
}

const fmt = (iso) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function indexPage(items) {
  const rows = items.length
    ? items
        .map(
          (d) => `<a class="row" href="/${encodeURIComponent(d.file)}"><span class="t">${escapeHtml(d.title)}</span><span class="m">${escapeHtml(d.file)} · ${fmt(d.modified)}</span></a>`,
        )
        .join('')
    : '<p class="empty">No diagrams yet. Ask Claude to build one.</p>'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Diagrams</title><style>
:root{color-scheme:light}body{margin:0;background:#f4f6f9;color:#1b2430;font-family:'Segoe UI',system-ui,sans-serif}
main{max-width:640px;margin:8vh auto;padding:0 20px}h1{font-size:20px;margin:0 0 16px}
.row{display:flex;flex-direction:column;gap:2px;background:#fff;border:1px solid #c5cfdb;border-radius:10px;padding:12px 14px;margin-bottom:8px;text-decoration:none;color:inherit;box-shadow:0 1px 2px rgba(20,30,45,.08)}
.row:hover{border-color:#1f6f8b}.t{font-weight:600}.m{font-size:12px;color:#5b6776}.empty{color:#5b6776}
</style></head><body><main><h1>Diagrams</h1>${rows}</main></body></html>`
}

const server = http.createServer((req, res) => {
  const send = (status, type, body, extra = {}) => {
    res.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': CSP,
      ...extra,
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  }

  // Refuse other hostnames (DNS-rebinding protection) and anything but reads.
  if (!ALLOWED_HOSTS.has((req.headers.host || '').toLowerCase())) return send(403, 'text/plain', 'Forbidden')
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'Method not allowed', { Allow: 'GET, HEAD' })

  const pathname = decodeURIComponent((req.url || '/').split('?')[0])
  if (pathname === '/') return send(200, 'text/html; charset=utf-8', indexPage(listDiagrams()))
  if (pathname === '/__diagrams.json') return send(200, 'application/json; charset=utf-8', JSON.stringify(listDiagrams()))
  if (pathname === '/favicon.ico') return send(204, 'image/x-icon', '')

  const name = pathname.replace(/^\/+/, '')
  const file = path.resolve(root, name)
  if (!FILE_RE.test(name) || !file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(404, 'text/plain', 'Not found')
  }
  send(200, 'text/html; charset=utf-8', fs.readFileSync(file))
})

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is already in use (is the server already running?)` : err.message)
  process.exit(1)
})
server.listen(PORT, HOST, () => console.log(`Diagrams: http://localhost:${PORT}/  (serving ${root})`))
