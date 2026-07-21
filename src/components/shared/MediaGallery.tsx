import { useRef, useState, useEffect, useCallback } from 'react'
import { cn } from '../../lib/utils'
import type { MediaItem, MediaLayout, MediaSize } from '../../types'

interface MediaGalleryProps {
  items: MediaItem[]
  layout: MediaLayout
  size: MediaSize
}

// Size classes per item
const sizeClasses: Record<MediaSize, string> = {
  small: 'max-h-[120px] object-cover',
  medium: 'max-h-[200px] object-cover',
  large: '', // natural aspect ratio
  full: 'w-full aspect-video object-cover',
}

function MediaItemView({ item, size }: { item: MediaItem; size: MediaSize }) {
  const cls = sizeClasses[size]

  if (item.type === 'image') {
    return <img src={item.url} alt="" className={cn('w-full rounded-lg', cls)} />
  }
  if (item.type === 'audio') {
    return <audio controls className="w-full" src={item.url} />
  }
  if (item.type === 'video') {
    return <video controls className={cn('w-full rounded-lg', cls)} src={item.url} />
  }
  return null
}

// ── Carousel with chevron navigation ──

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
    >
      <path d={direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  )
}

function CarouselLayout({ items, size }: { items: MediaItem[]; size: MediaSize }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const index = Math.round(el.scrollLeft / el.clientWidth)
    setActiveIndex(index)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  function scrollTo(index: number) {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide rounded-lg"
        style={{ scrollbarWidth: 'none' }}
      >
        {items.map((item, i) => (
          <div key={i} className="min-w-full snap-center">
            <MediaItemView item={item} size={size} />
          </div>
        ))}
      </div>
      {activeIndex > 0 && (
        <button
          type="button"
          onClick={() => scrollTo(activeIndex - 1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-black/25 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/40 hover:text-white"
          aria-label="Previous image"
        >
          <ChevronIcon direction="left" />
        </button>
      )}
      {activeIndex < items.length - 1 && (
        <button
          type="button"
          onClick={() => scrollTo(activeIndex + 1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-black/25 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/40 hover:text-white"
          aria-label="Next image"
        >
          <ChevronIcon direction="right" />
        </button>
      )}
    </div>
  )
}

// ── Main component ──

export function MediaGallery({ items, layout, size }: MediaGalleryProps) {
  if (items.length === 0) return null

  // Single item — always render simply
  if (items.length === 1) {
    return (
      <div className="rounded-lg overflow-hidden">
        <MediaItemView item={items[0]} size={size} />
      </div>
    )
  }

  // Carousel
  if (layout === 'carousel') {
    return <CarouselLayout items={items} size={size} />
  }

  // Grid or vertical
  return (
    <div
      className={cn(
        layout === 'vertical' && 'flex flex-col gap-2',
        layout === 'grid-2' && 'grid grid-cols-2 gap-2',
        layout === 'grid-3' && 'grid grid-cols-3 gap-2',
      )}
    >
      {items.map((item, i) => (
        <div key={i} className="rounded-lg overflow-hidden">
          <MediaItemView item={item} size={size} />
        </div>
      ))}
    </div>
  )
}
