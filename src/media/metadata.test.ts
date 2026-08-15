import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  describeMediaFile,
  extractImageMetadata,
  extractVideoMetadata,
  UnsupportedMediaError,
} from './metadata'
import { prepareMediaFile } from './prepare'

function mockObjectUrls(): void {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:test'),
    revokeObjectURL: vi.fn(),
  })
}

function fakeImage(): HTMLImageElement {
  const image = new EventTarget() as HTMLImageElement
  Object.defineProperties(image, {
    naturalWidth: { value: 640 },
    naturalHeight: { value: 960 },
    src: {
      set: () => queueMicrotask(() => image.dispatchEvent(new Event('load'))),
    },
  })
  image.removeAttribute = vi.fn()
  return image
}

function fakeVideo(): HTMLVideoElement {
  const video = new EventTarget() as HTMLVideoElement
  Object.assign(video, {
    videoWidth: 1080,
    videoHeight: 1920,
    duration: 2.3456,
    muted: false,
    playsInline: false,
    preload: '',
    pause: vi.fn(),
    removeAttribute: vi.fn(),
  })
  Object.defineProperty(video, 'src', { set: vi.fn() })
  video.load = vi.fn(() =>
    queueMicrotask(() => video.dispatchEvent(new Event('loadedmetadata'))),
  )
  return video
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('media metadata', () => {
  it('accepts declared media MIME types and infers common empty types', () => {
    expect(describeMediaFile(new File([''], 'photo.bin', { type: 'image/webp' }))).toEqual(
      { kind: 'image', mimeType: 'image/webp' },
    )
    expect(describeMediaFile(new File([''], 'clip.MP4'))).toEqual({
      kind: 'video',
      mimeType: 'video/mp4',
    })
    expect(() => describeMediaFile(new File([''], 'notes.txt'))).toThrow(
      UnsupportedMediaError,
    )
  })

  it('extracts decoded image dimensions and prepares an image asset', async () => {
    mockObjectUrls()
    const image = fakeImage()
    vi.spyOn(document, 'createElement').mockImplementation(
      ((tagName: string) =>
        tagName === 'img' ? image : document.createElement(tagName)) as typeof document.createElement,
    )
    const file = new File(['image'], 'portrait.png', { type: 'image/png' })

    await expect(extractImageMetadata(file)).resolves.toEqual({
      kind: 'image',
      width: 640,
      height: 960,
    })
    const prepared = await prepareMediaFile(file, {
      createId: () => 'asset-id',
      createdAt: '2026-08-15T00:00:00.000Z',
    })
    expect(prepared).toMatchObject({
      asset: {
        id: 'asset-id',
        kind: 'image',
        width: 640,
        height: 960,
        mimeType: 'image/png',
      },
    })
    expect(prepared.posterAsset).toBeUndefined()
  })

  it('extracts portrait video dimensions and duration in milliseconds', async () => {
    mockObjectUrls()
    const video = fakeVideo()
    vi.spyOn(document, 'createElement').mockReturnValue(video)

    await expect(extractVideoMetadata(new Blob(['video']))).resolves.toEqual({
      kind: 'video',
      width: 1080,
      height: 1920,
      durationMs: 2346,
    })
    expect(video.muted).toBe(true)
    expect(video.playsInline).toBe(true)
  })
})
