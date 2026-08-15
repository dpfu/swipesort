import { waitForMediaEvent, withVideoElement } from './elements'

export type VideoPoster = {
  blob: Blob
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
  durationMs: number
  mimeType: 'image/jpeg'
}

export type VideoPosterOptions = {
  maxDimension?: number
  quality?: number
  timeSeconds?: number
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('The browser could not create a video poster'))
      },
      'image/jpeg',
      quality,
    )
  })
}

export async function createVideoPoster(
  videoBlob: Blob,
  options: VideoPosterOptions = {},
): Promise<VideoPoster> {
  const maxDimension = options.maxDimension ?? 960
  const quality = options.quality ?? 0.82
  if (
    !Number.isFinite(maxDimension) ||
    maxDimension < 1 ||
    !Number.isFinite(quality) ||
    quality <= 0 ||
    quality > 1 ||
    (options.timeSeconds !== undefined &&
      (!Number.isFinite(options.timeSeconds) || options.timeSeconds < 0))
  ) {
    throw new Error('Invalid video poster options')
  }

  return withVideoElement(
    videoBlob,
    async (video) => {
      if (!video.videoWidth || !video.videoHeight) {
        throw new Error('The video has no visible dimensions')
      }
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await waitForMediaEvent(video, 'loadeddata')
      }
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      const requestedTime = options.timeSeconds ?? Math.min(duration / 3, 1)
      const targetTime = Math.max(0, Math.min(requestedTime, duration || 0))
      if (targetTime > 0 && Math.abs(video.currentTime - targetTime) > 0.01) {
        const seeked = waitForMediaEvent(video, 'seeked')
        video.currentTime = targetTime
        await seeked
      }

      const scale = Math.min(
        1,
        maxDimension / Math.max(video.videoWidth, video.videoHeight),
      )
      const width = Math.max(1, Math.round(video.videoWidth * scale))
      const height = Math.max(1, Math.round(video.videoHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('Canvas is unavailable for video poster creation')
      }
      context.drawImage(video, 0, 0, width, height)
      return {
        blob: await canvasBlob(canvas, quality),
        width,
        height,
        sourceWidth: video.videoWidth,
        sourceHeight: video.videoHeight,
        durationMs: Math.round(duration * 1000),
        mimeType: 'image/jpeg' as const,
      }
    },
    'auto',
  )
}
