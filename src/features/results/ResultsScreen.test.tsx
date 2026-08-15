import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testCategories, testMedia } from '../testFixtures'
import { ResultsScreen } from './ResultsScreen'

afterEach(cleanup)

describe('ResultsScreen', () => {
  it('switches mobile category tabs and emits corrections without rewriting media', async () => {
    const user = userEvent.setup()
    const items = [testMedia('one', 'First frame'), testMedia('two', 'Second frame')]
    const onMoveItem = vi.fn()
    render(
      <ResultsScreen
        categories={testCategories}
        items={items}
        categoryIdByItemId={{ one: 'quiet', two: 'vivid' }}
        onMoveItem={onMoveItem}
      />,
    )

    expect(screen.getByRole('tabpanel')).toHaveTextContent('First frame')
    await user.click(screen.getByRole('button', { name: 'Move First frame to Vivid' }))
    expect(onMoveItem).toHaveBeenCalledWith('one', 'vivid')

    await user.click(screen.getByRole('tab', { name: /Vivid/ }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Second frame')
  })

  it('moves keyboard focus and selection between both category tabs', async () => {
    const user = userEvent.setup()
    render(
      <ResultsScreen
        categories={testCategories}
        items={[testMedia('one', 'First frame'), testMedia('two', 'Second frame')]}
        categoryIdByItemId={{ one: 'quiet', two: 'vivid' }}
        onMoveItem={vi.fn()}
      />,
    )

    const quiet = screen.getByRole('tab', { name: /Quiet/ })
    const vivid = screen.getByRole('tab', { name: /Vivid/ })
    quiet.focus()
    await user.keyboard('{ArrowRight}')

    expect(vivid).toHaveFocus()
    expect(vivid).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Second frame')
  })
})
