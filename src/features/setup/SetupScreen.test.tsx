import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testCategories, testMedia } from '../testFixtures'
import { SetupScreen, type SetupScreenProps } from './SetupScreen'

afterEach(cleanup)

function props(overrides: Partial<SetupScreenProps> = {}): SetupScreenProps {
  return {
    projectName: 'Visual study',
    categories: testCategories,
    items: [],
    onProjectNameChange: vi.fn(),
    onCategoryNameChange: vi.fn(),
    onFilesSelected: vi.fn(),
    onRemoveItem: vi.fn(),
    onMoveItem: vi.fn(),
    onStart: vi.fn(),
    ...overrides,
  }
}

describe('SetupScreen', () => {
  it('offers a deterministic demo before any local media is added', async () => {
    const user = userEvent.setup()
    const onLoadDemo = vi.fn()
    render(<SetupScreen {...props({ onLoadDemo })} />)

    await user.click(screen.getByRole('button', { name: 'Try demo set' }))

    expect(onLoadDemo).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Choose media' })).toBeEnabled()
    expect(document.querySelector('input[type="file"]')).toHaveAttribute(
      'accept',
      'image/*,video/*',
    )
    expect(screen.getByRole('button', { name: 'Start sorting' })).toBeDisabled()
  })

  it('exposes explicit reorder, remove, and start actions for a ready set', async () => {
    const user = userEvent.setup()
    const media = [testMedia('one', 'First frame'), testMedia('two', 'Second frame')]
    const onMoveItem = vi.fn()
    const onRemoveItem = vi.fn()
    const onStart = vi.fn()
    render(<SetupScreen {...props({ items: media, onMoveItem, onRemoveItem, onStart })} />)

    await user.click(screen.getByRole('button', { name: 'Move Second frame earlier' }))
    await user.click(screen.getByRole('button', { name: 'Remove First frame' }))
    await user.click(screen.getByRole('button', { name: 'Start sorting' }))

    expect(onMoveItem).toHaveBeenCalledWith('two', 'up')
    expect(onRemoveItem).toHaveBeenCalledWith('one')
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('locks concurrent setup mutations while media is being prepared', () => {
    render(
      <SetupScreen
        {...props({
          items: [
            testMedia('one', 'First frame'),
            testMedia('two', 'Second frame'),
          ],
          isImporting: true,
        })}
      />,
    )

    expect(screen.getByLabelText('Project name')).toBeDisabled()
    expect(screen.getByLabelText('Swipe left')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove First frame' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Second frame earlier' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Start sorting' })).toBeDisabled()
  })
})
