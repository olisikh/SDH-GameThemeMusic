import { call } from '@decky/api'
import { MediaContent, MediaContentPreview, StoredMusicFile } from 'types/media'

abstract class AudioResolver {
  abstract getYouTubeSearchResults(
    searchTerm: string
  ): AsyncIterable<MediaContentPreview>
  abstract getAudioUrlFromVideo(
    video: MediaContent
  ): Promise<string | undefined>
  abstract getPreviewUrl(video: MediaContent): Promise<string | undefined>
  abstract getLocalAudioUrl(video: MediaContent): Promise<string | undefined>
  abstract downloadAudio(video: MediaContent): Promise<StoredMusicFile | undefined>

  async getAudio(
    appName: string
  ): Promise<{ videoId: string; audioUrl: string } | undefined> {
    const videos = this.getYouTubeSearchResults(appName + ' Theme Music')
    for await (const video of videos) {
      const audioUrl = await this.getPreviewUrl(video)
      if (audioUrl?.length) {
        return { audioUrl, videoId: video.id }
      }
    }
    return undefined
  }
}

class YtDlpAudioResolver extends AudioResolver {
  async *getYouTubeSearchResults(
    searchTerm: string
  ): AsyncIterable<MediaContentPreview> {
    try {
      await call<[string]>('search_yt', searchTerm)
      let result = await call<[], MediaContentPreview | null>('next_yt_result')
      while (result) {
        yield result
        result = await call<[], MediaContentPreview | null>('next_yt_result')
      }
      return
    } catch (err) {
      console.error(err)
    }
    return
  }

  async getAudioUrlFromVideo(video: MediaContent): Promise<string | undefined> {
    return this.getPreviewUrl(video)
  }

  async getPreviewUrl(video: MediaContent): Promise<string | undefined> {
    if (video.url && !video.url.includes('youtube.com') && !video.url.includes('youtu.be')) {
      return video.url
    } else {
      const result = await call<[string], string | null>(
        'single_yt_url',
        video.id
      )
      return result || undefined
    }
  }

  async getLocalAudioUrl(video: MediaContent): Promise<string | undefined> {
    const result = await call<[string, string], string | null>(
      'stored_music_url',
      'youtube',
      video.id
    )
    return result || undefined
  }

  async downloadAudio(video: MediaContent): Promise<StoredMusicFile | undefined> {
    try {
      return await call<[string], StoredMusicFile | undefined>('download_yt_audio', video.id)
    } catch (e) {
      console.error(e)
      return undefined
    }
  }
}

class KhinsiderAudioResolver extends AudioResolver {
  async *getYouTubeSearchResults(
    searchTerm: string
  ): AsyncIterable<MediaContentPreview> {
    const fetchDoc = async (url: string) => {
      try {
        const html = await call<[string], string>('fetch_url', url)
        if (!html) return null
        const parser = new DOMParser()
        return parser.parseFromString(html, 'text/html')
      } catch (e) {
        return null
      }
    }

    const searchUrl = (query: string) => `https://downloads.khinsider.com/search?search=${encodeURIComponent(query)}`

    try {
      let doc = await fetchDoc(searchUrl(searchTerm))

      if (!doc || (doc.querySelectorAll('a[href*="/album/"]').length === 0 && doc.querySelectorAll('.playlistItem, #songlist, .clickable-row').length === 0)) {
        const baseName = searchTerm.replace(/\s+(Theme Music|Soundtrack|OST)$/i, '')
        if (baseName !== searchTerm) {
          doc = await fetchDoc(searchUrl(baseName))
        }
      }

      if (!doc) return

      const rawAlbumLinks = Array.from(doc.querySelectorAll('a[href*="/game-soundtracks/album/"]'))
      const seenAlbumHrefs = new Set<string>()
      const topAlbums: { url: string; title: string; thumbnail: string }[] = []

      for (const link of rawAlbumLinks) {
        const href = link.getAttribute('href')
        if (href && !seenAlbumHrefs.has(href)) {
          seenAlbumHrefs.add(href)
          const albumUrl = href.startsWith('http') ? href : `https://downloads.khinsider.com${href}`

          let title = link.textContent?.trim()
          const row = (link as HTMLElement).closest('tr')
          if (!title && row) {
            title = Array.from(row.querySelectorAll('td'))
              .map(td => td.textContent?.trim())
              .filter(t => t && t.length > 2)[0]
          }
          if (!title) title = 'Unknown Album'

          let thumbnail = 'https://downloads.khinsider.com/images/no-cover.png'
          if (row) {
            const img = row.querySelector('img')
            if (img && img.src) thumbnail = img.src
          }
          topAlbums.push({ url: albumUrl, title, thumbnail })
          if (topAlbums.length >= 8) break
        }
      }

      const seenTrackHrefs = new Set<string>()
      const albumResponses = await Promise.all(
        topAlbums.map(async (album) => {
          try {
            const albumDoc = await fetchDoc(album.url)
            if (!albumDoc) return []

            const results: MediaContentPreview[] = []
            const trackLinks = Array.from(albumDoc.querySelectorAll('.playlistItem td.clickable-row a, #songlist td.clickable-row a'))

            for (const trackLink of trackLinks) {
              const href = trackLink.getAttribute('href')
              if (!href || seenTrackHrefs.has(href)) continue
              seenTrackHrefs.add(href)

              const trackUrl = href.startsWith('http') ? href : `https://downloads.khinsider.com${href}`
              const trackTitle = trackLink.textContent?.trim() || 'Track'

              results.push({
                id: trackUrl,
                title: `${trackTitle} (${album.title})`,
                thumbnail: album.thumbnail
              })
            }
            return results
          } catch (e) {
            console.error(`Failed to fetch album ${album.url}`, e)
            return []
          }
        })
      )

      for (const batch of albumResponses) {
        for (const track of batch) {
          yield track
        }
      }

      if (topAlbums.length === 0) {
        const tracks = Array.from(doc.querySelectorAll('.playlistItem a, .clickable-row a, #songlist a'))
        for (const track of tracks) {
          const href = track.getAttribute('href')
          if (!href || href.includes('/search') || !href.includes('/album/') || seenTrackHrefs.has(href)) continue
          seenTrackHrefs.add(href)

          const trackUrl = href.startsWith('http') ? href : `https://downloads.khinsider.com${href}`
          const title = track.textContent?.trim()
          if (!title || title.length < 2) continue

          yield {
            id: trackUrl,
            title: title,
            thumbnail: 'https://downloads.khinsider.com/images/no-cover.png'
          }
          if (seenTrackHrefs.size >= 30) break
        }
      }
    } catch (err) {
      console.error("KHInsider search failed:", err)
    }
  }

  async getAudioUrlFromVideo(video: MediaContent): Promise<string | undefined> {
    return (await this.getLocalAudioUrl(video)) || this.getPreviewUrl(video)
  }

  async getLocalAudioUrl(video: MediaContent): Promise<string | undefined> {
    const localUrl = await call<[string, string], string | null>(
      'stored_music_url',
      'khinsider',
      video.id
    )
    return localUrl || undefined
  }

  async getPreviewUrl(video: MediaContent): Promise<string | undefined> {
    try {
      const html = await call<[string], string>('fetch_url', video.id)
      if (!html) return undefined

      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')

      const audio = doc.querySelector('audio')
      if (audio) {
        const src = audio.getAttribute('src')
        if (src) return src

        const source = audio.querySelector('source')
        if (source) {
          const sourceSrc = source.getAttribute('src')
          if (sourceSrc) return sourceSrc
        }
      }

      // Fallback: look for direct audio links
      const links = doc.querySelectorAll('a')
      for (const link of links) {
        const href = link.getAttribute('href')
        if (href && /\.(mp3|ogg|flac|m4a|wav|aac|opus)$/i.test(href)) {
          return href.startsWith('http')
            ? href
            : `https://downloads.khinsider.com${href}`
        }
      }

      return undefined
    } catch (e) {
      console.error('KHInsider audio fetch failed:', e)
      return undefined
    }
  }

  async downloadAudio(video: MediaContent): Promise<StoredMusicFile | undefined> {
    try {
      const url = await this.getPreviewUrl(video)
      if (!url) return undefined
      return await call<[string, string], StoredMusicFile | undefined>('download_url', url, video.id)
    } catch (e) {
      console.error(e)
      return undefined
    }
  }
}

export function getResolver(provider?: string): AudioResolver {
  if (provider === 'khinsider') {
    return new KhinsiderAudioResolver()
  }
  return new YtDlpAudioResolver()
}
