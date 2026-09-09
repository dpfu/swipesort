import { useEffect, useRef, useState } from 'react'
import type { TikTokLink } from '../../media/tiktok'
import { tikTokPlayerUrl } from '../../media/tiktok'

const ORIGIN = 'https://www.tiktok.com'

export function TikTokPlayer({ link, title, thumbnail, preview, playbackActive }: {
  link: TikTokLink
  title: string
  thumbnail: boolean
  preview: boolean
  playbackActive?: boolean
}) {
  const [opened, setOpened] = useState(!preview)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string>()
  const [unconfirmed, setUnconfirmed] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const playback = useRef(playbackActive)
  playback.current = playbackActive

  useEffect(() => {
    if (thumbnail || !opened) return
    let ready = false
    const timer = window.setTimeout(() => {
      if (!ready) setUnconfirmed(true)
    }, 15000)
    function onMessage(event: MessageEvent) {
      if (event.origin !== ORIGIN || !frame.current || event.source !== frame.current.contentWindow ||
          !event.data || event.data['x-tiktok-player'] !== true) return
      if (event.data.type === 'onPlayerReady') {
        ready = true
        window.clearTimeout(timer)
        setError(undefined)
        setUnconfirmed(false)
        if (playback.current !== undefined) {
          frame.current.contentWindow?.postMessage({ 'x-tiktok-player': true, type: playback.current ? 'play' : 'pause' }, ORIGIN)
        }
      }
      if (event.data.type === 'onPlayerError' && event.data.value?.errorCode !== 3002) {
        window.clearTimeout(timer)
        setError('TikTok could not play this video. It may be unavailable or blocked here.')
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
    }
  }, [attempt, opened, thumbnail, link.videoId])

  useEffect(() => {
    if (playbackActive === undefined) return
    frame.current?.contentWindow?.postMessage({ 'x-tiktok-player': true, type: playbackActive ? 'play' : 'pause' }, ORIGIN)
  }, [playbackActive])

  function retry() {
    setError(undefined)
    setUnconfirmed(false)
    setOpened(true)
    setAttempt((value) => value + 1)
  }

  if (thumbnail) return <span className="ss-tiktok-thumb" aria-label={`TikTok: ${title}`}>TikTok</span>

  return (
    <div className="ss-tiktok-player" onPointerDown={(event) => event.stopPropagation()}>
      {opened && !error ? (
        <iframe
          key={`${link.videoId}-${attempt}`}
          ref={frame}
          src={tikTokPlayerUrl(link.videoId)}
          title={`TikTok player: ${title}`}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div className="ss-tiktok-fallback">
          <strong>TikTok</strong>
          {error ? <p role="status">{error}</p> : null}
          <button type="button" className="ss-button ss-button--primary" onClick={retry}>{error ? 'Retry video' : 'Load TikTok player'}</button>
        </div>
      )}
      <div className="ss-tiktok-player__links">
        {unconfirmed && !error ? (
          <span className="ss-tiktok-player__notice">
            No video? <button type="button" onClick={retry}>Retry player</button>
          </span>
        ) : null}
        <a href={link.url} target="_blank" rel="noopener noreferrer">Open original on TikTok ↗</a>
      </div>
    </div>
  )
}
