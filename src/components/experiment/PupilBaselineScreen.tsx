'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { useEyeTracker } from '@/hooks/useEyeTracker'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'

/**
 * Línea base pupilar — 10-second fixation screen shown before the first experimental block.
 * Displays a central fixation cross to establish baseline pupil diameter.
 */
export default function PupilBaselineScreen() {
  const setAppState = useAppStore((s) => s.setAppState)
  const sessionId = useAppStore((s) => s.sessionId)
  const bridgeUrl = useAppStore((s) => s.config.eyeTrackerBridgeUrl)
  const { startCapture, stopCapture } = useEyeTracker(bridgeUrl)
  const [countdown, setCountdown] = useState(10)
  const [started, setStarted] = useState(false)

  const startBaseline = useCallback(() => {
    setStarted(true)
  }, [])

  useEffect(() => {
    if (!started) return
    let remaining = 10

    // La línea base pupilar no pertenece a ningún ensayo formal, así que se
    // graba con phase='baseline' y trialId=null.
    if (sessionId) startCapture(sessionId, null, 'baseline')

    const interval = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        clearInterval(interval)
        stopCapture()
        setAppState('BLOCK_TRANSITION')
      } else {
        setCountdown(remaining)
      }
    }, 1000)

    return () => {
      clearInterval(interval)
      stopCapture()
    }
  }, [started, setAppState, sessionId, startCapture, stopCapture])

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center justify-center px-4">
      {!started ? (
        <div className="text-center space-y-6">
          <div className="inline-flex items-center justify-center rounded-full bg-amber-600/20 p-4">
            <Eye className="h-10 w-10 text-amber-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Línea Base Pupilar</h2>
            <p className="text-neutral-400 text-sm max-w-md">
              A continuación se tomará una medición de referencia de la pupila durante 10 segundos.
              Mantenga la mirada fija en el centro de la pantalla.
            </p>
          </div>
          <Button
            size="lg"
            onClick={startBaseline}
            className="bg-amber-600 hover:bg-amber-700 text-white px-8 text-base font-semibold"
          >
            Iniciar medición
          </Button>
        </div>
      ) : (
        <div className="text-center space-y-8">
          <p className="text-neutral-400 text-sm uppercase tracking-widest">
            Mantenga la mirada fija en el centro
          </p>
          {/* Fixation cross */}
          <div className="relative flex items-center justify-center">
            <div className="w-16 h-0.5 bg-white" />
            <div className="absolute w-0.5 h-16 bg-white" />
          </div>
          <div className="text-5xl font-bold tabular-nums text-amber-400">
            {countdown}
          </div>
        </div>
      )}
    </div>
  )
}
