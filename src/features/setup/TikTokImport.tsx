import { useId, useRef, useState } from 'react'

export function TikTokImport({ onImport, disabled }: {
  onImport: (text: string) => Promise<void>
  disabled: boolean
}) {
  const hintId = useId()
  const [text, setText] = useState('')
  const [error, setError] = useState<string>()
  const pending = useRef(false)
  return (
    <details className="ss-tiktok-import">
      <summary>Add TikTok links</summary>
      <label className="ss-field">
        <span>TikTok video URLs</span>
        <textarea
          value={text}
          onChange={(event) => { setText(event.target.value); setError(undefined) }}
          rows={4}
          placeholder="https://www.tiktok.com/@creator/video/…"
          aria-describedby={hintId}
          aria-invalid={Boolean(error)}
          disabled={disabled}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <p className="ss-field-hint" id={hintId}>
        One full video URL per line. For short share links, open TikTok in your browser and copy the full video URL.
        Videos play online through TikTok; exports contain links, not video files.
      </p>
      {error ? <p className="ss-tiktok-import__error" role="alert">{error}</p> : null}
      <button
        className="ss-button ss-button--primary"
        type="button"
        disabled={disabled || !text.trim()}
        onClick={async () => {
          if (pending.current) return
          pending.current = true
          setError(undefined)
          try { await onImport(text); setText('') }
          catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add TikTok links. Try again.') }
          finally { pending.current = false }
        }}
      >Add TikTok videos</button>
    </details>
  )
}
