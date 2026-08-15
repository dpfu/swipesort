// @vitest-environment node

import 'fake-indexeddb/auto'

import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'

import type { Project, SortSession, StoredAsset } from '../domain/types'
import {
  exportProjectArchive,
  importProjectArchive,
  readProjectArchive,
} from './archive'
import { SwipeSortStorage } from './db'
import { ArchiveValidationError } from './validation'

const now = '2026-08-15T10:00:00.000Z'
const databases: SwipeSortStorage[] = []

function storage(): SwipeSortStorage {
  const value = new SwipeSortStorage(`swipesort-archive-${crypto.randomUUID()}`)
  databases.push(value)
  return value
}

function fixture(): {
  project: Project
  session: SortSession
  asset: StoredAsset
} {
  const blob = new Blob(['pixel-data'], { type: 'image/png' })
  const categories: Project['categories'] = [
    { id: 'left', name: 'Quiet', direction: 'left', color: '#112233' },
    { id: 'right', name: 'Loud', direction: 'right', color: '#445566' },
  ]
  const session: SortSession = {
    version: 1,
    id: 'session-1',
    projectId: 'project-1',
    categorySnapshot: categories,
    itemSnapshot: [
      { id: 'item-1', assetId: 'asset-1', title: 'Pixel', createdAt: now },
    ],
    cardOrder: ['item-1'],
    events: [
      {
        id: 'event-1',
        type: 'assign',
        itemId: 'item-1',
        categoryId: 'left',
        direction: 'left',
        input: 'pointer',
        atMs: 350,
        durationMs: 350,
        velocityX: -0.7,
        samples: [{ t: 0, x: 0, y: 0 }],
      },
    ],
    corrections: [],
    startedAt: now,
    completedAt: now,
  }
  return {
    project: {
      version: 1,
      id: 'project-1',
      name: 'Archive fixture',
      categories,
      items: [
        { id: 'item-1', assetId: 'asset-1', title: 'Pixel', createdAt: now },
      ],
      activeSessionId: session.id,
      createdAt: now,
      updatedAt: now,
    },
    session,
    asset: {
      id: 'asset-1',
      kind: 'image',
      fileName: 'pixel.png',
      mimeType: 'image/png',
      size: blob.size,
      width: 100,
      height: 200,
      createdAt: now,
      blob,
    },
  }
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.deleteDatabase()))
})

describe('project archives', () => {
  it('round-trips the current project, Blob, and immutable session format', async () => {
    const source = storage()
    const target = storage()
    const data = fixture()
    data.project.items = []
    data.asset.posterAssetId = 'poster-1'
    const posterBlob = new Blob(['poster-data'], { type: 'image/jpeg' })
    const poster: StoredAsset = {
      id: 'poster-1',
      kind: 'image',
      fileName: 'poster.jpg',
      mimeType: 'image/jpeg',
      size: posterBlob.size,
      width: 50,
      height: 100,
      createdAt: now,
      blob: posterBlob,
    }
    await source.putProject(data.project)
    await source.putAsset(data.asset)
    await source.putAsset(poster)
    await source.putSession(data.session)

    const archive = await exportProjectArchive(source, data.project.id)
    const parsed = await readProjectArchive(archive)
    const imported = await importProjectArchive(target, archive)

    expect(archive.type).toBe('application/zip')
    expect(parsed.project).toEqual(data.project)
    expect(await parsed.assets[0]?.blob.text()).toBe('pixel-data')
    expect(parsed.assets.map((asset) => asset.id)).toEqual([
      'asset-1',
      'poster-1',
    ])
    expect(parsed.sessions).toEqual([data.session])
    expect(imported).toEqual(data.project)
    expect(await target.getSession(data.session.id)).toEqual(data.session)
  })

  it('performs no write when manifest references are invalid', async () => {
    const target = storage()
    const data = fixture()
    const zip = new JSZip()
    const invalidManifest = {
      format: 'swipesort-project',
      version: 1,
      exportedAt: now,
      project: data.project,
      assets: [],
      sessions: [data.session],
    }
    zip.file('manifest.json', JSON.stringify(invalidManifest))
    const bytes = await zip.generateAsync({ type: 'uint8array' })

    await expect(importProjectArchive(target, bytes)).rejects.toBeInstanceOf(
      ArchiveValidationError,
    )
    expect(await target.listProjects()).toEqual([])
  })
})
