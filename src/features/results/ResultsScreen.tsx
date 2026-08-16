import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Category } from '../../domain/types'
import { MediaView } from '../shared/MediaView'
import type { PresentedMedia } from '../types'
import './results-screen.css'

export type ResultsScreenProps = {
  categories: [Category, Category]
  items: PresentedMedia[]
  categoryIdByItemId: Readonly<Record<string, string>>
  onMoveItem: (itemId: string, categoryId: string) => void
  onReplay?: () => void
  onNewSort?: () => void
}

export function ResultsScreen({
  categories,
  items,
  categoryIdByItemId,
  onMoveItem,
  onReplay,
  onNewSort,
}: ResultsScreenProps) {
  const [activeCategoryId, setActiveCategoryId] = useState(
    () =>
      categories.find((category) =>
        items.some(
          (media) => categoryIdByItemId[media.item.id] === category.id,
        ),
      )?.id ?? categories[0].id,
  )
  const grouped = useMemo(
    () =>
      categories.map((category) => ({
        category,
        items: items.filter((media) => categoryIdByItemId[media.item.id] === category.id),
      })) as [
        { category: Category; items: PresentedMedia[] },
        { category: Category; items: PresentedMedia[] },
      ],
    [categories, categoryIdByItemId, items],
  )

  useEffect(() => {
    if (!categories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(categories[0].id)
    }
  }, [activeCategoryId, categories])

  const activeGroup = grouped.find((group) => group.category.id === activeCategoryId) ?? grouped[0]
  const otherCategory = categories.find((category) => category.id !== activeGroup.category.id) ?? categories[1]

  return (
    <main className="ss-results" aria-labelledby="results-title">
      <header className="ss-results__header">
        <div>
          <p className="ss-eyebrow">Result</p>
          <h1 id="results-title">Review your result.</h1>
        </div>
        <p>
          {items.length} {items.length === 1 ? 'card' : 'cards'} sorted. Move any card to
          change its category. Replay keeps your original choices.
        </p>
      </header>

      <div className="ss-results-tabs" role="tablist" aria-label="Result categories">
        {grouped.map(({ category, items: categoryItems }) => (
          <button
            key={category.id}
            id={`result-tab-${category.id}`}
            type="button"
            role="tab"
            aria-selected={category.id === activeGroup.category.id}
            aria-controls={`result-panel-${category.id}`}
            tabIndex={category.id === activeGroup.category.id ? 0 : -1}
            onClick={() => setActiveCategoryId(category.id)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              const nextIndex = category.id === categories[0].id ? 1 : 0
              const nextCategory = categories[nextIndex]
              setActiveCategoryId(nextCategory.id)
              document.getElementById(`result-tab-${nextCategory.id}`)?.focus()
            }}
            style={{ '--category-color': category.color } as CSSProperties}
          >
            <span>Swipe {category.direction}</span>
            <strong>{category.name}</strong>
            <i>{categoryItems.length}</i>
          </button>
        ))}
      </div>

      <section
        className="ss-result-panel"
        id={`result-panel-${activeGroup.category.id}`}
        role="tabpanel"
        aria-labelledby={`result-tab-${activeGroup.category.id}`}
        style={{ '--category-color': activeGroup.category.color } as CSSProperties}
      >
        <header>
          <p>Cards in</p>
          <h2>{activeGroup.category.name}</h2>
        </header>

        {activeGroup.items.length === 0 ? (
          <div className="ss-result-empty">
            <p>No cards in {activeGroup.category.name}.</p>
          </div>
        ) : (
          <ul className="ss-result-grid">
            {activeGroup.items.map((media) => (
              <li key={media.item.id}>
                <article className="ss-result-card">
                  <MediaView media={media} variant="result" />
                  <div>
                    <strong title={media.item.title}>{media.item.title}</strong>
                    <button
                      type="button"
                      onClick={() => onMoveItem(media.item.id, otherCategory.id)}
                      aria-label={`Move ${media.item.title} to ${otherCategory.name}`}
                    >
                      Move to {otherCategory.name}
                    </button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(onReplay || onNewSort) ? (
        <footer className="ss-results__footer">
          {onNewSort ? (
            <button className="ss-text-action" type="button" onClick={onNewSort}>
              Sort again
            </button>
          ) : <span />}
          {onReplay ? (
            <button className="ss-button ss-button--primary" type="button" onClick={onReplay}>
              Replay original choices
            </button>
          ) : null}
        </footer>
      ) : null}
    </main>
  )
}
