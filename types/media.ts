export type Provider = 'youtube' | 'khinsider'

export type StoredMusicFile = {
  fileKey: string
  extension: string
  mimeType: string
  fileSize: number
}

export type TrackAssignment =
  | {
      kind: 'track'
      provider: Provider
      trackId: string
      fileKey: string
      title?: string
      extension?: string
      mimeType?: string
      fileSize?: number
      downloadedAt?: string
      lastDownloadError?: string
    }
  | { kind: 'none' }

export type MediaContent = { id: string; url?: string }

export type MediaContentPreview = MediaContent & {
  title: string
  thumbnail: string
}
