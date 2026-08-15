// @vitest-environment node

import 'fake-indexeddb/auto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Project, SortSession, StoredAsset } from '../domain/types'
import { SwipeSortStorage } from './db'

const databases: SwipeSortStorage[] = []
const now = '2026-08-15T10:00:00.000Z'

function storage(): SwipeSortStorage {
  const value = new SwipeSortStorage(`swipesort-test-${crypto.randomUUID()}`)
  databases.push(value)
  return value
}

function asset(id = 'asset-1', posterAssetId?: string): StoredAsset {
  const blob = new Blob([id], { type: 'image/png' })
  return {
    id,
    kind: 'image',
    fileName: `${id}.png`,
    mimeType: 'image/png',
    size: blob.size,
    width: 100,
    height: 120,
    posterAssetId,
    createdAt: now,
    blob,
  }
}

function project(id = 'project-1'): Project {
  return {
    version: 1,
    id,
    name: 'Test project',
    categories: [
      { id: 'left', name: 'Keep', direction: 'left', color: '#123456' },
      { id: 'right', name: 'Share', direction: 'right', color: '#654321' },
    ],
    items: [
      { id: 'item-1', assetId: 'asset-1', title: 'One', createdAt: now },
    ],
    createdAt: now,
    updatedAt: now,
  }
}

function session(id = 'session-1', projectId = 'project-1'): SortSession {
  return {
    version: 1,
    id,
    projectId,
    categorySnapshot: project(projectId).categories,
    itemSnapshot: project(projectId).items,
    cardOrder: ['item-1'],
    events: [],
    corrections: [],
    startedAt: now,
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(databases.splice(0).map((database) => database.deleteDatabase()))
})

describe('SwipeSortStorage', () => {
  it('stores projects, assets, and project-indexed sessions explicitly', async () => {
    const database = storage()
    const storedProject = project()
    const storedAsset = asset()
    const storedSession = session()

    await database.putProject(storedProject)
    await database.putAsset(storedAsset)
    await database.putSession(storedSession)

    expect(await database.getProject(storedProject.id)).toEqual(storedProject)
    expect(await database.getAsset(storedAsset.id)).toMatchObject({
      id: storedAsset.id,
      size: storedAsset.size,
    })
    expect(await database.listSessions(storedProject.id)).toEqual([storedSession])
    expect(await database.listSessions('another-project')).toEqual([])
  })

  it('deletes assets and posters retained only by an immutable session', async () => {
    const database = storage()
    const storedProject = { ...project(), items: [] }
    const primaryAsset = asset('asset-1')
    const historicalAsset = asset('historic-asset', 'historic-poster')
    const posterAsset = asset('historic-poster')
    const storedSession: SortSession = {
      ...session(),
      itemSnapshot: [
        {
          id: 'historic-item',
          assetId: historicalAsset.id,
          title: 'Historic',
          createdAt: now,
        },
      ],
      cardOrder: ['historic-item'],
    }
    await database.putProject(storedProject)
    await database.putAsset(primaryAsset)
    await database.putAsset(historicalAsset)
    await database.putAsset(posterAsset)
    await database.putSession(storedSession)

    await database.deleteProject(storedProject.id)

    expect(await database.getProject(storedProject.id)).toBeUndefined()
    expect(await database.getAsset(primaryAsset.id)).toBeDefined()
    expect(await database.getAsset(historicalAsset.id)).toBeUndefined()
    expect(await database.getAsset(posterAsset.id)).toBeUndefined()
    expect(await database.listSessions(storedProject.id)).toEqual([])
  })

  it('atomically replaces all data owned by an imported project', async () => {
    const database = storage()
    await database.putProject(project())
    await database.putAsset(asset())
    await database.putSession(session('old-session'))

    const replacementProject: Project = {
      ...project(),
      name: 'Imported project',
      items: [
        { id: 'item-2', assetId: 'asset-2', title: 'Two', createdAt: now },
      ],
    }
    const replacementSession: SortSession = {
      ...session('new-session'),
      itemSnapshot: replacementProject.items,
      cardOrder: ['item-2'],
    }
    await database.replaceProjectBundle({
      project: replacementProject,
      assets: [asset('asset-2')],
      sessions: [replacementSession],
    })

    expect(await database.getProject('project-1')).toEqual(replacementProject)
    expect(await database.getAsset('asset-1')).toBeUndefined()
    expect(await database.getAsset('asset-2')).toBeDefined()
    expect(await database.listSessions('project-1')).toEqual([
      replacementSession,
    ])
  })

  it('starts every warmed-up put transaction before yielding to a microtask', async () => {
    const database = storage()
    await database.listProjects()
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction')

    const pendingWrites = [
      database.putProject(project()),
      database.putAsset(asset()),
      database.putSession(session()),
    ]

    expect(transaction).toHaveBeenNthCalledWith(1, 'projects', 'readwrite')
    expect(transaction).toHaveBeenNthCalledWith(2, 'assets', 'readwrite')
    expect(transaction).toHaveBeenNthCalledWith(3, 'sessions', 'readwrite')
    await Promise.all(pendingWrites)
    transaction.mockRestore()
  })
})
