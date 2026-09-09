import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  motion,
  useAnimationControls,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionStyle,
  type PanInfo,
} from 'framer-motion'
import type { Category, InputMethod, SwipeDirection, SwipeSample } from '../../domain/types'
import { MediaView } from '../shared/MediaView'
import type { PresentedMedia, SwipeCommit } from '../types'

export type SwipeCardHandle = {
  swipe: (direction: SwipeDirection, input?: Exclude<InputMethod, 'pointer'>) => void
}

export type SwipeCardProps = {
  media: PresentedMedia
  categories: [Category, Category]
  onCommit: (commit: SwipeCommit) => void | Promise<void>
  onSettled?: () => void
  onCommitFailed?: () => void
  disabled?: boolean
}

const MIN_DISTANCE = 72
const MAX_DISTANCE = 132
const VELOCITY_THRESHOLD = 620
const VELOCITY_MIN_DISTANCE = 18
const SAMPLE_INTERVAL_MS = 40

function directionFor(value: number): SwipeDirection {
  return value < 0 ? 'left' : 'right'
}

export const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(function SwipeCard(
  { media, categories, onCommit, onSettled, onCommitFailed, disabled = false },
  forwardedRef,
) {
  const isTikTok = media.asset.kind === 'tiktok'
  const dragControls = useDragControls()
  const cardRef = useRef<HTMLElement>(null)
  const dragStartRef = useRef(0)
  const samplesRef = useRef<SwipeSample[]>([])
  const lastSampleAtRef = useRef(0)
  const lockedRef = useRef(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const controls = useAnimationControls()
  const reducedMotion = useReducedMotion()
  const x = useMotionValue(0)
  const rotation = useTransform(x, [-240, 0, 240], [-4, 0, 4])
  const leftOpacity = useTransform(x, [-120, -12, 0], [1, 0.18, 0])
  const rightOpacity = useTransform(x, [0, 12, 120], [0, 0.18, 1])
  const leftCategory = categories.find((category) => category.direction === 'left') ?? categories[0]
  const rightCategory = categories.find((category) => category.direction === 'right') ?? categories[1]
  const leftDestinationStyle: MotionStyle & { '--category-color': string } = {
    '--category-color': leftCategory.color,
    opacity: leftOpacity,
  }
  const rightDestinationStyle: MotionStyle & { '--category-color': string } = {
    '--category-color': rightCategory.color,
    opacity: rightOpacity,
  }

  useEffect(() => {
    lockedRef.current = false
    setIsLeaving(false)
    samplesRef.current = []
    x.set(0)
    controls.set({ x: 0, opacity: 1, scale: 1 })
  }, [controls, media.item.id, x])

  async function commit(
    direction: SwipeDirection,
    input: InputMethod,
    velocityX = 0,
    durationMs = 0,
    samples: SwipeSample[] = [],
  ) {
    if (disabled || lockedRef.current) return
    lockedRef.current = true
    setIsLeaving(true)

    try {
      await onCommit({ direction, input, velocityX, durationMs, samples })
    } catch {
      samplesRef.current = []
      x.set(0)
      controls.set({ x: 0, opacity: 1, scale: 1 })
      lockedRef.current = false
      setIsLeaving(false)
      onCommitFailed?.()
      return
    }

    try {
      if (reducedMotion) {
        await Promise.resolve()
      } else {
        const viewportWidth = typeof window === 'undefined' ? 480 : window.innerWidth
        await controls.start({
          x: direction === 'left' ? -viewportWidth * 1.2 : viewportWidth * 1.2,
          opacity: 0.15,
          scale: 0.98,
          transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
        })
      }
    } finally {
      onSettled?.()
    }
  }

  useImperativeHandle(
    forwardedRef,
    () => ({
      swipe(direction, input = 'button') {
        void commit(direction, input)
      },
    }),
  )

  function handleDragStart() {
    const now = performance.now()
    dragStartRef.current = now
    lastSampleAtRef.current = now
    samplesRef.current = [{ t: 0, x: 0, y: 0 }]
  }

  function handleDrag(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const now = performance.now()
    if (now - lastSampleAtRef.current < SAMPLE_INTERVAL_MS) return
    lastSampleAtRef.current = now
    samplesRef.current.push({
      t: Math.round(now - dragStartRef.current),
      x: Math.round(info.offset.x),
      y: Math.round(info.offset.y),
    })
  }

  function handleDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const durationMs = Math.max(0, Math.round(performance.now() - dragStartRef.current))
    const distanceThreshold = Math.min(
      MAX_DISTANCE,
      Math.max(MIN_DISTANCE, (cardRef.current?.getBoundingClientRect().width ?? 360) * 0.27),
    )
    const passesDistance = Math.abs(info.offset.x) >= distanceThreshold
    const passesVelocity =
      Math.abs(info.velocity.x) >= VELOCITY_THRESHOLD &&
      Math.abs(info.offset.x) >= VELOCITY_MIN_DISTANCE

    if (passesDistance || passesVelocity) {
      const decidingValue = Math.abs(info.offset.x) >= VELOCITY_MIN_DISTANCE ? info.offset.x : info.velocity.x
      const samples = [
        ...samplesRef.current,
        { t: durationMs, x: Math.round(info.offset.x), y: Math.round(info.offset.y) },
      ]
      void commit(directionFor(decidingValue), 'pointer', info.velocity.x, durationMs, samples)
      return
    }

    samplesRef.current = []
    void controls.start({
      x: 0,
      opacity: 1,
      scale: 1,
      transition: reducedMotion
        ? { duration: 0 }
        : { type: 'spring', stiffness: 470, damping: 36, mass: 0.7 },
    })
  }

  return (
    <div className="ss-swipe-stage">
      <motion.aside
        className="ss-destination ss-destination--left"
        style={leftDestinationStyle}
        aria-hidden="true"
      >
        <span>Swipe left</span>
        <strong>{leftCategory.name}</strong>
      </motion.aside>
      <motion.aside
        className="ss-destination ss-destination--right"
        style={rightDestinationStyle}
        aria-hidden="true"
      >
        <span>Swipe right</span>
        <strong>{rightCategory.name}</strong>
      </motion.aside>

      <div className="ss-card-stack" aria-hidden="true" />
      <motion.article
        ref={cardRef}
        className="ss-swipe-card"
        data-testid="swipe-card"
        aria-label={`Sort ${media.item.title}`}
        drag={disabled || isLeaving ? false : 'x'}
        dragControls={dragControls}
        dragListener={!isTikTok}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.82}
        dragMomentum={false}
        animate={controls}
        style={{ x, rotate: reducedMotion ? 0 : rotation, touchAction: isTikTok ? 'auto' : 'pan-y' }}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        whileDrag={reducedMotion ? undefined : { scale: 1.012, cursor: 'grabbing' }}
      >
        <MediaView media={media} variant="active" />
        <footer
          className={`ss-swipe-card__caption${isTikTok ? ' ss-swipe-card__caption--handle' : ''}`}
          data-testid={isTikTok ? 'tiktok-swipe-handle' : undefined}
          onPointerDown={isTikTok ? (event) => {
            if (!disabled && !isLeaving) dragControls.start(event)
          } : undefined}
        >
          <p>{media.item.title}</p>
          <span>{isTikTok ? '← Swipe here →' : media.asset.kind === 'video' ? 'Video' : 'Image'}</span>
        </footer>
      </motion.article>
    </div>
  )
})
