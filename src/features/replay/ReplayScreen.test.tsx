import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testCategories, testMedia } from '../testFixtures'
import { ReplayScreen } from './ReplayScreen'

afterEach(cleanup)

describe('ReplayScreen', () => {
  it('renders immutable frames and exposes playback navigation only', async () => {
    const user = userEvent.setup()
    const onStepChange = vi.fn()
    const onTogglePlaying = vi.fn()
    render(
      <ReplayScreen
        categories={testCategories}
        frames={[
          { item: testMedia('one', 'First frame'), categoryId: 'quiet', direction: 'left', atMs: 850, undone: true },
          { item: testMedia('two', 'Second frame'), categoryId: 'vivid', direction: 'right', atMs: 1_600 },
        ]}
        stepIndex={1}
        isPlaying={false}
        onStepChange={onStepChange}
        onTogglePlaying={onTogglePlaying}
      />,
    )

    expect(screen.getByText('Quiet · 0.9s')).toBeInTheDocument()
    expect(screen.getByText('Later undone')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Move/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next replay step' }))
    expect(onStepChange).toHaveBeenCalledWith(2)
    await user.click(screen.getByRole('button', { name: 'Play replay' }))
    expect(onTogglePlaying).toHaveBeenCalledOnce()

    fireEvent.change(screen.getByRole('slider', { name: 'Replay position' }), { target: { value: '0' } })
    expect(onStepChange).toHaveBeenCalledWith(0)
  })

  it('makes a replayed video playable and follows replay playback state', () => {
    const base = testMedia('video', 'Portrait clip')
    const video = {
      ...base,
      asset: {
        ...base.asset,
        kind: 'video' as const,
        fileName: 'portrait.webm',
        mimeType: 'video/webm',
        durationMs: 1_000,
      },
      src: 'blob:portrait-video',
    }
    const props = {
      categories: testCategories,
      frames: [
        {
          item: video,
          categoryId: 'quiet',
          direction: 'left' as const,
          atMs: 500,
        },
      ],
      stepIndex: 1,
      onStepChange: vi.fn(),
      onTogglePlaying: vi.fn(),
    }
    const view = render(<ReplayScreen {...props} isPlaying />)

    expect(screen.getByLabelText('Portrait clip')).toHaveAttribute('controls')
    expect(screen.getByLabelText('Portrait clip')).toHaveAttribute('autoplay')

    view.rerender(<ReplayScreen {...props} isPlaying={false} />)
    expect(screen.getByLabelText('Portrait clip')).toHaveAttribute('controls')
    expect(screen.getByLabelText('Portrait clip')).not.toHaveAttribute('autoplay')
  })
})
