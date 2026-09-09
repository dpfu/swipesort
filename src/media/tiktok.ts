import { nanoid } from 'nanoid'
import type { StoredAsset } from '../domain/types'

export type TikTokLink = { videoId: string; url: string }

/** Parse only full video links. No fetching, redirects, or third-party proxies. */
export function parseTikTokUrl(input: string): TikTokLink {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error('Use a full TikTok video URL, starting with https://www.tiktok.com/.')
  }
  if (url.hostname === 'vm.tiktok.com' || url.hostname === 'vt.tiktok.com' ||
      (url.hostname === 'www.tiktok.com' && url.pathname.startsWith('/t/'))) {
    throw new Error('Open the short link in your browser, then copy the full /@creator/video/… URL.')
  }
  const match = url.pathname.match(/^\/@[\w.-]+\/video\/(\d{15,25})\/?$/)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port ||
      !['www.tiktok.com', 'tiktok.com', 'm.tiktok.com'].includes(url.hostname) || !match) {
    throw new Error('Use a TikTok video URL in the form https://www.tiktok.com/@creator/video/123… .')
  }
  return { videoId: match[1], url: `https://www.tiktok.com${url.pathname.replace(/\/$/, '')}` }
}

export function parseTikTokUrls(input: string): { links: TikTokLink[]; duplicates: number } {
  const links: TikTokLink[] = []
  const ids = new Set<string>()
  let duplicates = 0
  const errors: string[] = []
  input.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return
    try {
      const link = parseTikTokUrl(line)
      if (ids.has(link.videoId)) duplicates += 1
      else { ids.add(link.videoId); links.push(link) }
    } catch (cause) {
      errors.push(`Line ${index + 1}: ${(cause as Error).message}`)
    }
  })
  if (errors.length) throw new Error(errors.join('\n'))
  if (!links.length) throw new Error('Paste at least one TikTok video URL, one per line.')
  return { links, duplicates }
}

export function prepareTikTokLink(link: TikTokLink): StoredAsset & { kind: 'tiktok' } {
  const canonical = parseTikTokUrl(link.url)
  if (canonical.videoId !== link.videoId) throw new Error('TikTok video ID does not match its URL.')
  // Store a real URI-list asset, not a downloaded or empty stand-in video.
  const blob = new Blob([canonical.url], { type: 'text/uri-list' })
  return {
    id: nanoid(), kind: 'tiktok', tiktok: canonical,
    fileName: `tiktok-${canonical.videoId}.url`, mimeType: blob.type,
    size: blob.size, width: 9, height: 16,
    createdAt: new Date().toISOString(), blob,
  }
}

export function tikTokPlayerUrl(videoId: string): string {
  if (!/^\d{15,25}$/.test(videoId)) throw new Error('Invalid TikTok video ID.')
  return `https://www.tiktok.com/player/v1/${videoId}?autoplay=0&controls=1&description=0&music_info=0&rel=0`
}
