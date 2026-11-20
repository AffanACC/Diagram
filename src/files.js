// The "Files" list: ONLY file paths (plus a display name) are remembered, in this browser's
// localStorage. Diagram content is never stored; clicking a path just opens that file.
const KEY = 'diagram-files-v1'

const clean = (p) => String(p).trim().replace(/^["']+|["']+$/g, '')
const isFileUrl = (p) => /^file:\/\//i.test(p)

// Accepts C:\folder\a.html, \\server\share\a.html, C:/folder/a.html or file:///C:/folder/a.html
// and returns a normalised display path (Windows style).
export function normalisePath(input) {
  let p = clean(input)
  if (isFileUrl(p)) {
    try {
      const u = new URL(p)
      const path = decodeURIComponent(u.pathname)
      p = u.host ? `\\\\${u.host}${path.replace(/\//g, '\\')}` : path.replace(/^\//, '').replace(/\//g, '\\')
    } catch {
      return null
    }
  }
  p = p.replace(/\//g, '\\')
  const drive = /^[A-Za-z]:\\/.test(p)
  const unc = /^\\\\[^\\]+\\[^\\]+/.test(p)
  if (!drive && !unc) return null
  return p
}

export function toFileUrl(path) {
  if (path.startsWith('\\\\')) {
    const [host, ...rest] = path.slice(2).split('\\')
    return `file://${host}/${rest.map(encodeURIComponent).join('/')}`
  }
  const [drive, ...rest] = path.split('\\')
  return `file:///${drive}/${rest.map(encodeURIComponent).join('/')}`
}

export const nameOf = (path) => {
  const base = path.split('\\').pop() || path
  return base.replace(/\.html?$/i, '')
}

const sameFile = (a, b) => a.toLowerCase() === b.toLowerCase()

export function loadFiles() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((f) => f && typeof f.path === 'string') : []
  } catch {
    return []
  }
}

export function saveFiles(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.map(({ path, name }) => ({ path, name }))))
    return true
  } catch {
    return false
  }
}

export function addFile(list, input) {
  const path = normalisePath(input)
  if (!path) {
    return { error: 'Not a full Windows path. Example: C:\\Users\\you\\Tools\\diagram\\out\\my-diagram.html' }
  }
  if (!/\.html?$/i.test(path)) return { error: 'The path should end in .html' }
  if (list.some((f) => sameFile(f.path, path))) return { error: 'That file is already in the list' }
  return { list: [...list, { path, name: nameOf(path) }] }
}

export const removeFile = (list, path) => list.filter((f) => !sameFile(f.path, path))

// The path of the page you are looking at, when it was opened from disk (file://).
export function currentPath() {
  if (location.protocol !== 'file:') return null
  return normalisePath(location.href)
}

export { sameFile }
