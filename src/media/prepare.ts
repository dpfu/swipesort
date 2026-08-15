import { nanoid } from 'nanoid'

import type { StoredAsset } from '../domain/types'
import {
  describeMediaFile,
  extractImageMetadata,
} from './metadata'
import { createVideoPoster } from './poster'

export type PreparedMedia = {
  asset: StoredAsset
  posterAsset?: StoredAsset
}

export type PrepareMediaOptions = {
  createId?: () => string
  createdAt?: string
}

function posterFileName(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]*$/, '') || 'video'
  return `${baseName}-poster.jpg`
}

export async function prepareMediaFile(
  file: File,
  options: PrepareMediaOptions = {},
): Promise<PreparedMedia> {
  const createId = options.createId ?? nanoid
  const createdAt = options.createdAt ?? new Date().toISOString()
  const { kind, mimeType } = describeMediaFile(file)
  const assetId = createId()

  if (kind === 'image') {
    const metadata = await extractImageMetadata(file)
    return {
      asset: {
        id: assetId,
        kind,
        fileName: file.name,
        mimeType,
        size: file.size,
        width: metadata.width,
        height: metadata.height,
        createdAt,
        blob: file,
      },
    }
  }

  const poster = await createVideoPoster(file)
  const posterAssetId = createId()
  return {
    asset: {
      id: assetId,
      kind,
      fileName: file.name,
      mimeType,
      size: file.size,
      width: poster.sourceWidth,
      height: poster.sourceHeight,
      durationMs: poster.durationMs,
      posterAssetId,
      createdAt,
      blob: file,
    },
    posterAsset: {
      id: posterAssetId,
      kind: 'image',
      fileName: posterFileName(file.name),
      mimeType: poster.mimeType,
      size: poster.blob.size,
      width: poster.width,
      height: poster.height,
      createdAt,
      blob: poster.blob,
    },
  }
}
