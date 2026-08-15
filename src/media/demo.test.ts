import { describe, expect, it } from 'vitest'

import { createDemoMedia } from './demo'

describe('createDemoMedia', () => {
  it('creates six deterministic portrait SVG cards without remote assets', async () => {
    const first = createDemoMedia()
    const second = createDemoMedia()

    expect(first.items).toHaveLength(6)
    expect(first.assets).toHaveLength(6)
    expect(first.items).toEqual(second.items)
    expect(first.assets.map(({ blob: _blob, ...asset }) => asset)).toEqual(
      second.assets.map(({ blob: _blob, ...asset }) => asset),
    )
    expect(first.assets.every((asset) => asset.width < asset.height)).toBe(true)
    expect(first.assets.every((asset) => asset.mimeType === 'image/svg+xml')).toBe(
      true,
    )
    expect(await first.assets[0]?.blob.text()).toContain('<svg')
  })
})
