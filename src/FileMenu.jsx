import { useCallback, useEffect, useRef, useState } from 'react'
import { addFile, currentPath, loadFiles, nameOf, removeFile, sameFile, saveFiles, toFileUrl } from './files.js'

const isHttp = location.protocol === 'http:' || location.protocol === 'https:'

// Top-left dropdown: shows the current diagram and lets you switch to another one.
// - Opened from the local server (http://localhost:47831): lists the diagrams the server has.
// - Opened from disk (file://): lists saved file paths (paths only), "Add existing file…".
// "+ New file" starts a blank diagram in both cases.
export default function FileMenu({ title, problems, hasNodes, onNew }) {
  const [open, setOpen] = useState(false)
  const [showProblems, setShowProblems] = useState(false)
  const [files, setFiles] = useState(loadFiles)
  const [served, setServed] = useState(null) // null = no server list available
  const [mode, setMode] = useState(null) // null | 'new' | 'path'
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [canSave, setCanSave] = useState(true)
  const ref = useRef(null)
  const inputRef = useRef(null)
  const here = currentPath()
  const hereListed = here && files.some((f) => sameFile(f.path, here))
  const hereFile = isHttp ? decodeURIComponent(location.pathname).replace(/^\/+/, '') : ''

  const stopForm = useCallback(() => {
    setMode(null)
    setText('')
    setError('')
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setShowProblems(false)
    stopForm()
  }, [stopForm])

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

  // When served over http, ask the server which diagrams exist (refreshed each time the
  // menu opens). If there is no such endpoint, fall back to the saved-paths list.
  useEffect(() => {
    if (!isHttp) return
    let cancelled = false
    fetch('/__diagrams.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((list) => !cancelled && Array.isArray(list) && setServed(list))
      .catch(() => !cancelled && setServed(null))
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (mode && inputRef.current) inputRef.current.focus()
  }, [mode])

  const commit = (next) => {
    setFiles(next)
    setCanSave(saveFiles(next))
  }

  const addPath = (input) => {
    const res = addFile(files, input)
    if (res.error) return setError(res.error)
    commit(res.list)
    stopForm()
  }

  const createBlank = () => {
    if (hasNodes && !window.confirm('Start a blank diagram? Unsaved layout changes to the open one are lost. The file on disk is not changed.')) {
      return
    }
    onNew(text)
    close()
  }

  const openForm = (m) => {
    setMode(m)
    setText(m === 'new' ? 'Untitled diagram' : '')
    setError('')
  }

  const fmt = (iso) =>
    new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

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
          {served ? (
            <>
              {served.map((d) => {
                const current = d.file === hereFile
                return (
                  <div key={d.file} className={`row ${current ? 'current' : ''}`}>
                    <a className="rlink" href={`/${encodeURIComponent(d.file)}`} title={d.file}>
                      <span className="rname">
                        {d.title} {current ? <span className="badge">open</span> : null}
                      </span>
                      <span className="rpath">
                        {d.file} · {fmt(d.modified)}
                      </span>
                    </a>
                  </div>
                )
              })}
              {served.length === 0 ? <div className="menu-empty">No diagrams yet.</div> : null}
            </>
          ) : (
            <>
              {here && !hereListed ? (
                <div className="row current">
                  <div className="rlink">
                    <span className="rname">
                      {nameOf(here)} <span className="badge">this file</span>
                    </span>
                    <span className="rpath">{here}</span>
                  </div>
                  <button className="save" onClick={() => addPath(here)}>
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
                <div className="menu-empty">No saved files yet.</div>
              ) : null}
            </>
          )}

          <div className="sep" />

          {mode ? (
            <form
              className="add-row"
              onSubmit={(e) => {
                e.preventDefault()
                if (mode === 'new') createBlank()
                else if (text.trim()) addPath(text)
              }}
            >
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setError('')
                }}
                placeholder={mode === 'new' ? 'Name of the new diagram' : "Paste the file's full path"}
                spellCheck={false}
              />
              <button className="btn" type="submit">
                {mode === 'new' ? 'Create' : 'Add'}
              </button>
              <button className="btn" type="button" onClick={stopForm}>
                Cancel
              </button>
            </form>
          ) : (
            <>
              <button className="new-btn" onClick={() => openForm('new')}>
                + New file
              </button>
              {!served ? (
                <button className="new-btn plain" onClick={() => openForm('path')}>
                  Add existing file…
                </button>
              ) : null}
            </>
          )}
          {mode === 'path' && !error ? (
            <div className="menu-hint">Tip: in File Explorer, right-click the file and choose “Copy as path”.</div>
          ) : null}
          {mode === 'new' ? (
            <div className="menu-hint">Starts an empty canvas. Press “Download HTML” to save it as a file.</div>
          ) : null}
          {error ? <div className="menu-error">{error}</div> : null}
          {!canSave ? <div className="menu-error">This browser would not save the list.</div> : null}
        </div>
      )}
    </div>
  )
}
