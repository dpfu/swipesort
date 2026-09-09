import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testCategories, testMedia } from '../testFixtures'
import type { SwipeCommit } from '../types'

const animationControls = vi.hoisted(() => ({
  mount: vi.fn(() => vi.fn()),
  set: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
}))

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>()
  return {
    ...actual,
    useAnimationControls: () => animationControls,
    useReducedMotion: () => false,
  }
})

import { SortScreen } from './SortScreen'

afterEach(cleanup)

function deferred() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe('SortScreen commit handoff', () => {
  let animation: ReturnType<typeof deferred>

  beforeEach(() => {
    vi.clearAllMocks()
    animation = deferred()
    animationControls.start.mockImplementation(() => animation.promise)
  })

  it('waits for persistence before the flyout and keeps conflicting actions locked throughout', async () => {
    const first = testMedia('one', 'First frame')
    const second = testMedia('two', 'Second frame')
    const persistence = deferred()
    const onAssign = vi.fn()
    const onUndo = vi.fn()
    const onExit = vi.fn()

    function Harness() {
      const [current, setCurrent] = useState(first)
      const [index, setIndex] = useState(0)

      async function assign(commit: SwipeCommit) {
        onAssign(commit)
        await persistence.promise
        setCurrent(second)
        setIndex(1)
      }

      return (
        <SortScreen
          categories={testCategories}
          current={current}
          index={index}
          total={2}
          canUndo
          onAssign={assign}
          onUndo={onUndo}
          onExit={onExit}
        />
      )
    }

    render(<Harness />)
    const leftChoice = screen.getByRole('button', { name: 'Sort into Quiet' })

    fireEvent.click(leftChoice)

    expect(onAssign).toHaveBeenCalledOnce()
    expect(onAssign).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'left', input: 'button' }),
    )
    expect(animationControls.start).not.toHaveBeenCalled()
    expect(screen.getByRole('article', { name: 'Sort First frame' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Sort Second frame' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sort into Quiet' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Undo last' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back to setup' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Sort into Vivid' }))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'z' })
    fireEvent.click(screen.getByRole('button', { name: 'Back to setup' }))

    expect(onAssign).toHaveBeenCalledOnce()
    expect(onUndo).not.toHaveBeenCalled()
    expect(onExit).not.toHaveBeenCalled()

    await act(async () => {
      persistence.resolve()
      await persistence.promise
      await Promise.resolve()
    })

    expect(animationControls.start).toHaveBeenCalledOnce()
    expect(onAssign.mock.invocationCallOrder[0]).toBeLessThan(
      animationControls.start.mock.invocationCallOrder[0],
    )
    expect(screen.getByRole('article', { name: 'Sort First frame' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Sort Second frame' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo last' })).toBeDisabled()

    await act(async () => {
      animation.resolve()
      await animation.promise
      await Promise.resolve()
    })

    expect(screen.getByRole('article', { name: 'Sort Second frame' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sort into Quiet' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Undo last' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Back to setup' })).toBeEnabled()
  })

  it('restores the same card and unlocks controls when persistence rejects', async () => {
    const persistence = deferred()
    const failure = new Error('IndexedDB write failed')
    const reportError = vi.fn()
    const onAssign = vi.fn(async () => {
      try {
        await persistence.promise
      } catch (cause) {
        reportError(cause)
        throw cause
      }
    })
    const onUndo = vi.fn()
    const onExit = vi.fn()

    render(
      <SortScreen
        categories={testCategories}
        current={testMedia('one', 'First frame')}
        index={0}
        total={2}
        canUndo
        onAssign={onAssign}
        onUndo={onUndo}
        onExit={onExit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sort into Quiet' }))
    expect(screen.getByRole('button', { name: 'Undo last' })).toBeDisabled()

    await act(async () => {
      persistence.reject(failure)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(reportError).toHaveBeenCalledWith(failure)
    expect(animationControls.start).not.toHaveBeenCalled()
    expect(screen.getByRole('article', { name: 'Sort First frame' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sort into Quiet' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Undo last' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Back to setup' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Undo last' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to setup' }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(onExit).toHaveBeenCalledOnce()
  })
})
