import { afterEach, describe, expect, it, vi } from 'vitest'

import { prepareMediaFile } from './prepare'
import { createVideoPoster } from './poster'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('createVideoPoster', () => {
  it('seeks, scales portrait video, and returns a JPEG Blob', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:video'),
      revokeObjectURL: vi.fn(),
    })
    const video = new EventTarget() as HTMLVideoElement
    let currentTime = 0
    Object.assign(video, {
      videoWidth: 1080,
      videoHeight: 1920,
      duration: 6,
      readyState: 2,
      pause: vi.fn(),
      removeAttribute: vi.fn(),
    })
    Object.defineProperties(video, {
      src: { set: vi.fn() },
      currentTime: {
        get: () => currentTime,
        set: (value: number) => {
          currentTime = value
          queueMicrotask(() => video.dispatchEvent(new Event('seeked')))
        },
      },
    })
    video.load = vi.fn(() =>
      queueMicrotask(() => video.dispatchEvent(new Event('loadedmetadata'))),
    )

    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn((callback: BlobCallback) =>
        callback(new Blob(['poster'], { type: 'image/jpeg' })),
      ),
    } as unknown as HTMLCanvasElement
    vi.spyOn(document, 'createElement').mockImplementation(
      ((tagName: string) =>
        tagName === 'video' ? video : canvas) as typeof document.createElement,
    )

    const poster = await createVideoPoster(new Blob(['video']), {
      maxDimension: 960,
    })

    expect(poster).toMatchObject({
      width: 540,
      height: 960,
      sourceWidth: 1080,
      sourceHeight: 1920,
      durationMs: 6000,
      mimeType: 'image/jpeg',
    })
    expect(poster.blob.size).toBeGreaterThan(0)
    expect(currentTime).toBe(1)
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 540, 960)
  })

  it('prepares a video and its poster from one decoded media element', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:video'),
      revokeObjectURL: vi.fn(),
    })
    const video = new EventTarget() as HTMLVideoElement
    Object.assign(video, {
      videoWidth: 720,
      videoHeight: 1280,
      duration: 3.2,
      readyState: 2,
      pause: vi.fn(),
      removeAttribute: vi.fn(),
    })
    let currentTime = 0
    Object.defineProperties(video, {
      src: { set: vi.fn() },
      currentTime: {
        get: () => currentTime,
        set: (value: number) => {
          currentTime = value
          queueMicrotask(() => video.dispatchEvent(new Event('seeked')))
        },
      },
    })
    video.load = vi.fn(() =>
      queueMicrotask(() => video.dispatchEvent(new Event('loadedmetadata'))),
    )
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((callback: BlobCallback) =>
        callback(new Blob(['poster'], { type: 'image/jpeg' })),
      ),
    } as unknown as HTMLCanvasElement
    vi.spyOn(document, 'createElement').mockImplementation(
      ((tagName: string) =>
        tagName === 'video' ? video : canvas) as typeof document.createElement,
    )
    const ids = ['video-id', 'poster-id']

    const prepared = await prepareMediaFile(
      new File(['video'], 'portrait.mp4', { type: 'video/mp4' }),
      {
        createId: () => ids.shift() ?? 'unexpected-id',
        createdAt: '2026-08-15T00:00:00.000Z',
      },
    )

    expect(prepared.asset).toMatchObject({
      id: 'video-id',
      kind: 'video',
      width: 720,
      height: 1280,
      durationMs: 3200,
      posterAssetId: 'poster-id',
    })
    expect(prepared.posterAsset).toMatchObject({
      id: 'poster-id',
      kind: 'image',
      width: 540,
      height: 960,
      mimeType: 'image/jpeg',
    })
    expect(document.createElement).toHaveBeenCalledWith('video')
    expect(
      vi.mocked(document.createElement).mock.calls.filter(
        ([tagName]) => tagName === 'video',
      ),
    ).toHaveLength(1)
  })
})
