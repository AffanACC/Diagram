import { useCallback, useEffect, useState } from 'react'
import { addFile, currentPath, loadFiles, removeFile, sameFile, saveFiles, toFileUrl } from './files.js'

// Dropdown list of diagram files. Remembers paths only; click one to open that file.
export default function FilesPanel() {
  const [files, setFiles] = useState(loadFiles)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [canSave, setCanSave] = useState(true)
  const here = currentPath()

  const commit = useCallback((next) => {
    setFiles(next)
    setCanSave(saveFiles(next))
  }, [])

  // Pick up changes made in another diagram tab.
  useEffect(() => {
    const onStorage = () => setFiles(loadFiles())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const add = (input) => {
    const res = addFile(files, input)
    if (res.error) return setError(res.error)
    setError('')
    setText('')
    commit(res.list)
  }

  const listed = here && files.some((f) => sameFile(f.path, here))

  return (
    <div className="files">
      <div className="files-head">Diagrams</div>

      {files.length === 0 ? (
        <div className="files-empty">
          No files yet. Paste a path below, or open a diagram and press “Add this diagram”.
        </div>
      ) : (
        <ul className="files-list">
          {files.map((f) => {
            const current = here && sameFile(f.path, here)
            return (
              <li key={f.path} className={current ? 'current' : ''}>
                <a href={toFileUrl(f.path)} title={f.path}>
                  <span className="fname">{f.name}</span>
                  <span className="fpath">{f.path}</span>
                </a>
                {current ? <span className="badge">open</span> : null}
                <button
                  className="x"
                  title="Remove from list (the file itself is not touched)"
                  onClick={() => commit(removeFile(files, f.path))}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {here && !listed ? (
        <button className="btn wide" onClick={() => add(here)}>
          + Add this diagram
        </button>
      ) : null}

      <form
        className="files-add"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) add(text)
        }}
      >
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError('')
          }}
          placeholder="Paste a path, e.g. C:\...\diagram.html"
          spellCheck={false}
        />
        <button className="btn" type="submit">
          Add
        </button>
      </form>

      {error ? <div className="files-error">{error}</div> : null}
      {!canSave ? <div className="files-error">This browser would not save the list.</div> : null}
      <div className="files-note">Only paths are saved, in this browser. Diagrams are never copied.</div>
    </div>
  )
}
