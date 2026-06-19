export type MediaContent = { id: string; url?: string }

export type MediaContentPreview = MediaContent & {
  title: string
  thumbnail: string
}

export type YouTubeVideoData = {
  title: string
  videoId: string
  videoThumbnails: { quality: string; url: string }[]
}[]

export type Audio = {
  type: string
  url: string
  audioSampleRate: number
}
