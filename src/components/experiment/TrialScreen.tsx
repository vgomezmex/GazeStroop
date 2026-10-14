'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { useEyeTracker } from '@/hooks/useEyeTracker'
import {
  STROOP_COLORS,
  type StroopColorName,
  type RoiPosition,
  type TrialData,
} from '@/types/experiment'
import { Badge } from '@/components/ui/badge'
import { Timer } from 'lucide-react'

type FeedbackFlash = 'idle' | 'correct' | 'incorrect' | 'omission'

interface TrialViewProps {
  trial: TrialData
  blockLabel: string
  blockCondition: string
  trialNumber: number
  totalTrials: number
  maxExposureMs: number
}

function TrialView({ trial, blockLabel, blockCondition, trialNumber, totalTrials, maxExposureMs }: TrialViewProps) {
  const recordResponse = useAppStore((s) => s.recordResponse)
  const recordOmission = useAppStore((s) => s.recordOmission)
  const advanceTrial = useAppStore((s) => s.advanceTrial)
  const advanceBlock = useAppStore((s) => s.advanceBlock)
  const isLastTrialOfBlock = useAppStore((s) => s.isLastTrialOfBlock)
  const isLastBlock = useAppStore((s) => s.isLastBlock)
  const setAppState = useAppStore((s) => s.setAppState)
  const setTrialRealId = useAppStore((s) => s.setTrialRealId)
  const sessionId = useAppStore((s) => s.sessionId)
  const bridgeUrl = useAppStore((s) => s.config.eyeTrackerBridgeUrl)
  const { startCapture, stopCapture } = useEyeTracker(bridgeUrl)

  const [feedbackFlash, setFeedbackFlash] = useState<FeedbackFlash>('idle')
  const [timeRemaining, setTimeRemaining] = useState(maxExposureMs)

  const stimulusOnsetRef = useRef<number>(performance.now())
  const rafRef = useRef<number>(0)
  const respondedRef = useRef(false)
  const advancedRef = useRef(false)

  // Crea el registro Trial en la BD en el momento en que se muestra el
  // estímulo (no al final de la sesión), y empieza a transmitir muestras de
  // eye tracking asociadas a ese trial. Los ensayos de práctica se omiten
  // del lado del servidor (sin fila, sin id) — el hook simplemente captura
  // con trialId: null en ese caso.
  useEffect(() => {
    let cancelled = false

    if (!trial.isPractice && sessionId && !trial.id) {
      fetch('/api/trial/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          blockOrder: trial.blockOrder,
          condition: trial.condition,
          congruency: trial.congruency,
          stimulusWord: trial.stimulus.stimulusWord,
          stimulusInkColorHex: trial.stimulus.stimulusInkColorHex,
          stimulusInkColorName: trial.stimulus.stimulusInkColorName,
          correctAnswer: trial.stimulus.correctAnswer,
          correctRoiPosition: trial.stimulus.correctRoiPosition,
          distractorColors: trial.stimulus.distractorColors,
          isPractice: trial.isPractice,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled && data?.trialId) {
            setTrialRealId(trial.clientTempId, data.trialId)
            startCapture(sessionId, data.trialId, 'trial')
          }
        })
        .catch((err) => console.error('Error creando trial en tiempo real:', err))
    } else if (sessionId) {
      startCapture(sessionId, trial.id || null, 'trial')
    }

    return () => {
      cancelled = true
      stopCapture()
    }
  }, [trial.blockOrder, trialNumber])

  // Start countdown timer on mount
  useEffect(() => {
    stimulusOnsetRef.current = performance.now()
    respondedRef.current = false
    advancedRef.current = false

    const tick = () => {
      const elapsed = performance.now() - stimulusOnsetRef.current
      const remaining = Math.max(0, maxExposureMs - elapsed)
      setTimeRemaining(remaining)

      if (remaining <= 0) {
        // Time expired — omission
        if (!respondedRef.current && !advancedRef.current) {
          advancedRef.current = true
          recordOmission()
          setFeedbackFlash('omission')
          setTimeout(() => {
            const wasLastTrial = isLastTrialOfBlock()
            const wasLastBlock = isLastBlock()
            advanceTrial()
            if (wasLastTrial) {
              advanceBlock()
              setAppState(wasLastBlock ? 'NASA_TLX' : 'BLOCK_TRANSITION')
            } else {
              setAppState('INTER_TRIAL_INTERVAL')
            }
          }, 1000)
        }
        return
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [maxExposureMs, recordOmission, advanceTrial, advanceBlock, isLastTrialOfBlock, isLastBlock, setAppState])

  const handleOptionClick = useCallback(
    (colorName: StroopColorName, position: RoiPosition) => {
      if (respondedRef.current || advancedRef.current) return

      respondedRef.current = true
      advancedRef.current = true

      // Stop the timer
      if (rafRef.current) cancelAnimationFrame(rafRef.current)

      const responsePerfNow = performance.now()
      const rtMs = responsePerfNow - stimulusOnsetRef.current

      const isCorrect = colorName === trial.stimulus.correctAnswer
      recordResponse(colorName, position, rtMs)
      setFeedbackFlash(isCorrect ? 'correct' : 'incorrect')

      // Brief feedback flash (300ms), then advance
      setTimeout(() => {
        const wasLastTrial = isLastTrialOfBlock()
        const wasLastBlock = isLastBlock()
        advanceTrial()
        if (wasLastTrial) {
          advanceBlock()
          setAppState(wasLastBlock ? 'NASA_TLX' : 'BLOCK_TRANSITION')
        } else {
          setAppState('INTER_TRIAL_INTERVAL')
        }
      }, 300)
    },
    [trial, recordResponse, advanceTrial, advanceBlock, isLastTrialOfBlock, isLastBlock, setAppState]
  )

  const secondsRemaining = Math.ceil(timeRemaining / 1000)
  const timerPercent = (timeRemaining / maxExposureMs) * 100

  // Feedback overlay color
  const overlayClass =
    feedbackFlash === 'correct'
      ? 'bg-emerald-600/20'
      : feedbackFlash === 'incorrect'
        ? 'bg-rose-600/20'
        : feedbackFlash === 'omission'
          ? 'bg-amber-600/20'
          : ''

  const isColorTest = blockCondition === 'COLOR'
  const isWordBlack = blockCondition === 'WORD'

  return (
    <div
      className={`min-h-screen bg-neutral-200 text-neutral-900 flex flex-col relative overflow-hidden ${overlayClass} transition-colors duration-200`}
    >
      {/* Top bar — condition badge + timer.
          BUG CORREGIDO (reportado por el tester): el botón fijo "Fin de
          experimento" (ExitExperimentButton, fixed top-3 right-3) se
          renderiza por encima de toda la pantalla y antes quedaba montado
          justo sobre la barra de tiempo, que también vivía pegada al borde
          derecho — tapándola por completo en vez de solo superponerse a su
          lado. Se reserva espacio a la derecha (pr-14 en móvil, donde el
          botón es solo ícono; pr-44 desde sm, donde además muestra el
          texto "Fin de experimento") para que la barra de tiempo quede
          siempre visible junto al botón, nunca debajo de él. */}
      <div className="flex items-center justify-between pl-4 sm:pl-6 pr-14 sm:pr-44 py-3">
        <Badge variant="outline" className="text-xs border-neutral-400 text-neutral-700">
          {blockLabel} — Ensayo {trialNumber}/{totalTrials}
        </Badge>

        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-neutral-500" />
          <div className="w-24 sm:w-32">
            <div className="h-2 rounded-full bg-neutral-300 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-100 ${
                  secondsRemaining <= 2
                    ? 'bg-rose-500'
                    : secondsRemaining <= 4
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${timerPercent}%` }}
              />
            </div>
          </div>
          <span className="text-xs text-neutral-600 tabular-nums w-6 text-right">
            {secondsRemaining}s
          </span>
        </div>
      </div>

      {/* Centro: estímulo + opciones de respuesta agrupados y centrados como
          una sola unidad (antes el estímulo solo tenía flex-1, empujando los
          botones de respuesta hasta el borde inferior de la pantalla). */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 sm:gap-8 px-4">
        {isColorTest ? (
          // COLOR TEST: Show a colored rectangle (no word)
          <div
            className="w-48 h-32 sm:w-64 sm:h-40 md:w-72 md:h-48 rounded-xl shadow-2xl"
            style={{ backgroundColor: trial.stimulus.stimulusInkColorHex }}
          />
        ) : (
          // WORD / REVERSE_STROOP / STROOP / NEUTRAL: Show word in color
          <div
            className="rounded-xl px-8 sm:px-12 py-5 sm:py-8 bg-white shadow-2xl"
          >
            <span
              className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight"
              style={{ color: isWordBlack ? '#000000' : trial.stimulus.stimulusInkColorHex }}
            >
              {trial.stimulus.stimulusWord}
            </span>
          </div>
        )}

        {/* Feedback messages */}
        {feedbackFlash === 'correct' && (
          <p className="text-emerald-700 font-semibold text-lg animate-pulse -mt-2">¡Correcto!</p>
        )}
        {feedbackFlash === 'incorrect' && (
          <p className="text-rose-700 font-semibold text-lg animate-pulse -mt-2">Incorrecto</p>
        )}
        {feedbackFlash === 'omission' && (
          <p className="text-amber-700 font-semibold text-lg -mt-2">Sin respuesta</p>
        )}

        {/* Opciones de respuesta — antes vivían en un bloque aparte, fijo al
            fondo de la pantalla (pb-8/pb-12). Ahora forman parte del mismo
            grupo centrado que el estímulo, y son un poco más grandes
            (Requisitos v7: "colocarlos en la parte del centro y aumentar
            un poco más su tamaño"). */}
        <div className="w-full max-w-md">
          <div className="relative min-h-[24vh]">
            {trial.stimulus.options.map((option) => {
              const positionStyles: Record<string, string> = {
              'top-left': 'top-0 left-0',
              'top-right': 'top-0 right-0',
              'bottom-left': 'bottom-0 left-0',
              'bottom-right': 'bottom-0 right-0',
            }
            const colorObj = STROOP_COLORS.find((c) => c.name === option.color)
            const isThisCorrect = option.color === trial.stimulus.correctAnswer

            if (isColorTest) {
              // COLOR TEST: Word labels on white background with black text
              return (
                <button
                  key={`${option.color}-${option.position}`}
                  onClick={() =>
                    handleOptionClick(
                      option.color as StroopColorName,
                      option.position as RoiPosition
                    )
                  }
                  disabled={feedbackFlash !== 'idle'}
                  className={`absolute ${positionStyles[option.position]}
                    rounded-lg px-4 sm:px-6 py-3 sm:py-4 min-w-[115px] sm:min-w-[140px] min-h-[60px] sm:min-h-[70px]
                    flex items-center justify-center
                    font-bold text-sm sm:text-base text-black shadow-lg border-2 border-neutral-300
                    transition-all duration-150 select-none
                    ${
                      feedbackFlash !== 'idle'
                        ? 'opacity-60 cursor-not-allowed'
                        : 'hover:scale-105 hover:shadow-xl active:scale-95 cursor-pointer'
                    }
                    ${
                      feedbackFlash === 'correct' && isThisCorrect
                        ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-neutral-200'
                        : ''
                    }
                    ${
                      feedbackFlash === 'incorrect' && isThisCorrect
                        ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-neutral-200'
                        : ''
                    }
                  `}
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  {option.color}
                </button>
              )
            }

            // WORD / REVERSE_STROOP / STROOP: Colored boxes (color puro, sin
            // etiqueta con el nombre — el paper de referencia no lleva texto
            // en estos botones; el participante identifica por percepción
            // visual del color, no leyendo una palabra).
            const bgColor = colorObj?.hex || '#666'
            return (
              <button
                key={`${option.color}-${option.position}`}
                onClick={() =>
                  handleOptionClick(
                    option.color as StroopColorName,
                    option.position as RoiPosition
                  )
                }
                disabled={feedbackFlash !== 'idle'}
                className={`absolute ${positionStyles[option.position]}
                  rounded-lg px-4 sm:px-6 py-3 sm:py-4 min-w-[115px] sm:min-w-[140px] min-h-[60px] sm:min-h-[70px]
                  flex items-center justify-center
                  shadow-lg
                  transition-all duration-150 select-none
                  ${
                    feedbackFlash !== 'idle'
                      ? 'opacity-60 cursor-not-allowed'
                      : 'hover:scale-105 hover:shadow-xl active:scale-95 cursor-pointer'
                  }
                  ${
                    feedbackFlash === 'correct' && isThisCorrect
                      ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-neutral-200'
                      : ''
                  }
                  ${
                    feedbackFlash === 'incorrect' && isThisCorrect
                      ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-neutral-200'
                      : ''
                  }
                `}
                style={{ backgroundColor: bgColor }}
                aria-label={option.color}
              />
            )
          })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TrialScreen() {
  const config = useAppStore((s) => s.config)
  const getCurrentTrial = useAppStore((s) => s.getCurrentTrial)
  const getCurrentBlockTrials = useAppStore((s) => s.getCurrentBlockTrials)
  const activeBlocks = useAppStore((s) => s.activeBlocks)
  const currentBlockIndex = useAppStore((s) => s.currentBlockIndex)
  const currentTrialIndex = useAppStore((s) => s.currentTrialIndex)

  const trial = getCurrentTrial()
  const blockDef = activeBlocks[currentBlockIndex]
  const blockTrials = getCurrentBlockTrials()
  const trialNumber = currentTrialIndex + 1
  const totalTrials = blockTrials.length

  if (!trial || !blockDef) {
    return (
      <div className="min-h-screen bg-neutral-200 flex items-center justify-center">
        <p className="text-neutral-500">Cargando ensayo...</p>
      </div>
    )
  }

  return (
    <TrialView
      key={`${currentBlockIndex}-${currentTrialIndex}`}
      trial={trial}
      blockLabel={blockDef.label}
      blockCondition={blockDef.condition}
      trialNumber={trialNumber}
      totalTrials={totalTrials}
      maxExposureMs={config.maxExposureMs}
    />
  )
}
