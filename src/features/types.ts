import type {
  Category,
  InputMethod,
  MediaAsset,
  MediaItem,
  SwipeDirection,
  SwipeSample,
} from '../domain/types'

export type PresentedMedia = {
  item: MediaItem
  asset: MediaAsset
  src: string
  posterSrc?: string
}

export type SwipeCommit = {
  direction: SwipeDirection
  input: InputMethod
  velocityX: number
  durationMs: number
  samples: SwipeSample[]
}

export type ReplayFrame = {
  item: PresentedMedia
  categoryId: Category['id']
  direction: SwipeDirection
  atMs: number
  undone?: boolean
}
