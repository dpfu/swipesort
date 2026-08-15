import type {
  AssignEvent,
  Category,
  InputMethod,
  MediaItem,
  Project,
  ReviewCorrection,
  SessionEvent,
  SortSession,
  SwipeDirection,
  SwipeSample,
} from './types'

export type RecordedAssignment = {
  itemId: string
  categoryId: string
  direction: SwipeDirection
  assignEventId: string
  input: InputMethod
  atMs: number
}

export type ResultAssignment = RecordedAssignment & {
  correctionId?: string
}

export type CreateSortSessionOptions = {
  id: string
  startedAt: string
  cardOrder?: readonly string[]
}

export type CommitAssignmentInput = {
  id: string
  direction: SwipeDirection
  input: InputMethod
  atMs: number
  durationMs: number
  velocityX: number
  samples?: readonly SwipeSample[]
}

export type UndoAssignmentInput = {
  id: string
  atMs: number
}

export type ReviewCorrectionInput = ReviewCorrection

export type ReplayStep = {
  index: number
  total: number
  event: SessionEvent | null
  assignments: RecordedAssignment[]
  nextCardId: string | undefined
  isStart: boolean
  isEnd: boolean
}

function fail(message: string): never {
  throw new Error(message)
}

function assertValidDate(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    fail(`${label} must be a valid date`)
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    fail(`${label} must be a finite, non-negative number`)
  }
}

function assertValidCategories(
  categories: readonly Category[],
): asserts categories is readonly [Category, Category] {
  if (categories.length !== 2) {
    fail('A session requires exactly two categories')
  }

  if (categories[0].id === categories[1].id) {
    fail('Category IDs must be unique')
  }

  if (categories[0].direction === categories[1].direction) {
    fail('A session requires one left and one right category')
  }
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    fail(`${label} must be unique`)
  }
}

function cloneCategory(category: Category): Category {
  return { ...category }
}

function cloneItem(item: MediaItem): MediaItem {
  return { ...item }
}

function assertValidCardOrder(
  itemSnapshot: readonly MediaItem[],
  cardOrder: readonly string[],
): void {
  const itemIds = itemSnapshot.map((item) => item.id)
  assertUnique(itemIds, 'Session item IDs')
  assertUnique(cardOrder, 'Card order item IDs')

  if (
    cardOrder.length !== itemIds.length ||
    cardOrder.some((itemId) => !itemIds.includes(itemId))
  ) {
    fail('Card order must contain every session item exactly once')
  }
}

function cloneEvent(event: SessionEvent): SessionEvent {
  if (event.type === 'undo') {
    return { ...event }
  }

  return {
    ...event,
    samples: event.samples.map((sample) => ({ ...sample })),
  }
}

function categoryForDirection(
  categories: readonly [Category, Category],
  direction: SwipeDirection,
): Category {
  return (
    categories.find((category) => category.direction === direction) ??
    fail(`No category is configured for the ${direction} direction`)
  )
}

function categoryForId(
  categories: readonly [Category, Category],
  categoryId: string,
): Category {
  return (
    categories.find((category) => category.id === categoryId) ??
    fail(`Unknown category: ${categoryId}`)
  )
}

function assertUnusedEventId(session: SortSession, id: string): void {
  if (session.events.some((event) => event.id === id)) {
    fail(`Event ID is already in use: ${id}`)
  }
}

function assertChronologicalEvent(session: SortSession, atMs: number): void {
  const previousEvent = session.events.at(-1)
  if (previousEvent && atMs < previousEvent.atMs) {
    fail('Events must be committed in chronological order')
  }
}

function eventLimit(session: SortSession, count: number): number {
  if (!Number.isFinite(count)) {
    return count > 0 ? session.events.length : 0
  }

  return Math.min(session.events.length, Math.max(0, Math.trunc(count)))
}

function activeAssignmentEvents(
  session: SortSession,
  count: number,
): Map<string, AssignEvent> {
  const activeByItem = new Map<string, AssignEvent>()
  const itemByAssignEvent = new Map<string, string>()

  for (const event of session.events.slice(0, eventLimit(session, count))) {
    if (event.type === 'assign') {
      activeByItem.set(event.itemId, event)
      itemByAssignEvent.set(event.id, event.itemId)
      continue
    }

    const itemId = itemByAssignEvent.get(event.targetEventId)
    if (itemId && activeByItem.get(itemId)?.id === event.targetEventId) {
      activeByItem.delete(itemId)
    }
  }

  return activeByItem
}

function toRecordedAssignment(event: AssignEvent): RecordedAssignment {
  return {
    itemId: event.itemId,
    categoryId: event.categoryId,
    direction: event.direction,
    assignEventId: event.id,
    input: event.input,
    atMs: event.atMs,
  }
}

export function createSortSession(
  project: Project,
  options: CreateSortSessionOptions,
): SortSession {
  assertValidCategories(project.categories)
  assertValidDate(options.startedAt, 'startedAt')

  const itemSnapshot = project.items.map(cloneItem)
  const cardOrder = [
    ...(options.cardOrder ?? itemSnapshot.map((item) => item.id)),
  ]
  assertValidCardOrder(itemSnapshot, cardOrder)

  return {
    version: 1,
    id: options.id,
    projectId: project.id,
    categorySnapshot: [
      cloneCategory(project.categories[0]),
      cloneCategory(project.categories[1]),
    ],
    itemSnapshot,
    cardOrder,
    events: [],
    corrections: [],
    startedAt: options.startedAt,
  }
}

export function deriveRecordedAssignments(
  session: SortSession,
  count = session.events.length,
): RecordedAssignment[] {
  const activeByItem = activeAssignmentEvents(session, count)

  return session.cardOrder.flatMap((itemId) => {
    const event = activeByItem.get(itemId)
    return event ? [toRecordedAssignment(event)] : []
  })
}

export function deriveResultAssignments(
  session: SortSession,
): ResultAssignment[] {
  const assignments = new Map<string, ResultAssignment>(
    deriveRecordedAssignments(session).map((assignment) => [
      assignment.itemId,
      { ...assignment },
    ] as const),
  )

  for (const correction of session.corrections) {
    const assignment = assignments.get(correction.itemId)
    if (!assignment) {
      continue
    }

    const category = categoryForId(
      session.categorySnapshot,
      correction.categoryId,
    )
    assignments.set(correction.itemId, {
      ...assignment,
      categoryId: category.id,
      direction: category.direction,
      correctionId: correction.id,
    })
  }

  return session.cardOrder.flatMap((itemId) => {
    const assignment = assignments.get(itemId)
    return assignment ? [assignment] : []
  })
}

export function getNextCardId(
  session: SortSession,
  count = session.events.length,
): string | undefined {
  const assignedItemIds = new Set(
    deriveRecordedAssignments(session, count).map(
      (assignment) => assignment.itemId,
    ),
  )
  return session.cardOrder.find((itemId) => !assignedItemIds.has(itemId))
}

export function commitAssignment(
  session: SortSession,
  input: CommitAssignmentInput,
): SortSession {
  assertValidCategories(session.categorySnapshot)
  assertUnusedEventId(session, input.id)
  assertFiniteNonNegative(input.atMs, 'atMs')
  assertFiniteNonNegative(input.durationMs, 'durationMs')
  if (!Number.isFinite(input.velocityX)) {
    fail('velocityX must be finite')
  }
  assertChronologicalEvent(session, input.atMs)

  const itemId = getNextCardId(session)
  if (!itemId) {
    fail('There are no cards left to assign')
  }

  const samples = (input.samples ?? []).map((sample) => {
    assertFiniteNonNegative(sample.t, 'sample.t')
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
      fail('Sample coordinates must be finite')
    }
    return { ...sample }
  })
  const category = categoryForDirection(
    session.categorySnapshot,
    input.direction,
  )
  const event: AssignEvent = {
    id: input.id,
    type: 'assign',
    itemId,
    categoryId: category.id,
    direction: category.direction,
    input: input.input,
    atMs: input.atMs,
    durationMs: input.durationMs,
    velocityX: input.velocityX,
    samples,
  }
  const events = [...session.events, event]
  const completedAt =
    deriveRecordedAssignments({ ...session, events }).length ===
    session.cardOrder.length
      ? new Date(Date.parse(session.startedAt) + input.atMs).toISOString()
      : undefined

  return {
    ...session,
    events,
    completedAt,
  }
}

export function undoLastAssignment(
  session: SortSession,
  input: UndoAssignmentInput,
): SortSession {
  assertUnusedEventId(session, input.id)
  assertFiniteNonNegative(input.atMs, 'atMs')
  assertChronologicalEvent(session, input.atMs)

  const activeEventIds = new Set(
    deriveRecordedAssignments(session).map(
      (assignment) => assignment.assignEventId,
    ),
  )
  const targetEvent = session.events
    .toReversed()
    .find(
      (event): event is AssignEvent =>
        event.type === 'assign' && activeEventIds.has(event.id),
    )

  if (!targetEvent) {
    return session
  }

  return {
    ...session,
    events: [
      ...session.events,
      {
        id: input.id,
        type: 'undo',
        targetEventId: targetEvent.id,
        atMs: input.atMs,
      },
    ],
    completedAt: undefined,
  }
}

export function applyReviewCorrection(
  session: SortSession,
  correction: ReviewCorrectionInput,
): SortSession {
  assertValidDate(correction.changedAt, 'changedAt')
  if (
    session.corrections.some(
      (existingCorrection) => existingCorrection.id === correction.id,
    )
  ) {
    fail(`Correction ID is already in use: ${correction.id}`)
  }

  categoryForId(session.categorySnapshot, correction.categoryId)
  const currentAssignment = deriveResultAssignments(session).find(
    (assignment) => assignment.itemId === correction.itemId,
  )
  if (!currentAssignment) {
    fail(`Cannot correct an unassigned card: ${correction.itemId}`)
  }
  if (currentAssignment.categoryId === correction.categoryId) {
    return session
  }

  return {
    ...session,
    corrections: [...session.corrections, { ...correction }],
  }
}

export function clampReplayIndex(
  session: SortSession,
  index: number,
): number {
  return eventLimit(session, index)
}

export function deriveReplayStep(
  session: SortSession,
  requestedIndex: number,
): ReplayStep {
  const index = clampReplayIndex(session, requestedIndex)
  return {
    index,
    total: session.events.length,
    event: index === 0 ? null : cloneEvent(session.events[index - 1]),
    assignments: deriveRecordedAssignments(session, index),
    nextCardId: getNextCardId(session, index),
    isStart: index === 0,
    isEnd: index === session.events.length,
  }
}

export function deriveReplaySteps(session: SortSession): ReplayStep[] {
  return Array.from({ length: session.events.length + 1 }, (_, index) =>
    deriveReplayStep(session, index),
  )
}
