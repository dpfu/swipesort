import { useId, useRef, type ChangeEvent } from 'react'
import type { Category } from '../../domain/types'
import { MediaView } from '../shared/MediaView'
import type { PresentedMedia } from '../types'
import './setup-screen.css'

export type SetupScreenProps = {
  projectName: string
  categories: [Category, Category]
  items: PresentedMedia[]
  onProjectNameChange: (name: string) => void
  onCategoryNameChange: (categoryId: string, name: string) => void
  onFilesSelected: (files: File[]) => void
  onRemoveItem: (itemId: string) => void
  onMoveItem: (itemId: string, direction: 'up' | 'down') => void
  onStart: () => void
  onLoadDemo?: () => void
  startLabel?: string
  isImporting?: boolean
  error?: string
}

const acceptedMedia = 'image/*,video/*'

export function SetupScreen({
  projectName,
  categories,
  items,
  onProjectNameChange,
  onCategoryNameChange,
  onFilesSelected,
  onRemoveItem,
  onMoveItem,
  onStart,
  onLoadDemo,
  startLabel = 'Start sorting',
  isImporting = false,
  error,
}: SetupScreenProps) {
  const categoryHintId = useId()
  const cardOrderHintId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const ready =
    projectName.trim().length > 0 &&
    categories.every((category) => category.name.trim().length > 0) &&
    items.length > 0 &&
    !isImporting

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length > 0) onFilesSelected(files)
    event.target.value = ''
  }

  return (
    <main className="ss-setup" aria-labelledby="setup-title">
      <header className="ss-screen-heading">
        <p className="ss-eyebrow">Setup</p>
        <h1 id="setup-title">Set up your sort.</h1>
        <p>Name two categories, then add images or short videos.</p>
      </header>

      <form
        className="ss-setup__form"
        onSubmit={(event) => {
          event.preventDefault()
          if (ready) onStart()
        }}
      >
        <section className="ss-field-group" aria-labelledby="project-heading">
          <div className="ss-section-label">
            <span>01</span>
            <h2 id="project-heading">Project</h2>
          </div>
          <label className="ss-field">
            <span>Project name</span>
            <input
              value={projectName}
              onChange={(event) => onProjectNameChange(event.target.value)}
              placeholder="Untitled project"
              autoComplete="off"
              disabled={isImporting}
            />
          </label>
        </section>

        <section className="ss-field-group" aria-labelledby="categories-heading">
          <div className="ss-section-label">
            <span>02</span>
            <h2 id="categories-heading">Two categories</h2>
          </div>
          <p className="ss-field-hint" id={categoryHintId}>
            Name where a left or right swipe sends each card.
          </p>
          <div className="ss-category-fields">
            {categories.map((category) => (
              <label className="ss-field" key={category.id}>
                <span>
                  <i style={{ background: category.color }} aria-hidden="true" />
                  Swipe {category.direction}
                </span>
                <input
                  value={category.name}
                  aria-describedby={categoryHintId}
                  onChange={(event) => onCategoryNameChange(category.id, event.target.value)}
                  placeholder={category.direction === 'left' ? 'Not for me' : 'For me'}
                  autoComplete="off"
                  disabled={isImporting}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="ss-field-group" aria-labelledby="media-heading">
          <div className="ss-section-label">
            <span>03</span>
            <h2 id="media-heading">Cards</h2>
          </div>
          <input
            ref={inputRef}
            className="ss-visually-hidden"
            type="file"
            accept={acceptedMedia}
            multiple
            onChange={handleFiles}
            disabled={isImporting}
            tabIndex={-1}
            aria-hidden="true"
          />

          {items.length === 0 ? (
            <div className="ss-empty-media">
              <p>Add images or short videos from this device.</p>
              <button
                className="ss-button ss-button--primary"
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isImporting}
              >
                {isImporting ? 'Adding…' : 'Add images or videos'}
              </button>
              {onLoadDemo ? (
                <button className="ss-text-action" type="button" onClick={onLoadDemo} disabled={isImporting}>
                  Try demo set
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="ss-media-summary">
                <p><strong>{items.length}</strong> {items.length === 1 ? 'card' : 'cards'} ready to sort</p>
                <button
                  className="ss-text-action"
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={isImporting}
                >
                  {isImporting ? 'Adding…' : 'Add images or videos'}
                </button>
              </div>
              <p className="ss-field-hint" id={cardOrderHintId}>
                Cards appear in this order.
              </p>
              <ol
                className="ss-setup-list"
                aria-label="Card order"
                aria-describedby={cardOrderHintId}
              >
                {items.map((media, index) => (
                  <li key={media.item.id}>
                    <div className="ss-setup-list__thumb">
                      <MediaView media={media} variant="thumbnail" />
                    </div>
                    <div className="ss-setup-list__copy">
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong title={media.item.title}>{media.item.title}</strong>
                      <small>{media.asset.kind === 'image' ? 'Image' : 'Video'}</small>
                    </div>
                    <div className="ss-setup-list__actions" aria-label={`Actions for ${media.item.title}`}>
                      <button
                        type="button"
                        onClick={() => onMoveItem(media.item.id, 'up')}
                        disabled={isImporting || index === 0}
                        aria-label={`Move ${media.item.title} earlier`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveItem(media.item.id, 'down')}
                        disabled={isImporting || index === items.length - 1}
                        aria-label={`Move ${media.item.title} later`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(media.item.id)}
                        disabled={isImporting}
                        aria-label={`Remove ${media.item.title}`}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>

        {error ? <p className="ss-form-error" role="alert">{error}</p> : null}

        <footer className="ss-setup__footer">
          <p>
            {ready
              ? 'Changes save automatically in this browser. Your media stays on this device.'
              : 'Add a project name, two category names, and at least one card.'}
          </p>
          <button className="ss-button ss-button--primary" type="submit" disabled={!ready}>
            {startLabel}
          </button>
        </footer>
      </form>
    </main>
  )
}
