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
        <p className="ss-eyebrow">New sort</p>
        <h1 id="setup-title">Make two choices feel clear.</h1>
        <p>Choose the two destinations, then add the images and short videos you want to sort.</p>
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
              placeholder="Untitled sort"
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
          <p className="ss-field-hint" id={categoryHintId}>These labels appear as soon as you move a card.</p>
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
            <h2 id="media-heading">Media</h2>
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
              <p>Start with your own images or short videos.</p>
              <button
                className="ss-button ss-button--primary"
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isImporting}
              >
                {isImporting ? 'Adding media…' : 'Choose media'}
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
                <p><strong>{items.length}</strong> {items.length === 1 ? 'card' : 'cards'} in this sort</p>
                <button
                  className="ss-text-action"
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={isImporting}
                >
                  {isImporting ? 'Adding…' : 'Add more'}
                </button>
              </div>
              <ol className="ss-setup-list" aria-label="Sorting order">
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
          <p>{ready ? 'Everything stays in this browser.' : 'Name the project, name both categories, and add media.'}</p>
          <button className="ss-button ss-button--primary" type="submit" disabled={!ready}>
            {startLabel}
          </button>
        </footer>
      </form>
    </main>
  )
}
