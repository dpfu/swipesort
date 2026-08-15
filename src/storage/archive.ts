import JSZip from 'jszip'

import type {
  MediaAsset,
  Project,
  SortSession,
  StoredAsset,
} from '../domain/types'
import type { ProjectBundle, SwipeSortStorage } from './db'
import {
  ArchiveValidationError,
  type ArchiveManifest,
  validateArchiveManifest,
} from './validation'

const MANIFEST_PATH = 'manifest.json'

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function blobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read Blob'))
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.readAsArrayBuffer(blob)
  })
}

function archiveAssetMetadata(asset: StoredAsset): MediaAsset {
  const { blob: _blob, ...metadata } = asset
  return metadata
}

function referencedAssetIds(
  project: Project,
  sessions: readonly SortSession[],
  assets: readonly StoredAsset[],
): string[] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  const ids = new Set(
    [
      ...project.items,
      ...sessions.flatMap((session) => session.itemSnapshot),
    ].map((item) => item.assetId),
  )
  for (const id of ids) {
    const posterId = byId.get(id)?.posterAssetId
    if (posterId) ids.add(posterId)
  }
  return [...ids]
}

export async function exportProjectArchive(
  storage: SwipeSortStorage,
  projectId: string,
): Promise<Blob> {
  const project = await storage.getProject(projectId)
  if (!project) {
    throw new Error(`Project ${projectId} does not exist`)
  }

  const sessions = await storage.listSessions(projectId)
  const primaryIds = [
    ...new Set(
      [
        ...project.items,
        ...sessions.flatMap((session) => session.itemSnapshot),
      ].map((item) => item.assetId),
    ),
  ]
  const primaryAssets = await storage.getAssets(primaryIds)
  const allIds = referencedAssetIds(project, sessions, primaryAssets)
  const assets = await storage.getAssets(allIds)
  if (assets.length !== allIds.length) {
    const found = new Set(assets.map((asset) => asset.id))
    const missing = allIds.find((id) => !found.has(id))
    throw new Error(`Project references missing asset ${missing ?? 'unknown'}`)
  }

  const manifest: ArchiveManifest = validateArchiveManifest({
    format: 'swipesort-project',
    version: 1,
    exportedAt: new Date().toISOString(),
    project,
    assets: assets.map((asset) => ({
      metadata: archiveAssetMetadata(asset),
      path: `assets/${asset.id}`,
    })),
    sessions,
  })

  const zip = new JSZip()
  zip.file(MANIFEST_PATH, JSON.stringify(manifest, null, 2), {
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  for (const asset of assets) {
    zip.file(`assets/${asset.id}`, await blobArrayBuffer(asset.blob), {
      compression: 'STORE',
    })
  }
  const bytes = await zip.generateAsync({
    type: 'uint8array',
  })
  return new Blob([ownedArrayBuffer(bytes)], { type: 'application/zip' })
}

export async function readProjectArchive(
  input: Blob | ArrayBuffer | Uint8Array,
): Promise<ProjectBundle> {
  const source = input instanceof Blob ? await blobArrayBuffer(input) : input
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(source, { checkCRC32: true })
  } catch {
    throw new ArchiveValidationError('Archive is not a readable ZIP file')
  }

  const manifestEntry = zip.file(MANIFEST_PATH)
  if (!manifestEntry) {
    throw new ArchiveValidationError('Archive has no manifest.json')
  }
  let rawManifest: unknown
  try {
    rawManifest = JSON.parse(await manifestEntry.async('string'))
  } catch {
    throw new ArchiveValidationError('manifest.json is not valid JSON')
  }
  const manifest = validateArchiveManifest(rawManifest)
  const assets: StoredAsset[] = []

  for (const entry of manifest.assets) {
    const file = zip.file(entry.path)
    if (!file) {
      throw new ArchiveValidationError(`Archive is missing ${entry.path}`)
    }
    const bytes = await file.async('uint8array')
    if (bytes.byteLength !== entry.metadata.size) {
      throw new ArchiveValidationError(
        `${entry.path}: expected ${entry.metadata.size} bytes, found ${bytes.byteLength}`,
      )
    }
    assets.push({
      ...entry.metadata,
      blob: new Blob([ownedArrayBuffer(bytes)], {
        type: entry.metadata.mimeType,
      }),
    })
  }

  return {
    project: manifest.project,
    assets,
    sessions: manifest.sessions,
  }
}

/** Validates and materializes the complete archive before its single DB write. */
export async function importProjectArchive(
  storage: SwipeSortStorage,
  input: Blob | ArrayBuffer | Uint8Array,
): Promise<Project> {
  const bundle = await readProjectArchive(input)
  await storage.replaceProjectBundle(bundle)
  return bundle.project
}
