import { useEffect, useState } from 'react'

import { getResolver } from '../actions/audio'

import { getCache, normalizeAssignment, updateAssignment } from '../cache/musicCache'
import { useSettings } from '../hooks/useSettings'

const useThemeMusic = (appId: number) => {
  const { isLoading: settingsLoading } = useSettings()
  const [audio, setAudio] = useState<{ videoId: string; audioUrl: string }>({
    videoId: '',
    audioUrl: ''
  })
  const appDetails = appStore.GetAppOverviewByGameID(appId)
  const appName = appDetails?.display_name?.replace(/(™|®|©)/g, '')

  useEffect(() => {
    async function getData() {
      const cache = await getCache(appId)
      const assignment = normalizeAssignment(cache)
      if (!assignment || assignment.kind === 'none') {
        return setAudio({ videoId: '', audioUrl: '' })
      }

      const resolverForAssignment = getResolver(assignment.provider)
      const localAudio = await resolverForAssignment.getLocalAudioUrl({
        id: assignment.trackId
      })
      if (localAudio?.length) {
        return setAudio({ videoId: assignment.trackId, audioUrl: localAudio })
      }

      if (assignment.lastDownloadError) {
        return setAudio({ videoId: '', audioUrl: '' })
      }

      const storedFile = await resolverForAssignment.downloadAudio({
        id: assignment.trackId
      })
      if (!storedFile) {
        await updateAssignment(appId, {
          ...assignment,
          lastDownloadError: 'download failed'
        })
        return setAudio({ videoId: '', audioUrl: '' })
      }

      const updatedAssignment = {
        ...assignment,
        fileKey: storedFile.fileKey,
        extension: storedFile.extension,
        mimeType: storedFile.mimeType,
        fileSize: storedFile.fileSize,
        downloadedAt: new Date().toISOString(),
        lastDownloadError: undefined
      }
      await updateAssignment(appId, updatedAssignment)
      const downloadedAudio = await resolverForAssignment.getLocalAudioUrl({
        id: assignment.trackId
      })
      if (downloadedAudio?.length) {
        return setAudio({ videoId: assignment.trackId, audioUrl: downloadedAudio })
      }
      return setAudio({ videoId: '', audioUrl: '' })
    }
    if (appName?.length && !settingsLoading) {
      getData()
    }
  }, [appName, settingsLoading])

  return {
    audio
  }
}

export default useThemeMusic
