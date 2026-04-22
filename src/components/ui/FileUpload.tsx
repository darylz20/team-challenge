import { useRef, useState, type DragEvent } from 'react'
import { Upload, X, FileImage, FileAudio, FileVideo } from 'lucide-react'
import { cn } from '../../lib/utils'

interface FileUploadProps {
  accept?: string
  onFile: (file: File) => void
  preview?: string | null
  onClear?: () => void
  label?: string
}

export function FileUpload({ accept, onFile, preview, onClear, label }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFile(file)
  }

  if (preview) {
    const isImage = preview.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i)
    const isAudio = preview.match(/\.(mp3|ogg|wav)(\?|$)/i)
    const isVideo = preview.match(/\.(mp4|webm)(\?|$)/i)

    return (
      <div className="flex flex-col gap-1.5">
        {label && <span className="text-sm text-text-muted">{label}</span>}
        <div className="relative bg-surface rounded-lg border border-surface-overlay p-3">
          {isImage && (
            <img src={preview} alt="Preview" className="w-full max-h-48 object-contain rounded" />
          )}
          {isAudio && (
            <div className="flex items-center gap-3 py-2">
              <FileAudio size={24} className="text-neon" />
              <span className="text-sm text-text-muted truncate">{preview.split('/').pop()}</span>
            </div>
          )}
          {isVideo && (
            <div className="flex items-center gap-3 py-2">
              <FileVideo size={24} className="text-neon" />
              <span className="text-sm text-text-muted truncate">{preview.split('/').pop()}</span>
            </div>
          )}
          {!isImage && !isAudio && !isVideo && (
            <div className="flex items-center gap-3 py-2">
              <FileImage size={24} className="text-neon" />
              <span className="text-sm text-text-muted truncate">File uploaded</span>
            </div>
          )}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="absolute top-2 right-2 p-1 rounded-full bg-surface-overlay text-text-muted hover:text-text"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-sm text-text-muted">{label}</span>}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center gap-2 p-6 rounded-lg border-2 border-dashed transition-colors cursor-pointer',
          dragOver
            ? 'border-neon bg-neon/5'
            : 'border-surface-overlay hover:border-text-faint',
        )}
      >
        <Upload size={24} className="text-text-faint" />
        <span className="text-sm text-text-muted">
          Drop file here or click to browse
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
    </div>
  )
}
