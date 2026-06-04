import { useEffect, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, AlertCircle, Loader2 } from 'lucide-react'
import type { DictationState } from '@shared/types'

// Per-bar sensitivity so the meter looks like a natural waveform (taller in the middle).
const BAR_WEIGHTS = [0.5, 0.78, 1, 0.78, 0.5]

/** Live audio meter: bars rest flat when silent and rise with the mic level. */
function LevelBars({ level }: { level: number }): ReactNode {
  return (
    <div className="flex h-7 items-center justify-center gap-[3.5px]">
      {BAR_WEIGHTS.map((w, i) => (
        <span
          key={i}
          className="w-[3.5px] rounded-full bg-red-400"
          style={{ height: `${4 + level * 26 * w}px`, transition: 'height 70ms ease-out' }}
        />
      ))}
    </div>
  )
}

function StatusIcon({ phase }: { phase: DictationState['phase'] }): ReactNode {
  switch (phase) {
    case 'transcribing':
    case 'processing':
    case 'inserting':
      return <Loader2 className="h-6 w-6 animate-spin text-accent-400" />
    case 'done':
      return <Check className="h-6 w-6 text-emerald-400" />
    case 'error':
      return <AlertCircle className="h-6 w-6 text-red-400" />
    default:
      return null
  }
}

export default function Overlay(): ReactNode {
  const [state, setState] = useState<DictationState>({ phase: 'idle', kind: null, message: '' })
  const [level, setLevel] = useState(0)
  useEffect(() => window.api.dictation.onState(setState), [])
  useEffect(() => window.api.dictation.onLevel(setLevel), [])

  const visible = state.phase !== 'idle'
  const recording = state.phase === 'recording'

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-transparent">
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ y: 14, opacity: 0, scale: 0.8 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 14, opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 440, damping: 28 }}
            className="relative flex items-center justify-center"
          >
            {/* Voice-reactive halo — centered, with room to radiate (window is oversized). */}
            {recording && (
              <motion.span
                className="absolute h-14 w-14 rounded-full bg-red-500/25"
                animate={{ scale: 1 + level * 1.0, opacity: 0.3 + level * 0.45 }}
                transition={{ duration: 0.09, ease: 'easeOut' }}
              />
            )}
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900/90 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
              {recording ? <LevelBars level={level} /> : <StatusIcon phase={state.phase} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
