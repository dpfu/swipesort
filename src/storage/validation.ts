import { parseTikTokUrl } from '../media/tiktok'
import type {
  Category,
  MediaAsset,
  MediaItem,
  Project,
  ReviewCorrection,
  SessionEvent,
  SortSession,
  SwipeSample,
} from '../domain/types'

export type ArchiveAsset = {
  metadata: MediaAsset
  path: string
}

export type ArchiveManifest = {
  format: 'swipesort-project'
  version: 1 | 2
  exportedAt: string
  project: Project
  assets: ArchiveAsset[]
  sessions: SortSession[]
}

export class ArchiveValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArchiveValidationError'
  }
}

const idPattern = /^[A-Za-z0-9_-]{1,128}$/

function fail(path: string, detail: string): never {
  throw new ArchiveValidationError(`${path}: ${detail}`)
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'expected an object')
  }
  return value as Record<string, unknown>
}

function string(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    fail(path, 'expected a non-empty string')
  }
  return value
}

function id(value: unknown, path: string): string {
  const result = string(value, path)
  if (!idPattern.test(result)) {
    fail(path, 'contains unsupported characters')
  }
  return result
}

function date(value: unknown, path: string): string {
  const result = string(value, path)
  const parsed = new Date(result)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== result) {
    fail(path, 'expected an ISO date')
  }
  return result
}

function finiteNumber(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    fail(path, `expected a finite number >= ${minimum}`)
  }
  return value
}

function integer(value: unknown, path: string, minimum = 0): number {
  const result = finiteNumber(value, path, minimum)
  if (!Number.isInteger(result)) {
    fail(path, 'expected an integer')
  }
  return result
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(path, 'expected an array')
  }
  return value
}

function optionalId(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : id(value, path)
}

function optionalDate(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : date(value, path)
}

function assertUnique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) {
    fail(path, 'contains duplicate IDs')
  }
}

function category(value: unknown, path: string): Category {
  const source = record(value, path)
  const direction = source.direction
  if (direction !== 'left' && direction !== 'right') {
    fail(`${path}.direction`, 'expected left or right')
  }
  return {
    id: id(source.id, `${path}.id`),
    name: string(source.name, `${path}.name`),
    direction,
    color: string(source.color, `${path}.color`),
  }
}

function categories(value: unknown, path: string): [Category, Category] {
  const source = array(value, path)
  if (source.length !== 2) {
    fail(path, 'expected exactly two categories')
  }
  const result: [Category, Category] = [
    category(source[0], `${path}[0]`),
    category(source[1], `${path}[1]`),
  ]
  assertUnique(result.map((entry) => entry.id), path)
  if (new Set(result.map((entry) => entry.direction)).size !== 2) {
    fail(path, 'must contain one left and one right category')
  }
  return result
}

function item(value: unknown, path: string): MediaItem {
  const source = record(value, path)
  return {
    id: id(source.id, `${path}.id`),
    assetId: id(source.assetId, `${path}.assetId`),
    title: string(source.title, `${path}.title`, true),
    createdAt: date(source.createdAt, `${path}.createdAt`),
  }
}

function project(value: unknown, path: string): Project {
  const source = record(value, path)
  if (source.version !== 1) {
    fail(`${path}.version`, 'expected version 1')
  }
  const items = array(source.items, `${path}.items`).map((entry, index) =>
    item(entry, `${path}.items[${index}]`),
  )
  assertUnique(items.map((entry) => entry.id), `${path}.items`)
  return {
    version: 1,
    id: id(source.id, `${path}.id`),
    name: string(source.name, `${path}.name`),
    categories: categories(source.categories, `${path}.categories`),
    items,
    activeSessionId: optionalId(
      source.activeSessionId,
      `${path}.activeSessionId`,
    ),
    createdAt: date(source.createdAt, `${path}.createdAt`),
    updatedAt: date(source.updatedAt, `${path}.updatedAt`),
  }
}

function mediaAsset(value: unknown, path: string): MediaAsset {
  const source = record(value, path)
  if (source.kind === 'tiktok') {
    const link = record(source.tiktok, `${path}.tiktok`)
    let parsed
    try { parsed = parseTikTokUrl(string(link.url, `${path}.tiktok.url`)) }
    catch { fail(`${path}.tiktok`, 'expected a full TikTok video URL') }
    if (parsed.url !== link.url || parsed.videoId !== link.videoId) {
      fail(`${path}.tiktok`, 'URL and video ID must be canonical and match')
    }
    if (source.mimeType !== 'text/uri-list' || source.posterAssetId !== undefined || source.durationMs !== undefined) {
      fail(path, 'invalid TikTok link metadata')
    }
    const size = new TextEncoder().encode(parsed.url).length
    if (source.size !== size || source.width !== 9 || source.height !== 16) {
      fail(path, 'invalid TikTok link size or aspect ratio')
    }
    return { id: id(source.id, `${path}.id`), kind: 'tiktok', tiktok: parsed,
      fileName: string(source.fileName, `${path}.fileName`), mimeType: 'text/uri-list',
      size, width: 9, height: 16, createdAt: date(source.createdAt, `${path}.createdAt`) }
  }
  if (source.kind !== 'image' && source.kind !== 'video') {
    fail(`${path}.kind`, 'expected image or video')
  }
  const mimeType = string(source.mimeType, `${path}.mimeType`)
  if (!mimeType.startsWith(`${source.kind}/`)) {
    fail(`${path}.mimeType`, `does not match kind ${source.kind}`)
  }
  const durationMs =
    source.durationMs === undefined
      ? undefined
      : finiteNumber(source.durationMs, `${path}.durationMs`)
  if (source.kind === 'video' && durationMs === undefined) {
    fail(`${path}.durationMs`, 'is required for video assets')
  }
  return {
    id: id(source.id, `${path}.id`),
    kind: source.kind,
    fileName: string(source.fileName, `${path}.fileName`),
    mimeType,
    size: integer(source.size, `${path}.size`),
    width: integer(source.width, `${path}.width`, 1),
    height: integer(source.height, `${path}.height`, 1),
    durationMs,
    posterAssetId: optionalId(source.posterAssetId, `${path}.posterAssetId`),
    createdAt: date(source.createdAt, `${path}.createdAt`),
  }
}

function sample(value: unknown, path: string): SwipeSample {
  const source = record(value, path)
  return {
    t: finiteNumber(source.t, `${path}.t`),
    x: finiteNumber(source.x, `${path}.x`, -Number.MAX_VALUE),
    y: finiteNumber(source.y, `${path}.y`, -Number.MAX_VALUE),
  }
}

function sessionEvent(value: unknown, path: string): SessionEvent {
  const source = record(value, path)
  const eventId = id(source.id, `${path}.id`)
  if (source.type === 'undo') {
    return {
      id: eventId,
      type: 'undo',
      targetEventId: id(source.targetEventId, `${path}.targetEventId`),
      atMs: finiteNumber(source.atMs, `${path}.atMs`),
    }
  }
  if (source.type !== 'assign') {
    fail(`${path}.type`, 'expected assign or undo')
  }
  if (source.direction !== 'left' && source.direction !== 'right') {
    fail(`${path}.direction`, 'expected left or right')
  }
  if (
    source.input !== 'pointer' &&
    source.input !== 'button' &&
    source.input !== 'keyboard'
  ) {
    fail(`${path}.input`, 'expected pointer, button, or keyboard')
  }
  return {
    id: eventId,
    type: 'assign',
    itemId: id(source.itemId, `${path}.itemId`),
    categoryId: id(source.categoryId, `${path}.categoryId`),
    direction: source.direction,
    input: source.input,
    atMs: finiteNumber(source.atMs, `${path}.atMs`),
    durationMs: finiteNumber(source.durationMs, `${path}.durationMs`),
    velocityX: finiteNumber(
      source.velocityX,
      `${path}.velocityX`,
      -Number.MAX_VALUE,
    ),
    samples: array(source.samples, `${path}.samples`).map((entry, index) =>
      sample(entry, `${path}.samples[${index}]`),
    ),
  }
}

function correction(value: unknown, path: string): ReviewCorrection {
  const source = record(value, path)
  return {
    id: id(source.id, `${path}.id`),
    itemId: id(source.itemId, `${path}.itemId`),
    categoryId: id(source.categoryId, `${path}.categoryId`),
    changedAt: date(source.changedAt, `${path}.changedAt`),
  }
}

function session(value: unknown, path: string): SortSession {
  const source = record(value, path)
  if (source.version !== 1) {
    fail(`${path}.version`, 'expected version 1')
  }
  const events = array(source.events, `${path}.events`).map((entry, index) =>
    sessionEvent(entry, `${path}.events[${index}]`),
  )
  const corrections = array(source.corrections, `${path}.corrections`).map(
    (entry, index) => correction(entry, `${path}.corrections[${index}]`),
  )
  const itemSnapshot = array(source.itemSnapshot, `${path}.itemSnapshot`).map(
    (entry, index) => item(entry, `${path}.itemSnapshot[${index}]`),
  )
  const cardOrder = array(source.cardOrder, `${path}.cardOrder`).map(
    (entry, index) => id(entry, `${path}.cardOrder[${index}]`),
  )
  assertUnique(
    itemSnapshot.map((entry) => entry.id),
    `${path}.itemSnapshot`,
  )
  assertUnique(cardOrder, `${path}.cardOrder`)
  assertUnique(events.map((entry) => entry.id), `${path}.events`)
  assertUnique(corrections.map((entry) => entry.id), `${path}.corrections`)
  return {
    version: 1,
    id: id(source.id, `${path}.id`),
    projectId: id(source.projectId, `${path}.projectId`),
    categorySnapshot: categories(
      source.categorySnapshot,
      `${path}.categorySnapshot`,
    ),
    itemSnapshot,
    cardOrder,
    events,
    corrections,
    startedAt: date(source.startedAt, `${path}.startedAt`),
    completedAt: optionalDate(source.completedAt, `${path}.completedAt`),
  }
}

function archiveAsset(value: unknown, path: string): ArchiveAsset {
  const source = record(value, path)
  const metadata = mediaAsset(source.metadata, `${path}.metadata`)
  const archivePath = string(source.path, `${path}.path`)
  if (archivePath !== `assets/${metadata.id}`) {
    fail(`${path}.path`, 'does not match its asset ID')
  }
  return { metadata, path: archivePath }
}

export function validateArchiveManifest(value: unknown): ArchiveManifest {
  const source = record(value, 'manifest')
  if (source.format !== 'swipesort-project') {
    fail('manifest.format', 'expected swipesort-project')
  }
  if (source.version !== 1 && source.version !== 2) {
    fail('manifest.version', 'expected version 1 or 2')
  }
  const result: ArchiveManifest = {
    format: 'swipesort-project',
    version: source.version,
    exportedAt: date(source.exportedAt, 'manifest.exportedAt'),
    project: project(source.project, 'manifest.project'),
    assets: array(source.assets, 'manifest.assets').map((entry, index) =>
      archiveAsset(entry, `manifest.assets[${index}]`),
    ),
    sessions: array(source.sessions, 'manifest.sessions').map((entry, index) =>
      session(entry, `manifest.sessions[${index}]`),
    ),
  }
  if (result.version === 1 && result.assets.some((entry) => entry.metadata.kind === 'tiktok')) {
    fail('manifest.version', 'TikTok links require version 2')
  }
  validateReferences(result)
  return result
}

function validateReferences(manifest: ArchiveManifest): void {
  const assetIds = manifest.assets.map((entry) => entry.metadata.id)
  const sessionIdList = manifest.sessions.map((entry) => entry.id)
  const sessionIds = new Set(sessionIdList)
  const assetMap = new Map(
    manifest.assets.map((entry) => [entry.metadata.id, entry.metadata]),
  )
  assertUnique(assetIds, 'manifest.assets')
  assertUnique(
    manifest.assets.map((entry) => entry.path),
    'manifest.assets paths',
  )
  assertUnique(sessionIdList, 'manifest.sessions')

  for (const entry of manifest.project.items) {
    if (!assetMap.has(entry.assetId)) {
      fail('manifest.project.items', `missing asset ${entry.assetId}`)
    }
  }
  for (const asset of assetMap.values()) {
    if (asset.posterAssetId) {
      const poster = assetMap.get(asset.posterAssetId)
      if (!poster || poster.kind !== 'image') {
        fail('manifest.assets', `missing image poster ${asset.posterAssetId}`)
      }
    }
  }
  if (
    manifest.project.activeSessionId &&
    !sessionIds.has(manifest.project.activeSessionId)
  ) {
    fail('manifest.project.activeSessionId', 'references a missing session')
  }

  for (const currentSession of manifest.sessions) {
    if (currentSession.projectId !== manifest.project.id) {
      fail(`session ${currentSession.id}`, 'belongs to another project')
    }
    const sessionItems = new Map(
      currentSession.itemSnapshot.map((entry) => [entry.id, entry]),
    )
    const cardIds = new Set(currentSession.cardOrder)
    if (
      cardIds.size !== sessionItems.size ||
      [...cardIds].some((itemId) => !sessionItems.has(itemId))
    ) {
      fail(
        `session ${currentSession.id}.cardOrder`,
        'must contain every snapshot item exactly once',
      )
    }
    for (const currentItem of sessionItems.values()) {
      if (!assetMap.has(currentItem.assetId)) {
        fail(
          `session ${currentSession.id}.itemSnapshot`,
          `missing asset ${currentItem.assetId}`,
        )
      }
    }
    const categoriesById = new Map(
      currentSession.categorySnapshot.map((entry) => [entry.id, entry]),
    )
    const assignments = new Set<string>()
    for (const event of currentSession.events) {
      if (event.type === 'assign') {
        if (!cardIds.has(event.itemId)) {
          fail(`session ${currentSession.id}.events`, `missing item ${event.itemId}`)
        }
        const destination = categoriesById.get(event.categoryId)
        if (!destination || destination.direction !== event.direction) {
          fail(
            `session ${currentSession.id}.events`,
            `invalid category ${event.categoryId}`,
          )
        }
        assignments.add(event.id)
      } else if (!assignments.has(event.targetEventId)) {
        fail(
          `session ${currentSession.id}.events`,
          `undo target ${event.targetEventId} is not an earlier assignment`,
        )
      }
    }
    for (const currentCorrection of currentSession.corrections) {
      if (
        !cardIds.has(currentCorrection.itemId) ||
        !categoriesById.has(currentCorrection.categoryId)
      ) {
        fail(`session ${currentSession.id}.corrections`, 'has an invalid reference')
      }
    }
  }
}
