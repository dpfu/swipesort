import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Category, SwipeDirection } from '../../domain/types'
import type { PresentedMedia, SwipeCommit } from '../types'
import { SwipeCard, type SwipeCardHandle } from './SwipeCard'
import './sort-screen.css'

export type SortScreenProps = {
  categories: [Category, Category]
  current?: PresentedMedia
  index: number
  total: number
  canUndo: boolean
  isLoadingCurrent?: boolean
  isCurrentMissing?: boolean
  onAssign: (commit: SwipeCommit) => void | Promise<void>
  onUndo: () => void
  onExit?: () => void
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.matches('input, textarea, select, [contenteditable="true"]')
}

export function SortScreen({
  categories,
  current,
  index,
  total,
  canUndo,
  isLoadingCurrent = false,
  isCurrentMissing = false,
  onAssign,
  onUndo,
  onExit,
}: SortScreenProps) {
  const cardRef = useRef<SwipeCardHandle>(null)
  const completionButtonRef = useRef<HTMLButtonElement>(null)
  const isCommittingRef = useRef(false)
  const latestPresentationRef = useRef({ current, index })
  latestPresentationRef.current = { current, index }
  const [isCommitting, setIsCommitting] = useState(false)
  const [presentation, setPresentation] = useState({ current, index })
  const leftCategory = categories.find((category) => category.direction === 'left') ?? categories[0]
  const rightCategory = categories.find((category) => category.direction === 'right') ?? categories[1]

  function assign(direction: SwipeDirection, input: 'button' | 'keyboard') {
    if (isCommittingRef.current) return
    cardRef.current?.swipe(direction, input)
  }

  function handleCommit(commit: SwipeCommit) {
    isCommittingRef.current = true
    setPresentation({ current, index })
    setIsCommitting(true)
    return onAssign(commit)
  }

  function handleSettled() {
    isCommittingRef.current = false
    setPresentation(latestPresentationRef.current)
    setIsCommitting(false)
  }

  function handleCommitFailed() {
    isCommittingRef.current = false
    setIsCommitting(false)
  }

  function undo() {
    if (!isCommittingRef.current) onUndo()
  }

  function exit() {
    if (!isCommittingRef.current) onExit?.()
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isTypingTarget(event.target)) return

      if (event.key === 'ArrowLeft' && current) {
        event.preventDefault()
        assign('left', 'keyboard')
      } else if (event.key === 'ArrowRight' && current) {
        event.preventDefault()
        assign('right', 'keyboard')
      } else if ((event.key === 'z' || event.key === 'Z') && canUndo) {
        event.preventDefault()
        undo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  const displayedCurrent = isCommitting ? presentation.current : current
  const displayedIndex = isCommitting ? presentation.index : index
  const isComplete = !displayedCurrent && !isLoadingCurrent && !isCurrentMissing

  useEffect(() => {
    if (isComplete) completionButtonRef.current?.focus()
  }, [isComplete])

  if (!displayedCurrent) {
    if (isLoadingCurrent || isCurrentMissing) {
      return (
        <main
          className="ss-sort ss-sort--complete"
          aria-labelledby="sort-media-status-title"
          aria-live="polite"
        >
          <div className="ss-sort-complete">
            <p className="ss-eyebrow">
              {isLoadingCurrent ? 'Loading card' : 'Card unavailable'}
            </p>
            <h1 id="sort-media-status-title">
              {isLoadingCurrent
                ? 'Loading this card…'
                : 'This card is unavailable.'}
            </h1>
            <p>
              {isLoadingCurrent
                ? 'Loading its media from this device.'
                : 'The sort is saved, but its local media file is missing.'}
            </p>
            {isCurrentMissing && onExit ? (
              <button
                className="ss-button ss-button--primary"
                type="button"
                onClick={onExit}
              >
                Back to setup
              </button>
            ) : null}
          </div>
        </main>
      )
    }
    return (
      <main
        className="ss-sort ss-sort--complete"
        aria-labelledby="sort-complete-title"
        aria-live="polite"
      >
        <div className="ss-sort-complete">
          <p className="ss-eyebrow">Sort complete</p>
          <h1 id="sort-complete-title">Every card has a place.</h1>
          <p>{total} {total === 1 ? 'card' : 'cards'} sorted. Review the result.</p>
          {onExit ? (
            <button
              ref={completionButtonRef}
              className="ss-button ss-button--primary"
              type="button"
              onClick={onExit}
            >
              Review result
            </button>
          ) : null}
        </div>
      </main>
    )
  }

  const completed = Math.min(displayedIndex, total)
  const progress = total > 0 ? (completed / total) * 100 : 0

  return (
    <main className="ss-sort" aria-labelledby="sort-title">
      <header className="ss-sort__header">
        <div>
          <p className="ss-eyebrow">Sort</p>
          <h1 id="sort-title" className="ss-visually-hidden">
            Choose a category for each card
          </h1>
        </div>
        <p className="ss-sort__count" aria-live="polite">
          <span>{completed}</span> of {total} sorted
        </p>
      </header>

      <div
        className="ss-sort__progress"
        role="progressbar"
        aria-label="Cards sorted"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-valuetext={`${completed} of ${total} ${total === 1 ? 'card' : 'cards'} sorted`}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      <SwipeCard
        key={displayedCurrent.item.id}
        ref={cardRef}
        media={displayedCurrent}
        categories={categories}
        onCommit={handleCommit}
        onSettled={handleSettled}
        onCommitFailed={handleCommitFailed}
        disabled={isCommitting}
      />

      <div className="ss-sort__controls" aria-label="Sorting choices">
        <button
          className="ss-choice-button ss-choice-button--left"
          type="button"
          onClick={() => assign('left', 'button')}
          disabled={isCommitting}
          style={{ '--category-color': leftCategory.color } as CSSProperties}
          aria-label={`Sort into ${leftCategory.name}`}
        >
          <span aria-hidden="true">←</span>
          <strong>{leftCategory.name}</strong>
        </button>
        <button
          className="ss-choice-button ss-choice-button--right"
          type="button"
          onClick={() => assign('right', 'button')}
          disabled={isCommitting}
          style={{ '--category-color': rightCategory.color } as CSSProperties}
          aria-label={`Sort into ${rightCategory.name}`}
        >
          <strong>{rightCategory.name}</strong>
          <span aria-hidden="true">→</span>
        </button>
      </div>

      <footer className="ss-sort__footer">
        <button type="button" className="ss-text-action" onClick={undo} disabled={!canUndo || isCommitting}>
          Undo last
        </button>
        <p>Swipe, choose a category, or press ← →</p>
        {onExit ? (
          <button type="button" className="ss-text-action" onClick={exit} disabled={isCommitting}>
            Back to setup
          </button>
        ) : <span />}
      </footer>
    </main>
  )
}
