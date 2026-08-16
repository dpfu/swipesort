import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { testCategories, testMedia } from '../testFixtures'
import { SortScreen } from './SortScreen'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

afterEach(cleanup)

describe('SortScreen', () => {
  it('never reports completion while the pending card media is loading', () => {
    render(
      <SortScreen
        categories={testCategories}
        current={undefined}
        index={1}
        total={3}
        canUndo
        isLoadingCurrent
        onAssign={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Loading this card…' })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Every card has a place.' }),
    ).not.toBeInTheDocument()
  })

  it('commits the named button choice and keeps Undo available', async () => {
    const user = userEvent.setup()
    const onAssign = vi.fn()
    const onUndo = vi.fn()
    render(
      <SortScreen
        categories={testCategories}
        current={testMedia('one', 'First frame')}
        index={1}
        total={3}
        canUndo
        onAssign={onAssign}
        onUndo={onUndo}
      />,
    )

    expect(document.querySelector('.ss-sort__count')).toHaveTextContent('1 of 3 sorted')
    expect(screen.getByRole('progressbar', { name: 'Cards sorted' })).toHaveAttribute(
      'aria-valuetext',
      '1 of 3 cards sorted',
    )
    await user.click(screen.getByRole('button', { name: 'Sort into Quiet' }))
    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce())
    expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ direction: 'left', input: 'button' }))

    await user.click(screen.getByRole('button', { name: 'Undo last' }))
    expect(onUndo).toHaveBeenCalledOnce()
  })

  it('supports arrow-key sorting and Z to undo without gesture input', async () => {
    const onAssign = vi.fn()
    const onUndo = vi.fn()
    render(
      <SortScreen
        categories={testCategories}
        current={testMedia('one', 'First frame')}
        index={0}
        total={2}
        canUndo
        onAssign={onAssign}
        onUndo={onUndo}
      />,
    )

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce())
    expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ direction: 'right', input: 'keyboard' }))

    fireEvent.keyDown(window, { key: 'z' })
    expect(onUndo).toHaveBeenCalledOnce()
  })

  it('offers one clear action when every card is sorted', async () => {
    const user = userEvent.setup()
    const onExit = vi.fn()
    render(
      <SortScreen
        categories={testCategories}
        index={2}
        total={2}
        canUndo
        onAssign={vi.fn()}
        onUndo={vi.fn()}
        onExit={onExit}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Every card has a place.' })).toBeVisible()
    const reviewResult = screen.getByRole('button', { name: 'Review result' })
    await waitFor(() => expect(reviewResult).toHaveFocus())
    await user.click(reviewResult)
    expect(onExit).toHaveBeenCalledOnce()
  })
})
