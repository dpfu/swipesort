export type Screen = 'setup' | 'sort' | 'results' | 'replay'

export type SwipeDirection = 'left' | 'right'

export type InputMethod = 'pointer' | 'button' | 'keyboard'

export type MediaKind = 'image' | 'video'

export type Category = {
  id: string
  name: string
  direction: SwipeDirection
  color: string
}

export type MediaAsset = {
  id: string
  kind: MediaKind
  fileName: string
  mimeType: string
  size: number
  width: number
  height: number
  durationMs?: number
  posterAssetId?: string
  createdAt: string
}

export type MediaItem = {
  id: string
  assetId: string
  title: string
  createdAt: string
}

export type Project = {
  version: 1
  id: string
  name: string
  categories: [Category, Category]
  items: MediaItem[]
  activeSessionId?: string
  createdAt: string
  updatedAt: string
}

export type SwipeSample = {
  t: number
  x: number
  y: number
}

export type AssignEvent = {
  id: string
  type: 'assign'
  itemId: string
  categoryId: string
  direction: SwipeDirection
  input: InputMethod
  atMs: number
  durationMs: number
  velocityX: number
  samples: SwipeSample[]
}

export type UndoEvent = {
  id: string
  type: 'undo'
  targetEventId: string
  atMs: number
}

export type SessionEvent = AssignEvent | UndoEvent

export type ReviewCorrection = {
  id: string
  itemId: string
  categoryId: string
  changedAt: string
}

export type SortSession = {
  version: 1
  id: string
  projectId: string
  categorySnapshot: [Category, Category]
  itemSnapshot: MediaItem[]
  cardOrder: string[]
  events: SessionEvent[]
  corrections: ReviewCorrection[]
  startedAt: string
  completedAt?: string
}

export type StoredAsset = MediaAsset & {
  blob: Blob
}
