import type { MediaKind } from '../domain/types'
import { withImageElement, withVideoElement } from './elements'

export type ImageMetadata = {
  kind: 'image'
  width: number
  height: number
}

export type VideoMetadata = {
  kind: 'video'
  width: number
  height: number
  durationMs: number
}

export type ExtractedMediaMetadata = ImageMetadata | VideoMetadata

const extensionTypes: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  ogv: 'video/ogg',
  webm: 'video/webm',
}

export class UnsupportedMediaError extends Error {
  constructor(fileName: string) {
    super(`${fileName} is not a supported image or video file`)
    this.name = 'UnsupportedMediaError'
  }
}

export function describeMediaFile(file: File): {
  kind: Exclude<MediaKind, 'tiktok'>
  mimeType: string
} {
  const declaredType = file.type.toLowerCase().split(';', 1)[0]?.trim() ?? ''
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const mimeType =
    declaredType.startsWith('image/') || declaredType.startsWith('video/')
      ? declaredType
      : extensionTypes[extension]
  if (!mimeType) {
    throw new UnsupportedMediaError(file.name)
  }
  return {
    kind: mimeType.startsWith('image/') ? 'image' : 'video',
    mimeType,
  }
}

export async function extractImageMetadata(blob: Blob): Promise<ImageMetadata> {
  return withImageElement(blob, (image) => {
    const width = image.naturalWidth
    const height = image.naturalHeight
    if (!width || !height) {
      throw new Error('The image has no visible dimensions')
    }
    return { kind: 'image', width, height }
  })
}

export async function extractVideoMetadata(blob: Blob): Promise<VideoMetadata> {
  return withVideoElement(blob, (video) => {
    const { videoWidth: width, videoHeight: height, duration } = video
    if (!width || !height || !Number.isFinite(duration) || duration < 0) {
      throw new Error('The video has invalid dimensions or duration')
    }
    return {
      kind: 'video',
      width,
      height,
      durationMs: Math.round(duration * 1000),
    }
  })
}

export function extractMediaMetadata(
  blob: Blob,
  kind: 'image',
): Promise<ImageMetadata>
export function extractMediaMetadata(
  blob: Blob,
  kind: 'video',
): Promise<VideoMetadata>
export function extractMediaMetadata(
  blob: Blob,
  kind: Exclude<MediaKind, 'tiktok'>,
): Promise<ExtractedMediaMetadata> {
  return kind === 'image'
    ? extractImageMetadata(blob)
    : extractVideoMetadata(blob)
}
