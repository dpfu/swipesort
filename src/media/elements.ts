const LOAD_TIMEOUT_MS = 20_000

export function waitForMediaEvent(
  target: EventTarget,
  eventName: string,
  errorName = 'error',
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error(`Media loading timed out while waiting for ${eventName}`))
    }, LOAD_TIMEOUT_MS)
    const complete = () => {
      cleanup()
      resolve()
    }
    const failed = () => {
      cleanup()
      reject(new Error('The browser could not decode this media file'))
    }
    const cleanup = () => {
      window.clearTimeout(timeout)
      target.removeEventListener(eventName, complete)
      target.removeEventListener(errorName, failed)
    }
    target.addEventListener(eventName, complete, { once: true })
    target.addEventListener(errorName, failed, { once: true })
  })
}

export async function withImageElement<T>(
  blob: Blob,
  operation: (image: HTMLImageElement) => T | Promise<T>,
): Promise<T> {
  const image = document.createElement('img')
  const url = URL.createObjectURL(blob)
  try {
    const loaded = waitForMediaEvent(image, 'load')
    image.src = url
    await loaded
    return await operation(image)
  } finally {
    image.removeAttribute('src')
    URL.revokeObjectURL(url)
  }
}

export async function withVideoElement<T>(
  blob: Blob,
  operation: (video: HTMLVideoElement) => T | Promise<T>,
  preload: 'metadata' | 'auto' = 'metadata',
): Promise<T> {
  const video = document.createElement('video')
  const url = URL.createObjectURL(blob)
  video.preload = preload
  video.muted = true
  video.playsInline = true
  try {
    const loaded = waitForMediaEvent(video, 'loadedmetadata')
    video.src = url
    video.load()
    await loaded
    return await operation(video)
  } finally {
    video.pause()
    video.removeAttribute('src')
    try {
      video.load()
    } catch {
      // A detached media element may reject load() in some browsers.
    }
    URL.revokeObjectURL(url)
  }
}
