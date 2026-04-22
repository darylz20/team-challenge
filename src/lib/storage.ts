import { supabase } from './supabase'

export async function uploadChallengeMedia(file: File, gameId: string): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const path = `${gameId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from('challenge-media')
    .upload(path, file, { upsert: true })

  if (error) {
    console.error('Upload error:', error)
    return null
  }

  const { data } = supabase.storage.from('challenge-media').getPublicUrl(path)
  return data.publicUrl
}

export async function deleteChallengeMedia(url: string): Promise<boolean> {
  const match = url.match(/challenge-media\/(.+)$/)
  if (!match) return false

  const { error } = await supabase.storage
    .from('challenge-media')
    .remove([match[1]])

  return !error
}

export async function uploadSubmissionPhoto(file: File, gameId: string, challengeId: string): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const path = `${gameId}/${challengeId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from('submission-photos')
    .upload(path, file)

  if (error) {
    console.error('Upload error:', error)
    return null
  }

  const { data } = supabase.storage.from('submission-photos').getPublicUrl(path)
  return data.publicUrl
}
