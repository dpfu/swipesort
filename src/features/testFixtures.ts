import type { Category, MediaAsset, MediaItem } from '../domain/types'
import type { PresentedMedia } from './types'

export const testCategories: [Category, Category] = [
  { id: 'quiet', name: 'Quiet', direction: 'left', color: '#d8a28d' },
  { id: 'vivid', name: 'Vivid', direction: 'right', color: '#86a896' },
]

export function testMedia(id: string, title: string): PresentedMedia {
  const createdAt = '2026-08-15T10:00:00.000Z'
  const item: MediaItem = {
    id,
    assetId: `asset-${id}`,
    title,
    createdAt,
  }
  const asset: MediaAsset = {
    id: item.assetId,
    kind: 'image',
    fileName: `${id}.svg`,
    mimeType: 'image/svg+xml',
    size: 120,
    width: 600,
    height: 900,
    createdAt,
  }

  return {
    item,
    asset,
    src: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><title>${title}</title></svg>`)}`,
  }
}
