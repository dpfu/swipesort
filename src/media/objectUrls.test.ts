import { describe, expect, it, vi } from 'vitest'

import { ObjectUrlRegistry } from './objectUrls'

describe('ObjectUrlRegistry', () => {
  it('reuses URLs per Blob and revokes replacements and disposal', () => {
    const createObjectURL = vi
      .fn<(blob: Blob) => string>()
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second')
    const revokeObjectURL = vi.fn<(url: string) => void>()
    const registry = new ObjectUrlRegistry({ createObjectURL, revokeObjectURL })
    const first = new Blob(['first'])
    const second = new Blob(['second'])

    expect(registry.get('asset', first)).toBe('blob:first')
    expect(registry.get('asset', first)).toBe('blob:first')
    expect(registry.get('asset', second)).toBe('blob:second')
    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first')

    registry.dispose()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second')
  })
})
