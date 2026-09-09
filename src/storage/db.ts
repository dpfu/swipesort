import {
  deleteDB,
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPObjectStore,
} from 'idb'

import type { Project, SortSession, StoredAsset } from '../domain/types'

export const SWIPESORT_DB_NAME = 'swipesort'

export type ProjectBundle = {
  project: Project
  assets: StoredAsset[]
  sessions: SortSession[]
}

interface SwipeSortDatabase extends DBSchema {
  projects: {
    key: string
    value: Project
  }
  assets: {
    key: string
    value: StoredAsset
  }
  sessions: {
    key: string
    value: SortSession
    indexes: { 'by-project': string }
  }
}

export class SwipeSortStorage {
  readonly dbName: string
  private database?: Promise<IDBPDatabase<SwipeSortDatabase>>
  private resolvedDatabase?: IDBPDatabase<SwipeSortDatabase>

  constructor(dbName = SWIPESORT_DB_NAME) {
    this.dbName = dbName
  }

  async getProject(id: string): Promise<Project | undefined> {
    return (await this.open()).get('projects', id)
  }

  async listProjects(): Promise<Project[]> {
    const projects = await (await this.open()).getAll('projects')
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  putProject(project: Project): Promise<void> {
    return this.write((database) => database.put('projects', project))
  }

  /** Deletes the project and the sessions and assets that it owns. */
  async deleteProject(id: string): Promise<void> {
    const db = await this.open()
    const transaction = db.transaction(
      ['projects', 'assets', 'sessions'],
      'readwrite',
    )
    const project = await transaction.objectStore('projects').get(id)
    const sessionStore = transaction.objectStore('sessions')
    const sessions = await sessionStore.index('by-project').getAll(id)
    await this.deleteProjectAssets(
      transaction.objectStore('assets'),
      project,
      sessions,
    )
    await Promise.all(
      sessions.map((session) => sessionStore.delete(session.id)),
    )
    await transaction.objectStore('projects').delete(id)
    await transaction.done
  }

  async getAsset(id: string): Promise<StoredAsset | undefined> {
    return (await this.open()).get('assets', id)
  }

  async getAssets(ids: readonly string[]): Promise<StoredAsset[]> {
    const db = await this.open()
    const transaction = db.transaction('assets')
    const assets = await Promise.all(
      ids.map((id) => transaction.store.get(id)),
    )
    await transaction.done
    return assets.filter((asset): asset is StoredAsset => asset !== undefined)
  }

  putAsset(asset: StoredAsset): Promise<void> {
    return this.write((database) => database.put('assets', asset))
  }

  /** Add a batch and its card order atomically; a failed import leaves no partial cards. */
  async putProjectWithAssets(project: Project, assets: StoredAsset[]): Promise<void> {
    const db = await this.open()
    const transaction = db.transaction(['projects', 'assets'], 'readwrite')
    await Promise.all(assets.map((asset) => transaction.objectStore('assets').put(asset)))
    await transaction.objectStore('projects').put(project)
    await transaction.done
  }

  async deleteAsset(id: string): Promise<void> {
    await (await this.open()).delete('assets', id)
  }

  async getSession(id: string): Promise<SortSession | undefined> {
    return (await this.open()).get('sessions', id)
  }

  async listSessions(projectId: string): Promise<SortSession[]> {
    const sessions = await (await this.open()).getAllFromIndex(
      'sessions',
      'by-project',
      projectId,
    )
    return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  putSession(session: SortSession): Promise<void> {
    return this.write((database) => database.put('sessions', session))
  }

  async deleteSession(id: string): Promise<void> {
    await (await this.open()).delete('sessions', id)
  }

  /** Atomically replaces a project and all data owned by that project. */
  async replaceProjectBundle(bundle: ProjectBundle): Promise<void> {
    const db = await this.open()
    const transaction = db.transaction(
      ['projects', 'assets', 'sessions'],
      'readwrite',
    )
    const projectStore = transaction.objectStore('projects')
    const assetStore = transaction.objectStore('assets')
    const sessionStore = transaction.objectStore('sessions')
    const current = await projectStore.get(bundle.project.id)
    const oldSessions = await sessionStore
      .index('by-project')
      .getAll(bundle.project.id)
    await this.deleteProjectAssets(assetStore, current, oldSessions)
    await Promise.all(
      oldSessions.map((session) => sessionStore.delete(session.id)),
    )
    await Promise.all(bundle.assets.map((asset) => assetStore.put(asset)))
    await Promise.all(bundle.sessions.map((session) => sessionStore.put(session)))
    await projectStore.put(bundle.project)
    await transaction.done
  }

  async close(): Promise<void> {
    const database = this.database
    this.database = undefined
    this.resolvedDatabase = undefined
    if (database) {
      const openDatabase = await database
      openDatabase.close()
    }
  }

  /** Intended for isolated tests and explicit local-data resets. */
  async deleteDatabase(): Promise<void> {
    await this.close()
    await deleteDB(this.dbName)
  }

  private open(): Promise<IDBPDatabase<SwipeSortDatabase>> {
    if (this.resolvedDatabase) return Promise.resolve(this.resolvedDatabase)
    if (this.database) return this.database

    const opening = openDB<SwipeSortDatabase>(this.dbName, 1, {
      upgrade(database) {
        database.createObjectStore('projects', { keyPath: 'id' })
        database.createObjectStore('assets', { keyPath: 'id' })
        const sessions = database.createObjectStore('sessions', {
          keyPath: 'id',
        })
        sessions.createIndex('by-project', 'projectId')
      },
    })
    this.database = opening
    void opening.then(
      (database) => {
        if (this.database === opening) this.resolvedDatabase = database
      },
      () => {
        if (this.database === opening) this.database = undefined
      },
    )
    return opening
  }

  private write(
    operation: (database: IDBPDatabase<SwipeSortDatabase>) => Promise<unknown>,
  ): Promise<void> {
    if (this.resolvedDatabase) {
      try {
        return operation(this.resolvedDatabase).then(() => undefined)
      } catch (error) {
        return Promise.reject(error)
      }
    }
    return this.open()
      .then(operation)
      .then(() => undefined)
  }

  private async deleteProjectAssets<
    TxStores extends ArrayLike<'projects' | 'assets' | 'sessions'>,
  >(
    assetStore: IDBPObjectStore<
      SwipeSortDatabase,
      TxStores,
      'assets',
      'readwrite'
    >,
    project: Project | undefined,
    sessions: readonly SortSession[],
  ): Promise<void> {
    const assetIds = [
      ...(project?.items ?? []),
      ...sessions.flatMap((session) => session.itemSnapshot),
    ].map((item) => item.assetId)
    const uniqueAssetIds = [...new Set(assetIds)]
    const assets = await Promise.all(
      uniqueAssetIds.map((id) => assetStore.get(id)),
    )
    const posterIds = assets.flatMap((asset) =>
      asset?.posterAssetId ? [asset.posterAssetId] : [],
    )
    await Promise.all(
      [...uniqueAssetIds, ...posterIds].map((id) => assetStore.delete(id)),
    )
  }
}

export const swipeSortStorage = new SwipeSortStorage()
