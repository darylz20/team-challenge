import { useRef, useState, type DragEvent } from 'react'
import { Upload, X, FileAudio, FileVideo, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '../../lib/utils'
import { uploadChallengeMedia, deleteChallengeMedia } from '../../lib/storage'
import type { MediaItem, MediaType } from '../../types'

interface MultiMediaUploaderProps {
  gameId: string
  items: MediaItem[]
  onChange: (items: MediaItem[]) => void
}

function getMediaType(file: File): MediaType | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('video/')) return 'video'
  return null
}

function SortableMediaItem({ item, position, onRemove }: { item: MediaItem; position: number; onRemove: () => void }) {
  const isImage = item.type === 'image'
  const isAudio = item.type === 'audio'
  const isVideo = item.type === 'video'
  const filename = item.url.split('/').pop()?.split('?')[0] ?? 'file'

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.url })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group flex items-center gap-2 bg-surface rounded-lg border border-surface-overlay p-2',
        isDragging && 'opacity-50 z-10',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="flex items-center gap-1 text-text-faint hover:text-text cursor-grab active:cursor-grabbing p-1 touch-none shrink-0"
      >
        <GripVertical size={14} />
        <span className="text-xs font-mono">{position}</span>
      </button>
      <div className="flex-1 min-w-0">
        {isImage && (
          <img src={item.url} alt="" className="h-16 w-full object-cover rounded" />
        )}
        {isAudio && (
          <div className="flex items-center gap-2 py-1">
            <FileAudio size={18} className="text-neon shrink-0" />
            <span className="text-sm text-text-muted truncate">{filename}</span>
          </div>
        )}
        {isVideo && (
          <div className="flex items-center gap-2 py-1">
            <FileVideo size={18} className="text-neon shrink-0" />
            <span className="text-sm text-text-muted truncate">{filename}</span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="p-1 rounded-full text-text-faint hover:text-magenta transition-colors shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function MultiMediaUploader({ gameId, items, onChange }: MultiMediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = items.findIndex((it) => it.url === active.id)
    const newIndex = items.findIndex((it) => it.url === over.id)
    const newOrder = [...items]
    const [moved] = newOrder.splice(oldIndex, 1)
    newOrder.splice(newIndex, 0, moved)
    onChange(newOrder)
  }

  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    setUploading(true)
    const newItems: MediaItem[] = []

    for (const file of fileArray) {
      const mediaType = getMediaType(file)
      if (!mediaType) continue

      const url = await uploadChallengeMedia(file, gameId)
      if (url) {
        newItems.push({ url, type: mediaType })
      }
    }

    if (newItems.length > 0) {
      onChange([...items, ...newItems])
    }
    setUploading(false)
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  async function handleRemove(index: number) {
    const item = items[index]
    await deleteChallengeMedia(item.url)
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-text-muted">Mediabijlagen (optioneel)</span>

      {/* Existing items — drag the handle to change the order players see them in */}
      {items.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((it) => it.url)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {items.map((item, i) => (
                <SortableMediaItem
                  key={item.url}
                  item={item}
                  position={i + 1}
                  onRemove={() => handleRemove(i)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {items.length > 1 && (
        <p className="text-xs text-text-faint">
          Drag the handle to reorder. Players see them in this order.
        </p>
      )}

      {/* Upload zone */}
      {uploading ? (
        <div className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-surface-overlay">
          <div className="w-5 h-5 border-2 border-neon border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-text-muted">Bezig met uploaden...</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            'flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-dashed transition-colors cursor-pointer',
            dragOver
              ? 'border-neon bg-neon/5'
              : 'border-surface-overlay hover:border-text-faint',
          )}
        >
          <Upload size={20} className="text-text-faint" />
          <span className="text-sm text-text-muted">
            {items.length > 0 ? 'Meer bestanden toevoegen' : 'Sleep bestanden hierheen of klik om te bladeren'}
          </span>
          <span className="text-xs text-text-faint">Afbeeldingen, audio en video worden ondersteund</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,audio/*,video/*"
        multiple
        onChange={handleChange}
        className="hidden"
      />
    </div>
  )
}
