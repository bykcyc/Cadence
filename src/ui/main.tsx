import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Overlay from './Overlay'
import { initRecorder } from './recorder/capture'
import { initDictationCapture } from './recorder/dictation-capture'
import { initTtsPlayback } from './recorder/tts-playback'
import './styles.css'

const isOverlay = window.location.hash.includes('overlay')

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

if (isOverlay) {
  // The overlay window renders only the dictation indicator (transparent).
  root.render(
    <React.StrictMode>
      <Overlay />
    </React.StrictMode>
  )
} else {
  // Main window: register the audio-capture + dictation bridges, then render the app.
  initRecorder()
  initDictationCapture()
  initTtsPlayback()
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
