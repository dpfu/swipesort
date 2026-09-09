// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseTikTokUrl, parseTikTokUrls, prepareTikTokLink, tikTokPlayerUrl } from './tiktok'

const url = 'https://www.tiktok.com/@scout2015/video/6718335390845095173'

describe('TikTok URL import', () => {
  it('preserves long IDs as strings and strips tracking, fragments, and mobile hosts', () => {
    expect(parseTikTokUrl('  https://m.tiktok.com/@scout2015/video/6718335390845095173/?is_from_webapp=1#x  '))
      .toEqual({ url, videoId: '6718335390845095173' })
    expect(tikTokPlayerUrl('6718335390845095173')).toMatch(/^https:\/\/www.tiktok.com\/player\/v1\/6718335390845095173\?autoplay=0/)
  })

  it.each([
    'https://tiktok.com.evil.org/@a/video/6718335390845095173',
    'https://www.tiktok.com@evil.org/@a/video/6718335390845095173',
    'https://evil.org@www.tiktok.com/@a/video/6718335390845095173',
    'https://www.tiktok.com:444/@a/video/6718335390845095173',
    'javascript:alert(1)', 'https://www.tiktok.com/@a/photo/6718335390845095173',
    'https://www.tiktok.com/@a/video/6718335390845095173/extra',
    'https://www.tiktok.com/@a/video/123', '<iframe src="https://example.com">',
  ])('rejects unsupported input: %s', (input) => {
    expect(() => parseTikTokUrl(input)).toThrow()
  })

  it.each(['https://vm.tiktok.com/abc/', 'https://vt.tiktok.com/abc/', 'https://www.tiktok.com/t/abc/'])
    ('explains how to expand short links: %s', (input) => {
      expect(() => parseTikTokUrl(input)).toThrow('copy the full')
    })

  it('deduplicates by video ID, keeps order, and reports invalid lines without partial import', () => {
    const second = 'https://www.tiktok.com/@other/video/6718335390845095174'
    expect(parseTikTokUrls(`\n${url}\n${second}\n${url}?tracking=yes\n`))
      .toEqual({ links: [parseTikTokUrl(url), parseTikTokUrl(second)], duplicates: 1 })
    expect(() => parseTikTokUrls(`${url}\nhttps://example.com\n${second}`)).toThrow('Line 2:')
    expect(() => parseTikTokUrls(' \n ')).toThrow('at least one')
  })

  it('stores only a canonical link as a URI-list asset', async () => {
    const asset = prepareTikTokLink(parseTikTokUrl(url))
    expect(asset.kind).toBe('tiktok')
    expect(asset.mimeType).toBe('text/uri-list')
    expect(await asset.blob.text()).toBe(url)
    expect(asset.size).toBe(new TextEncoder().encode(url).length)
  })
})
