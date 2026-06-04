/** Acquire the microphone with ASR-friendly constraints (no processing, mono). */
export async function getMicStream(deviceId: string | null): Promise<MediaStream> {
  const audio: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1
  }
  if (deviceId && deviceId !== 'default') audio.deviceId = { exact: deviceId }
  return navigator.mediaDevices.getUserMedia({ audio })
}

/** Acquire the system-audio loopback stream (default render endpoint).
 *  Replicates electron-audio-loopback's renderer flow via the preload bridge. */
export async function getSystemStream(): Promise<MediaStream> {
  await window.api.loopback.enable()
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    for (const track of stream.getVideoTracks()) {
      track.stop()
      stream.removeTrack(track)
    }
    return stream
  } finally {
    await window.api.loopback.disable()
  }
}
