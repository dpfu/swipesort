export type ObjectUrlApi = {
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
}

type UrlEntry = {
  blob: Blob
  url: string
}

const browserObjectUrlApi: ObjectUrlApi = {
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
}

/** Owns ephemeral Blob URLs. Keep this registry out of persisted state. */
export class ObjectUrlRegistry {
  private readonly entries = new Map<string, UrlEntry>()
  private readonly api: ObjectUrlApi

  constructor(api: ObjectUrlApi = browserObjectUrlApi) {
    this.api = api
  }

  get(assetId: string, blob: Blob): string {
    const current = this.entries.get(assetId)
    if (current?.blob === blob) return current.url
    if (current) this.api.revokeObjectURL(current.url)
    const url = this.api.createObjectURL(blob)
    this.entries.set(assetId, { blob, url })
    return url
  }

  release(assetId: string): void {
    const entry = this.entries.get(assetId)
    if (!entry) return
    this.api.revokeObjectURL(entry.url)
    this.entries.delete(assetId)
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      this.api.revokeObjectURL(entry.url)
    }
    this.entries.clear()
  }
}
