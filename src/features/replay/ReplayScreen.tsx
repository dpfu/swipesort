import type { CSSProperties } from 'react'
import type { Category } from '../../domain/types'
import { MediaView } from '../shared/MediaView'
import type { ReplayFrame } from '../types'
import './replay-screen.css'

export type ReplayScreenProps = {
  categories: [Category, Category]
  frames: ReplayFrame[]
  stepIndex: number
  isPlaying: boolean
  onStepChange: (stepIndex: number) => void
  onTogglePlaying: () => void
  onExit?: () => void
}

function formatTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 100) / 10)
  return `${totalSeconds.toFixed(1)}s`
}

export function ReplayScreen({
  categories,
  frames,
  stepIndex,
  isPlaying,
  onStepChange,
  onTogglePlaying,
  onExit,
}: ReplayScreenProps) {
  const safeStep = Math.max(0, Math.min(stepIndex, frames.length))
  const currentFrame = frames.length === 0
    ? undefined
    : frames[Math.max(0, Math.min(safeStep - 1, frames.length - 1))]
  const currentCategory = safeStep > 0 && currentFrame
    ? categories.find((category) => category.id === currentFrame.categoryId)
    : undefined

  if (!currentFrame) {
    return (
      <main className="ss-replay ss-replay--empty" aria-labelledby="replay-empty-title">
        <div>
          <p className="ss-eyebrow">Replay</p>
          <h1 id="replay-empty-title">No choices to replay.</h1>
          {onExit ? <button className="ss-button ss-button--primary" type="button" onClick={onExit}>Back to result</button> : null}
        </div>
      </main>
    )
  }

  return (
    <main className="ss-replay" aria-labelledby="replay-title">
      <header className="ss-replay__header">
        <div>
          <p className="ss-eyebrow">Original sort</p>
          <h1 id="replay-title">Replay</h1>
        </div>
        <p>Original choices only. Result corrections aren’t included.</p>
      </header>

      <section className="ss-replay-stage" aria-live="polite" aria-atomic="true">
        <div className="ss-replay-destinations" aria-hidden="true">
          {categories.map((category) => (
            <div
              key={category.id}
              className={currentCategory?.id === category.id ? 'is-active' : undefined}
              style={{ '--category-color': category.color } as CSSProperties}
            >
              <span>{category.direction}</span>
              <strong>{category.name}</strong>
            </div>
          ))}
        </div>

        <article
          className={`ss-replay-card${currentFrame && safeStep > 0 ? ` ss-replay-card--${currentFrame.direction}` : ''}`}
          style={currentCategory ? { '--category-color': currentCategory.color } as CSSProperties : undefined}
        >
          <MediaView
            key={`${currentFrame.item.item.id}-${safeStep}-${isPlaying ? 'playing' : 'paused'}`}
            media={currentFrame.item}
            variant="replay"
            playbackActive={isPlaying}
          />
          <footer>
            <strong>{currentFrame.item.item.title}</strong>
            <span>
              {safeStep === 0 || !currentCategory
                ? 'Ready to replay'
                : `Chose ${currentCategory.name} · ${formatTime(currentFrame.atMs)} after start`}
            </span>
            {safeStep > 0 && currentFrame.undone ? <em>Undone later</em> : null}
          </footer>
        </article>
      </section>

      <section className="ss-replay-controls" aria-label="Replay controls">
        <div>
          <button
            type="button"
            onClick={() => onStepChange(Math.max(0, safeStep - 1))}
            disabled={safeStep === 0}
            aria-label="Previous choice"
          >
            ←
          </button>
          <button
            className="ss-replay-play"
            type="button"
            onClick={onTogglePlaying}
            aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={() => onStepChange(Math.min(frames.length, safeStep + 1))}
            disabled={safeStep === frames.length}
            aria-label="Next choice"
          >
            →
          </button>
        </div>
        <label>
          <span className="ss-visually-hidden">Replay position</span>
          <input
            type="range"
            min={0}
            max={frames.length}
            step={1}
            value={safeStep}
            onChange={(event) => onStepChange(Number(event.target.value))}
          />
        </label>
        <p>
          {safeStep === 0
            ? `Ready · ${frames.length} ${frames.length === 1 ? 'choice' : 'choices'}`
            : <>Choice <strong>{safeStep}</strong> of {frames.length}</>}
        </p>
      </section>

      {onExit ? (
        <footer className="ss-replay__footer">
          <button className="ss-text-action" type="button" onClick={onExit}>Back to result</button>
        </footer>
      ) : null}
    </main>
  )
}
