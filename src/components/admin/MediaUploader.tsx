import { useState } from 'react'
import { FileUpload } from '../ui/FileUpload'
import { uploadChallengeMedia, deleteChallengeMedia } from '../../lib/storage'

interface MediaUploaderProps {
  gameId: string
  mediaUrl: string | null
  onUploaded: (url: string | null, type: 'image' | 'audio' | 'video' | null) => void
}

function getMediaType(file: File): 'image' | 'audio' | 'video' | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('video/')) return 'video'
  return null
}

export function MediaUploader({ gameId, mediaUrl, onUploaded }: MediaUploaderProps) {
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    const mediaType = getMediaType(file)
    if (!mediaType) return

    setUploading(true)
    const url = await uploadChallengeMedia(file, gameId)
    setUploading(false)

    if (url) {
      onUploaded(url, mediaType)
    }
  }

  async function handleClear() {
    if (mediaUrl) {
      await deleteChallengeMedia(mediaUrl)
    }
    onUploaded(null, null)
  }

  return (
    <div>
      {uploading ? (
        <div className="flex items-center gap-3 p-6 rounded-lg border-2 border-dashed border-surface-overlay">
          <div className="w-5 h-5 border-2 border-neon border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-text-muted">Uploading...</span>
        </div>
      ) : (
        <FileUpload
          accept="image/*,audio/*,video/*"
          onFile={handleFile}
          preview={mediaUrl}
          onClear={handleClear}
          label="Media Attachment (optional)"
        />
      )}
    </div>
  )
}
