import type { MediaItem, StoredAsset } from '../domain/types'

export type DemoMedia = {
  assets: StoredAsset[]
  items: MediaItem[]
}

const DEMO_CREATED_AT = '2026-08-15T00:00:00.000Z'

const demoCards = [
  {
    title: 'Blue hour',
    background: '#dce8ed',
    ink: '#173844',
    accent: '#f0a86e',
    shape: '<circle cx="575" cy="365" r="210"/><circle cx="225" cy="920" r="110"/>',
  },
  {
    title: 'Soft horizon',
    background: '#f1e8dc',
    ink: '#573a2d',
    accent: '#8baaa1',
    shape: '<path d="M0 510 Q230 380 450 535 T900 515 V1200 H0Z"/>',
  },
  {
    title: 'Signal',
    background: '#e6e1ef',
    ink: '#382d50',
    accent: '#df735f',
    shape: '<rect x="180" y="185" width="540" height="830" rx="270"/><circle cx="450" cy="600" r="118"/>',
  },
  {
    title: 'Open window',
    background: '#dceade',
    ink: '#23442e',
    accent: '#e3bc61',
    shape: '<path d="M150 180 H750 V1020 H150Z M300 330 H600 V870 H300Z" fill-rule="evenodd"/>',
  },
  {
    title: 'After rain',
    background: '#e2e9f1',
    ink: '#24374d',
    accent: '#9a76a6',
    shape: '<path d="M155 720 C280 430 620 430 745 720 C650 965 250 965 155 720Z"/>',
  },
  {
    title: 'Warm current',
    background: '#f2dfd3',
    ink: '#5c3027',
    accent: '#6f9fa3',
    shape: '<path d="M90 760 C250 480 405 990 560 685 C685 440 755 555 835 390" fill="none" stroke-width="115" stroke-linecap="round"/>',
  },
] as const

function svgForCard(card: (typeof demoCards)[number]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <rect width="900" height="1200" rx="72" fill="${card.background}"/>
  <g fill="${card.accent}" stroke="${card.accent}">${card.shape}</g>
  <text x="72" y="1090" fill="${card.ink}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="58" font-weight="600">${card.title}</text>
</svg>`
}

/** Six deterministic, dependency-free cards for a useful first-run project. */
export function createDemoMedia(idPrefix = 'demo'): DemoMedia {
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(idPrefix)) {
    throw new Error('Demo media ID prefix contains unsupported characters')
  }
  const assets: StoredAsset[] = []
  const items: MediaItem[] = []
  demoCards.forEach((card, index) => {
    const number = index + 1
    const assetId = `${idPrefix}-asset-${number}`
    const blob = new Blob([svgForCard(card)], { type: 'image/svg+xml' })
    assets.push({
      id: assetId,
      kind: 'image',
      fileName: `swipesort-demo-${number}.svg`,
      mimeType: 'image/svg+xml',
      size: blob.size,
      width: 900,
      height: 1200,
      createdAt: DEMO_CREATED_AT,
      blob,
    })
    items.push({
      id: `${idPrefix}-item-${number}`,
      assetId,
      title: card.title,
      createdAt: DEMO_CREATED_AT,
    })
  })
  return { assets, items }
}
