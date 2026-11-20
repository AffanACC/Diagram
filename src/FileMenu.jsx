import { useCallback, useEffect, useRef, useState } from 'react'
import { addFile, currentPath, loadFiles, nameOf, removeFile, sameFile, saveFiles, toFileUrl } from './files.js'

// Top-left dropdown: shows the current diagram, lists your saved diagram files (paths only),
// and has "+ New file" to add another path. Clicking a file opens it.
export default function FileMenu({ title, problems }) {
  const [open, setOpen] = useState(false)
  const [showProblems, setShowProblems] = useState(false)
  const [files, setFiles] = useState(loadFiles)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [canSave, setCanSave] = useState(true)
  const ref = useRef(null)
  const inputRef = useRef(null)
  const here = currentPath()
  const hereListed = here && files.some((f) => sameFile(f.path, here))

  const close = useCallback(() => {
    setOpen(false)
    setShowProblems(false)
    setAdding(false)
    setText('')
    setError('')
  }, [])

  // Close on outside click or Escape; pick up list changes made in another diagram tab.
  useEffect(() => {
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && close()
    const onKey = (e) => e.key === 'Escape' && close()
    const onStorage = () => setFiles(loadFiles())
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('storage', onStorage)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('storage', onStorage)
    }
  }, [close])

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus()
  }, [adding])

  const commit = (next) => {
    setFiles(next)
    setCanSave(saveFiles(next))
  }

  const add = (input) => {
    const res = addFile(files, input)
    if (res.error) return setError(res.error)
    commit(res.list)
    setAdding(false)
    setText('')
    setError('')
  }

  return (
    <div className="menu" ref={ref}>
      <div className="menu-bar">
        <button
          className="menu-btn"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => {
            setShowProblems(false)
            setOpen((o) => !o)
          }}
        >
          <span className="menu-title">{title}</span>
          <span className="chev">▾</span>
        </button>
        {problems.length > 0 && (
          <button
            className="pill-warn"
            title={problems.join('\n')}
            onClick={() => {
              setOpen(false)
              setShowProblems((s) => !s)
            }}
          >
            ⚠ {problems.length}
          </button>
        )}
      </div>

      {showProblems && (
        <div className="menu-pop warn-pop">
          {problems.map((p) => (
            <div key={p} className="problem">
              ⚠ {p}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="menu-pop">
          {here && !hereListed ? (
            <div className="row current">
              <div className="rlink">
                <span className="rname">
                  {nameOf(here)} <span className="badge">this file</span>
                </span>
                <span className="rpath">{here}</span>
              </div>
              <button className="save" onClick={() => add(here)}>
                Save to list
              </button>
            </div>
          ) : null}

          {files.map((f) => {
            const current = here && sameFile(f.path, here)
            return (
              <div key={f.path} className={`row ${current ? 'current' : ''}`}>
                <a className="rlink" href={toFileUrl(f.path)} title={f.path}>
                  <span className="rname">
                    {f.name} {current ? <span className="badge">open</span> : null}
                  </span>
                  <span className="rpath">{f.path}</span>
                </a>
                <button
                  className="x"
                  title="Remove from the list (the file itself is not touched)"
                  onClick={() => commit(removeFile(files, f.path))}
                >
                  ×
                </button>
              </div>
            )
          })}

          {files.length === 0 && !(here && !hereListed) ? (
            <div className="menu-empty">No files yet.</div>
          ) : null}

          <div className="sep" />

          {adding ? (
            <form
              className="add-row"
              onSubmit={(e) => {
                e.preventDefault()
                if (text.trim()) add(text)
              }}
            >
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setError('')
                }}
                placeholder="Paste the file's full path"
                spellCheck={false}
              />
              <button className="btn" type="submit">
                Add
              </button>
              <button className="btn" type="button" onClick={() => (setAdding(false), setText(''), setError(''))}>
                Cancel
              </button>
            </form>
          ) : (
            <button className="new-btn" onClick={() => setAdding(true)}>
              + New file
            </button>
          )}
          {adding && !error ? <div className="menu-hint">Tip: in File Explorer, right-click the file and choose “Copy as path”.</div> : null}
          {error ? <div className="menu-error">{error}</div> : null}
          {!canSave ? <div className="menu-error">This browser would not save the list.</div> : null}
        </div>
      )}
    </div>
  )
}
