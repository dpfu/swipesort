import { describe, expect, it } from 'vitest'
import {
  applyReviewCorrection,
  clampReplayIndex,
  commitAssignment,
  createSortSession,
  deriveRecordedAssignments,
  deriveReplayStep,
  deriveReplaySteps,
  deriveResultAssignments,
  getNextCardId,
  undoLastAssignment,
} from './session'
import type { Project, SortSession } from './types'

const project: Project = {
  version: 1,
  id: 'project-1',
  name: 'Field notes',
  categories: [
    {
      id: 'keep',
      name: 'Keep',
      direction: 'right',
      color: '#496f5d',
    },
    {
      id: 'leave',
      name: 'Leave',
      direction: 'left',
      color: '#b26555',
    },
  ],
  items: [
    {
      id: 'card-a',
      assetId: 'asset-a',
      title: 'Card A',
      createdAt: '2026-08-15T10:00:00.000Z',
    },
    {
      id: 'card-b',
      assetId: 'asset-b',
      title: 'Card B',
      createdAt: '2026-08-15T10:00:01.000Z',
    },
  ],
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T10:00:01.000Z',
}

function createSession(): SortSession {
  return createSortSession(project, {
    id: 'session-1',
    startedAt: '2026-08-15T12:00:00.000Z',
  })
}

function assign(
  session: SortSession,
  id: string,
  direction: 'left' | 'right',
  atMs: number,
): SortSession {
  return commitAssignment(session, {
    id,
    direction,
    input: 'pointer',
    atMs,
    durationMs: 180,
    velocityX: direction === 'left' ? -720 : 720,
    samples: [
      { t: 0, x: 0, y: 0 },
      { t: 180, x: direction === 'left' ? -160 : 160, y: 4 },
    ],
  })
}

describe('session creation', () => {
  it('snapshots the two categories and all cards without retaining project arrays', () => {
    const session = createSession()

    expect(session).toMatchObject({
      version: 1,
      id: 'session-1',
      projectId: 'project-1',
      itemSnapshot: project.items,
      cardOrder: ['card-a', 'card-b'],
      events: [],
      corrections: [],
      startedAt: '2026-08-15T12:00:00.000Z',
    })
    expect(session.categorySnapshot).toEqual(project.categories)
    expect(session.categorySnapshot).not.toBe(project.categories)
    expect(session.categorySnapshot[0]).not.toBe(project.categories[0])
    expect(session.itemSnapshot).not.toBe(project.items)
    expect(session.itemSnapshot[0]).not.toBe(project.items[0])
  })

  it('keeps card metadata stable when the live project changes', () => {
    const mutableProject: Project = {
      ...project,
      items: project.items.map((item) => ({ ...item })),
    }
    const session = createSortSession(mutableProject, {
      id: 'stable-items',
      startedAt: '2026-08-15T12:00:00.000Z',
    })

    mutableProject.items[0].title = 'Changed after sorting started'
    mutableProject.items.push({
      id: 'card-c',
      assetId: 'asset-c',
      title: 'Added later',
      createdAt: '2026-08-15T12:01:00.000Z',
    })

    expect(session.itemSnapshot.map(({ id, title }) => ({ id, title }))).toEqual(
      [
        { id: 'card-a', title: 'Card A' },
        { id: 'card-b', title: 'Card B' },
      ],
    )
    expect(session.cardOrder).toEqual(['card-a', 'card-b'])
  })

  it('accepts a complete custom card order and rejects incomplete orders', () => {
    expect(
      createSortSession(project, {
        id: 'shuffled',
        startedAt: '2026-08-15T12:00:00.000Z',
        cardOrder: ['card-b', 'card-a'],
      }).cardOrder,
    ).toEqual(['card-b', 'card-a'])

    expect(() =>
      createSortSession(project, {
        id: 'incomplete',
        startedAt: '2026-08-15T12:00:00.000Z',
        cardOrder: ['card-a'],
      }),
    ).toThrow('every session item exactly once')

    expect(() =>
      createSortSession(project, {
        id: 'unknown-card',
        startedAt: '2026-08-15T12:00:00.000Z',
        cardOrder: ['card-a', 'not-in-snapshot'],
      }),
    ).toThrow('every session item exactly once')
  })

  it('rejects category pairs that do not cover both directions', () => {
    const invalidProject = {
      ...project,
      categories: [
        project.categories[0],
        { ...project.categories[1], direction: 'right' as const },
      ] as Project['categories'],
    }

    expect(() =>
      createSortSession(invalidProject, {
        id: 'invalid',
        startedAt: '2026-08-15T12:00:00.000Z',
      }),
    ).toThrow('one left and one right category')
  })
})

describe('assign and undo events', () => {
  it('assigns only the next card and completes after the final assignment', () => {
    const initial = createSession()
    const first = assign(initial, 'assign-a', 'left', 1_000)
    const completed = assign(first, 'assign-b', 'right', 2_000)

    expect(getNextCardId(initial)).toBe('card-a')
    expect(getNextCardId(first)).toBe('card-b')
    expect(getNextCardId(completed)).toBeUndefined()
    expect(deriveRecordedAssignments(completed)).toEqual([
      {
        itemId: 'card-a',
        categoryId: 'leave',
        direction: 'left',
        assignEventId: 'assign-a',
        input: 'pointer',
        atMs: 1_000,
      },
      {
        itemId: 'card-b',
        categoryId: 'keep',
        direction: 'right',
        assignEventId: 'assign-b',
        input: 'pointer',
        atMs: 2_000,
      },
    ])
    expect(completed.completedAt).toBe('2026-08-15T12:00:02.000Z')
    expect(initial.events).toEqual([])
    expect(first.events).toHaveLength(1)
  })

  it('appends an undo event, reopens completion, and makes that card next', () => {
    const completed = assign(
      assign(createSession(), 'assign-a', 'left', 1_000),
      'assign-b',
      'right',
      2_000,
    )
    const undone = undoLastAssignment(completed, {
      id: 'undo-b',
      atMs: 2_100,
    })

    expect(undone.events).toHaveLength(3)
    expect(undone.events[2]).toEqual({
      id: 'undo-b',
      type: 'undo',
      targetEventId: 'assign-b',
      atMs: 2_100,
    })
    expect(deriveRecordedAssignments(undone).map(({ itemId }) => itemId)).toEqual(
      ['card-a'],
    )
    expect(getNextCardId(undone)).toBe('card-b')
    expect(undone.completedAt).toBeUndefined()
    expect(completed.events).toHaveLength(2)
  })

  it('returns the same session when there is nothing to undo', () => {
    const session = createSession()
    expect(
      undoLastAssignment(session, { id: 'unused', atMs: 100 }),
    ).toBe(session)
  })

  it('rejects duplicate IDs, invalid values, and assignments after completion', () => {
    const first = assign(createSession(), 'assign-a', 'left', 1_000)
    expect(() => assign(first, 'assign-a', 'right', 2_000)).toThrow(
      'already in use',
    )
    expect(() =>
      commitAssignment(first, {
        id: 'invalid-velocity',
        direction: 'right',
        input: 'button',
        atMs: 2_000,
        durationMs: 0,
        velocityX: Number.NaN,
      }),
    ).toThrow('velocityX must be finite')

    const completed = assign(first, 'assign-b', 'right', 2_000)
    expect(() => assign(completed, 'assign-c', 'left', 3_000)).toThrow(
      'no cards left',
    )
  })
})

describe('review corrections', () => {
  it('changes result membership without changing recorded assignments or events', () => {
    const completed = assign(
      assign(createSession(), 'assign-a', 'left', 1_000),
      'assign-b',
      'right',
      2_000,
    )
    const corrected = applyReviewCorrection(completed, {
      id: 'correction-a',
      itemId: 'card-a',
      categoryId: 'keep',
      changedAt: '2026-08-15T12:01:00.000Z',
    })

    expect(deriveRecordedAssignments(corrected)[0].categoryId).toBe('leave')
    expect(deriveResultAssignments(corrected)[0]).toMatchObject({
      itemId: 'card-a',
      categoryId: 'keep',
      direction: 'right',
      correctionId: 'correction-a',
    })
    expect(corrected.events).toBe(completed.events)
    expect(completed.corrections).toEqual([])
  })

  it('allows a later correction to restore the recorded category', () => {
    const completed = assign(
      assign(createSession(), 'assign-a', 'left', 1_000),
      'assign-b',
      'right',
      2_000,
    )
    const moved = applyReviewCorrection(completed, {
      id: 'move-a',
      itemId: 'card-a',
      categoryId: 'keep',
      changedAt: '2026-08-15T12:01:00.000Z',
    })
    const restored = applyReviewCorrection(moved, {
      id: 'restore-a',
      itemId: 'card-a',
      categoryId: 'leave',
      changedAt: '2026-08-15T12:02:00.000Z',
    })

    expect(restored.corrections).toHaveLength(2)
    expect(deriveResultAssignments(restored)[0]).toMatchObject({
      categoryId: 'leave',
      correctionId: 'restore-a',
    })
    expect(deriveRecordedAssignments(restored)[0].categoryId).toBe('leave')
  })

  it('returns the same session for a no-op and rejects unassigned cards', () => {
    const first = assign(createSession(), 'assign-a', 'left', 1_000)
    expect(
      applyReviewCorrection(first, {
        id: 'same-category',
        itemId: 'card-a',
        categoryId: 'leave',
        changedAt: '2026-08-15T12:01:00.000Z',
      }),
    ).toBe(first)
    expect(() =>
      applyReviewCorrection(first, {
        id: 'unassigned',
        itemId: 'card-b',
        categoryId: 'keep',
        changedAt: '2026-08-15T12:01:00.000Z',
      }),
    ).toThrow('unassigned card')
  })
})

describe('replay derivation', () => {
  it('derives every immutable event step including undo', () => {
    const first = assign(createSession(), 'assign-a', 'left', 1_000)
    const second = assign(first, 'assign-b', 'right', 2_000)
    const session = undoLastAssignment(second, {
      id: 'undo-b',
      atMs: 2_100,
    })
    const corrected = applyReviewCorrection(session, {
      id: 'correction-a',
      itemId: 'card-a',
      categoryId: 'keep',
      changedAt: '2026-08-15T12:01:00.000Z',
    })
    const steps = deriveReplaySteps(corrected)

    expect(steps).toHaveLength(4)
    expect(steps[0]).toMatchObject({
      index: 0,
      event: null,
      nextCardId: 'card-a',
      isStart: true,
      isEnd: false,
    })
    expect(steps[1].assignments.map(({ itemId }) => itemId)).toEqual(['card-a'])
    expect(steps[2].assignments.map(({ itemId }) => itemId)).toEqual([
      'card-a',
      'card-b',
    ])
    expect(steps[3]).toMatchObject({
      index: 3,
      nextCardId: 'card-b',
      isStart: false,
      isEnd: true,
    })
    expect(steps[3].assignments.map(({ categoryId }) => categoryId)).toEqual([
      'leave',
    ])
  })

  it('clamps scrub positions and does not expose mutable session events', () => {
    const session = assign(createSession(), 'assign-a', 'left', 1_000)

    expect(clampReplayIndex(session, -3)).toBe(0)
    expect(clampReplayIndex(session, 42)).toBe(1)
    expect(clampReplayIndex(session, Number.NaN)).toBe(0)
    expect(deriveReplayStep(session, -3).isStart).toBe(true)

    const step = deriveReplayStep(session, 1)
    expect(step.event).not.toBe(session.events[0])
    if (step.event?.type === 'assign') {
      step.event.samples[0].x = 999
    }
    expect(
      session.events[0].type === 'assign' && session.events[0].samples[0].x,
    ).toBe(0)
  })
})
