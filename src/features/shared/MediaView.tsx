import type { CSSProperties } from 'react'
import type { PresentedMedia } from '../types'
import './media-view.css'

type MediaViewProps = {
  media: PresentedMedia
  variant?: 'active' | 'thumbnail' | 'result' | 'replay'
  playbackActive?: boolean
}

export function MediaView({
  media,
  variant = 'result',
  playbackActive = false,
}: MediaViewProps) {
  const { asset, item, posterSrc, src } = media
  const isActive = variant === 'active'
  const style = {
    '--media-ratio': `${Math.max(asset.width, 1)} / ${Math.max(asset.height, 1)}`,
  } as CSSProperties

  return (
    <div className={`ss-media ss-media--${variant}`} style={style}>
      {asset.kind === 'image' ? (
        <img
          src={src}
          alt={item.title}
          draggable={false}
          loading={isActive ? 'eager' : 'lazy'}
        />
      ) : (
        <video
          src={src}
          poster={posterSrc}
          aria-label={item.title}
          autoPlay={isActive || (variant === 'replay' && playbackActive)}
          controls={variant === 'result' || variant === 'replay'}
          loop={isActive}
          muted
          playsInline
          preload={isActive ? 'auto' : 'metadata'}
          disablePictureInPicture={variant === 'thumbnail'}
        />
      )}
    </div>
  )
}
