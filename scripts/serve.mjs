// Tiny static server for previewing out/*.html (127.0.0.1 only). Not needed to
// use the diagrams: they also open by double-clicking the .html file.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out')
const port = Number(process.env.PORT) || 4173

http
  .createServer((req, res) => {
    const name = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'sample.html'
    const file = path.resolve(root, name)
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('Not found')
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(fs.readFileSync(file))
  })
  .listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`))
