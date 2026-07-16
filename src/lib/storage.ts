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

/**
 * Uploads a team's photo_upload submission. Separate bucket from challenge-media
 * because this one accepts anonymous writes (players have no Supabase auth).
 * Path is scoped per game/team so an admin can find or clear them by prefix.
 */
export async function uploadTeamPhoto(file: File, gameId: string, teamId: string): Promise<string | null> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${gameId}/${teamId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from('team-photos')
    .upload(path, file, { upsert: false })

  if (error) {
    console.error('Team photo upload error:', error)
    return null
  }

  const { data } = supabase.storage.from('team-photos').getPublicUrl(path)
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

