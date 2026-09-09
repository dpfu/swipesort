import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TikTokPlayer } from './TikTokPlayer'

const link = { videoId: '6718335390845095173', url: 'https://www.tiktok.com/@scout2015/video/6718335390845095173' }
const props = { link, title: 'Example', thumbnail: false, preview: false }
afterEach(() => { cleanup(); vi.useRealTimers() })

it('does not load external players in thumbnails or until a result is opened', () => {
  const { container, rerender } = render(<TikTokPlayer {...props} thumbnail />)
  expect(container.querySelector('iframe')).toBeNull()
  rerender(<TikTokPlayer key="result" {...props} preview />)
  expect(container.querySelector('iframe')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Load TikTok player' }))
  expect(screen.getByTitle('TikTok player: Example')).toHaveAttribute('src', expect.stringContaining('/player/v1/6718335390845095173'))
})

it('accepts errors only from its own TikTok frame and provides retry and original link', () => {
  render(<TikTokPlayer {...props} />)
  const frame = screen.getByTitle('TikTok player: Example') as HTMLIFrameElement
  const data = { 'x-tiktok-player': true, type: 'onPlayerError', value: { errorCode: 1001 } }
  act(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.org', source: frame.contentWindow, data })))
  expect(screen.queryByRole('button', { name: 'Retry video' })).toBeNull()
  act(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://www.tiktok.com', source: window, data })))
  expect(screen.queryByRole('button', { name: 'Retry video' })).toBeNull()
  act(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://www.tiktok.com', source: frame.contentWindow, data })))
  expect(screen.getByRole('status')).toHaveTextContent('unavailable')
  expect(screen.getByRole('link')).toHaveAttribute('href', link.url)
  fireEvent.click(screen.getByRole('button', { name: 'Retry video' }))
  expect(screen.getByTitle('TikTok player: Example')).toBeInTheDocument()
})

it('offers retry without removing a usable frame that never sends ready', () => {
  vi.useFakeTimers()
  render(<TikTokPlayer {...props} />)
  const frame = screen.getByTitle('TikTok player: Example')
  act(() => vi.advanceTimersByTime(15000))
  expect(screen.getByRole('button', { name: 'Retry player' })).toBeVisible()
  expect(screen.getByTitle('TikTok player: Example')).toBe(frame)
  fireEvent.click(screen.getByRole('button', { name: 'Retry player' }))
  expect(screen.getByTitle('TikTok player: Example')).not.toBe(frame)
})

it('pauses replay media and sends controls only to the TikTok origin', () => {
  const { rerender } = render(<TikTokPlayer {...props} playbackActive={false} />)
  const frame = screen.getByTitle('TikTok player: Example') as HTMLIFrameElement
  const send = vi.spyOn(frame.contentWindow!, 'postMessage')
  rerender(<TikTokPlayer {...props} playbackActive />)
  expect(send).toHaveBeenLastCalledWith({ 'x-tiktok-player': true, type: 'play' }, 'https://www.tiktok.com')
  rerender(<TikTokPlayer {...props} playbackActive={false} />)
  expect(send).toHaveBeenLastCalledWith({ 'x-tiktok-player': true, type: 'pause' }, 'https://www.tiktok.com')
})
