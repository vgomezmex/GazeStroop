'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { PRACTICE_CONFIG, STROOP_COLORS, PRACTICE_COLORS, type TrialData, type StroopColorName, type RoiPosition } from '@/types/experiment'

// Los ensayos de práctica usan PRACTICE_COLORS (Rosa/Naranja/Morado/Negro),
// nunca STROOP_COLORS — ver fix en useAppStore.ts (generateBalancedTrialsForBlock).
// Esta tabla combinada permite resolver el hex de cualquier color que venga
// en trial.stimulus sin asumir de cuál de las dos paletas proviene.
const ALL_COLORS: ReadonlyArray<{ name: string; hex: string }> = [...STROOP_COLORS, ...PRACTICE_COLORS]
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, XCircle, RotateCcw, ArrowRight, Target, Clock, BookOpen } from 'lucide-react'

type FeedbackState = 'idle' | 'correct' | 'incorrect' | 'omission'

// ============================================================
// Practice Block Intro — shown before each practice block
// ============================================================
function PracticeBlockIntro({
  blockLabel,
  blockIndex,
  totalBlocks,
  instruction,
  description,
  condition,
  onStart,
}: {
  blockLabel: string
  blockIndex: number
  totalBlocks: number
  instruction: string
  description: string
  condition: string
  onStart: () => void
}) {
  const congruencyColor =
    condition === 'NEUTRAL'
      ? 'text-sky-600 bg-sky-50 border-sky-200'
      : condition === 'WORD' || condition === 'COLOR'
        ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
        : 'text-rose-600 bg-rose-50 border-rose-200'

  const congruencyLabel =
    condition === 'NEUTRAL'
      ? 'Neutral'
      : condition === 'WORD' || condition === 'COLOR'
        ? 'Congruente'
        : 'Incongruente'

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <BookOpen className="h-6 w-6 text-amber-600" />
          <h1 className="text-2xl font-bold text-neutral-900">Práctica</h1>
        </div>

        {/* Progress: Block X of Y */}
        <p className="text-center text-sm text-neutral-500 mb-4">
          Bloque {blockIndex + 1} de {totalBlocks}
        </p>

        <Card className="border-neutral-200 shadow-sm">
          <CardContent className="pt-6 pb-6 space-y-5">
            {/* Block name + congruency badge */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-bold text-neutral-900">{blockLabel}</h2>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${congruencyColor}`}>
                {congruencyLabel}
              </span>
            </div>

            {/* Instruction */}
            <p className="text-base font-medium text-neutral-800 leading-relaxed">
              {instruction}
            </p>
            <p className="text-sm text-neutral-500 leading-relaxed">
              {description}
            </p>

            {/* Example stimulus */}
            <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-4">
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
                Ejemplo
              </p>
              <div className="flex flex-col items-center gap-3">
                {condition === 'WORD' && (
                  <>
                    <div className="inline-flex items-center justify-center rounded-lg border-2 border-neutral-200 bg-white px-8 py-5">
                      <span className="text-4xl font-black tracking-tight" style={{ color: '#000000' }}>
                        VERDE
                      </span>
                    </div>
                    <p className="text-sm text-neutral-700 font-medium">
                      Respuesta correcta: VERDE (la palabra dice VERDE)
                    </p>
                  </>
                )}
                {condition === 'NEUTRAL' && (
                  <>
                    <div className="inline-flex items-center justify-center rounded-lg border-2 border-neutral-200 bg-white px-8 py-5">
                      <span className="text-4xl font-black tracking-tight" style={{ color: STROOP_COLORS[1].hex }}>
                        XXXX
                      </span>
                    </div>
                    <p className="text-sm text-neutral-700 font-medium">
                      Respuesta correcta: AZUL (color de la tinta, ignorar XXXX)
                    </p>
                  </>
                )}
                {condition === 'COLOR' && (
                  <>
                    <div className="w-40 h-24 rounded-lg border-2 border-neutral-200" style={{ backgroundColor: STROOP_COLORS[2].hex }} />
                    <p className="text-sm text-neutral-700 font-medium">
                      Respuesta correcta: VERDE (el color del rectángulo es verde)
                    </p>
                  </>
                )}
                {condition === 'REVERSE_STROOP' && (
                  <>
                    <div className="inline-flex items-center justify-center rounded-lg border-2 border-neutral-200 bg-white px-8 py-5">
                      <span className="text-4xl font-black tracking-tight" style={{ color: STROOP_COLORS[3].hex }}>
                        VERDE
                      </span>
                    </div>
                    <p className="text-sm text-neutral-700 font-medium">
                      Respuesta correcta: VERDE (leer la palabra, ignorar la tinta café)
                    </p>
                  </>
                )}
                {condition === 'STROOP' && (
                  <>
                    <div className="inline-flex items-center justify-center rounded-lg border-2 border-neutral-200 bg-white px-8 py-5">
                      <span className="text-4xl font-black tracking-tight" style={{ color: STROOP_COLORS[0].hex }}>
                        VERDE
                      </span>
                    </div>
                    <p className="text-sm text-neutral-700 font-medium">
                      Respuesta correcta: ROJO (color de la tinta, ignorar la palabra)
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Trial count info */}
            <p className="text-sm text-neutral-500 text-center">
              Se realizarán {PRACTICE_CONFIG.slidesPerBlock} ensayos de práctica.
            </p>

            {/* Start button */}
            <div className="flex justify-center pt-2">
              <Button
                size="lg"
                onClick={onStart}
                className="bg-amber-600 hover:bg-amber-700 text-white px-8 text-base font-semibold"
              >
                <Target className="mr-2 h-5 w-5" />
                Iniciar práctica
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================
// Practice Trial View — handles all stimulus types
// ============================================================
function PracticeTrialView({
  trial,
  blockLabel,
  trialNumber,
  totalTrials,
  onAdvance,
}: {
  trial: TrialData
  blockLabel: string
  trialNumber: number
  totalTrials: number
  onAdvance: () => void
}) {
  const advancePracticeTrial = useAppStore((s) => s.advancePracticeTrial)
  const advancePracticeBlock = useAppStore((s) => s.advancePracticeBlock)

  const [feedback, setFeedback] = useState<FeedbackState>('idle')
  const [answered, setAnswered] = useState(false)

  const stimulusOnsetRef = useRef<number>(0)
  const answeredRef = useRef(false)
  const advanceRef = useRef(onAdvance)

  useEffect(() => { advanceRef.current = onAdvance })

  useEffect(() => {
    stimulusOnsetRef.current = performance.now()
  }, [])

  // BUG CORREGIDO (confunde al participante): antes había una fase
  // "observa el estímulo" de 2s en la que el botón parecía clicable pero no
  // hacía nada, seguida de una ventana de respuesta de 1.5s — un patrón que
  // el experimento REAL nunca tiene (ahí se puede responder desde el primer
  // instante en que aparece el estímulo). Ahora la práctica usa una sola
  // ventana, clicable de inmediato, igual que el experimento real. Se
  // conserva el mismo tiempo total disponible que antes (presentationMs +
  // responseWindowMs) para no acortar ni alargar la práctica sin que se
  // haya pedido.
  const totalWindowMs = PRACTICE_CONFIG.presentationMs + PRACTICE_CONFIG.responseWindowMs

  useEffect(() => {
    const timer = setTimeout(() => {
      if (answeredRef.current) return
      answeredRef.current = true
      setAnswered(true)
      setFeedback('omission')

      useAppStore.setState((s) => ({
        practiceResults: {
          correct: s.practiceResults.correct,
          incorrect: s.practiceResults.incorrect,
          omissions: s.practiceResults.omissions + 1,
          total: s.practiceResults.total + 1,
        },
      }))
    }, totalWindowMs)

    return () => clearTimeout(timer)
  }, [totalWindowMs])

  useEffect(() => {
    if (feedback === 'idle') return
    const timer = setTimeout(() => {
      // First advance the trial index
      advancePracticeTrial()
      // Then check if the block is now complete
      const state = useAppStore.getState()
      const currentBlock = state.activeBlocks[state.practiceBlockIndex]
      if (!currentBlock) return // all practice blocks done
      const blockTrials = state.practiceTrials.filter(t => t.blockOrder === currentBlock.blockOrder)
      if (state.practiceTrialIndex >= blockTrials.length) {
        advancePracticeBlock()
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [feedback])

  const handleOptionClick = useCallback(
    (colorName: string) => {
      if (answeredRef.current) return
      answeredRef.current = true

      const rtMs = performance.now() - stimulusOnsetRef.current
      const isCorrect = colorName === trial.stimulus.correctAnswer

      setAnswered(true)
      setFeedback(isCorrect ? 'correct' : 'incorrect')

      useAppStore.setState((s) => ({
        practiceResults: {
          correct: s.practiceResults.correct + (isCorrect ? 1 : 0),
          incorrect: s.practiceResults.incorrect + (isCorrect ? 0 : 1),
          omissions: s.practiceResults.omissions,
          total: s.practiceResults.total + 1,
        },
      }))
    },
    [trial]
  )

  const isColorTest = trial.condition === 'COLOR'
  const isWordBlack = trial.condition === 'WORD'

  return (
    <div className="h-screen overflow-hidden bg-neutral-200 text-neutral-900 flex flex-col relative">
      {/* Top bar — block label + trial counter */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3">
        <span className="text-xs font-medium border border-neutral-400 text-neutral-700 rounded-full px-2.5 py-0.5">
          PRÁCTICA — {blockLabel} — Ensayo {trialNumber}/{totalTrials}
        </span>
      </div>

      {/* Centro: estímulo + opciones agrupados y centrados como una sola
          unidad (mismo fix que TrialScreen — antes el estímulo por sí solo
          empujaba los botones de respuesta hasta el borde inferior). */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 sm:gap-6 px-4">
        {isColorTest ? (
          <div
            className="w-36 h-24 sm:w-48 sm:h-32 rounded-lg border border-neutral-200"
            style={{ backgroundColor: trial.stimulus.stimulusInkColorHex }}
          />
        ) : (
          <div className="rounded-lg px-8 py-5 bg-white shadow-lg">
            <span
              className="text-4xl sm:text-5xl font-black tracking-tight"
              style={{ color: isWordBlack ? '#000000' : trial.stimulus.stimulusInkColorHex }}
            >
              {trial.stimulus.stimulusWord}
            </span>
          </div>
        )}

        {/* Feedback */}
        {feedback !== 'idle' && (
          <div className="flex items-center gap-1.5 -mt-3">
            {feedback === 'correct' ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span className="text-emerald-700 font-semibold text-lg">¡Correcto!</span>
              </>
            ) : feedback === 'incorrect' ? (
              <>
                <XCircle className="h-5 w-5 text-rose-600" />
                <span className="text-rose-700 font-semibold text-lg">Incorrecto</span>
              </>
            ) : (
              <>
                <Clock className="h-5 w-5 text-amber-600" />
                <span className="text-amber-700 font-semibold text-lg">Sin respuesta</span>
              </>
            )}
          </div>
        )}

        {/* Options area — un poco más grandes (Requisitos v7) */}
        <div className="w-full max-w-md">
          <div className="relative min-h-[24vh]">
          {trial.stimulus.options.map((option) => {
            const positionStyles: Record<string, string> = {
              'top-left': 'top-0 left-0',
              'top-right': 'top-0 right-0',
              'bottom-left': 'bottom-0 left-0',
              'bottom-right': 'bottom-0 right-0',
            }
            const colorObj = ALL_COLORS.find((c) => c.name === option.color)
            const isThisCorrect = option.color === trial.stimulus.correctAnswer

            if (isColorTest) {
              return (
                <button
                  key={`${option.color}-${option.position}`}
                  onClick={() => handleOptionClick(option.color)}
                  disabled={answered}
                  className={`absolute ${positionStyles[option.position]}
                    rounded-lg px-4 sm:px-6 py-3 sm:py-4 min-w-[115px] sm:min-w-[140px] min-h-[60px] sm:min-h-[70px]
                    flex items-center justify-center
                    font-bold text-sm sm:text-base text-black shadow-lg border-2 border-neutral-300
                    transition-all duration-150 select-none
                    ${answered ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105 hover:shadow-xl active:scale-95 cursor-pointer'}
                    ${
                      (feedback === 'correct' || feedback === 'incorrect') && isThisCorrect
                        ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-neutral-200'
                        : ''
                    }`}
                  style={{ backgroundColor: '#FFFFFF' }}
                >
                  {option.color}
                </button>
              )
            }

            // Color puro, sin etiqueta con el nombre — consistente con
            // TrialScreen y con el paper de referencia.
            const bgColor = colorObj?.hex || '#666'
            return (
              <button
                key={`${option.color}-${option.position}`}
                onClick={() => handleOptionClick(option.color)}
                disabled={answered}
                className={`absolute ${positionStyles[option.position]}
                  rounded-lg px-4 sm:px-6 py-3 sm:py-4 min-w-[115px] sm:min-w-[140px] min-h-[60px] sm:min-h-[70px]
                  shadow-lg
                  transition-all duration-150 select-none
                  ${answered ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105 hover:shadow-xl active:scale-95 cursor-pointer'}
                  ${
                    (feedback === 'correct' || feedback === 'incorrect') && isThisCorrect
                      ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-neutral-200'
                      : ''
                  }`}
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

// ============================================================
// Main Practice Screen
// ============================================================
export default function PracticeScreen() {
  const getCurrentPracticeTrial = useAppStore((s) => s.getCurrentPracticeTrial)
  const isPracticeComplete = useAppStore((s) => s.isPracticeComplete)
  const practicePassed = useAppStore((s) => s.practicePassed)
  const practiceResults = useAppStore((s) => s.practiceResults)
  const setAppState = useAppStore((s) => s.setAppState)
  const resetPractice = useAppStore((s) => s.resetPractice)
  const config = useAppStore((s) => s.config)
  const practiceBlockIndex = useAppStore((s) => s.practiceBlockIndex)
  const activeBlocks = useAppStore((s) => s.activeBlocks)
  const getPracticeBlockTrials = useAppStore((s) => s.getPracticeBlockTrials)

  const [showIntro, setShowIntro] = useState(true)
  const trial = getCurrentPracticeTrial()
  const allDone = isPracticeComplete()
  const blockTrials = getPracticeBlockTrials()
  const currentBlock = activeBlocks[practiceBlockIndex]

  // Reset showIntro when block changes
  const prevBlockRef = useRef(practiceBlockIndex)
  useEffect(() => {
    if (prevBlockRef.current !== practiceBlockIndex) {
      setShowIntro(true)
      prevBlockRef.current = practiceBlockIndex
    }
  }, [practiceBlockIndex])

  const handleResetPractice = () => {
    resetPractice()
    setShowIntro(true)
  }

  const handleContinue = () => {
    setAppState('PUPIL_BASELINE')
  }

  // --- All blocks done: show summary ---
  if (allDone) {
    const passed = practicePassed()
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <Card className="w-full max-w-md shadow-sm border-neutral-200">
          <CardContent className="flex flex-col items-center gap-5 pt-8 pb-8">
            <div
              className={`rounded-full p-4 ${passed ? 'bg-emerald-100' : 'bg-rose-100'}`}
            >
              {passed ? (
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              ) : (
                <XCircle className="h-10 w-10 text-rose-600" />
              )}
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-neutral-900">
                {passed ? 'Práctica completada' : 'Practique nuevamente'}
              </h2>
              <p className="text-neutral-600 text-sm">
                {practiceResults.correct} de {practiceResults.total} correctas
              </p>
              {practiceResults.incorrect > 0 && (
                <p className="text-rose-500 text-xs">
                  {practiceResults.incorrect} incorrectas
                </p>
              )}
              {practiceResults.omissions > 0 && (
                <p className="text-amber-500 text-xs">
                  {practiceResults.omissions} sin respuesta
                </p>
              )}
              {!passed && (
                <p className="text-neutral-500 text-xs">
                  Se requiere al menos{' '}
                  {Math.round(config.practiceMinAccuracy * 100)}% de aciertos para continuar.
                </p>
              )}
            </div>

            {passed ? (
              <Button
                onClick={handleContinue}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6"
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                Continuar al experimento
              </Button>
            ) : (
              <Button
                onClick={handleResetPractice}
                variant="outline"
                className="border-rose-300 text-rose-600 hover:bg-rose-50 px-6"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reiniciar práctica
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // --- Show block intro ---
  // If we have a current block but no trial, show the intro
  if ((!trial && currentBlock) || (showIntro && currentBlock)) {
    return (
      <PracticeBlockIntro
        blockLabel={currentBlock.label}
        blockIndex={practiceBlockIndex}
        totalBlocks={activeBlocks.length}
        instruction={currentBlock.instruction}
        description={currentBlock.description}
        condition={currentBlock.condition}
        onStart={() => setShowIntro(false)}
      />
    )
  }

  // --- Show trial ---
  if (!trial || !currentBlock) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-neutral-500">Cargando...</p>
      </div>
    )
  }

  return (
    <PracticeTrialView
      key={`practice-${practiceBlockIndex}-${useAppStore.getState().practiceTrialIndex}`}
      trial={trial}
      blockLabel={currentBlock.label}
      trialNumber={useAppStore.getState().practiceTrialIndex + 1}
      totalTrials={blockTrials.length}
      onAdvance={() => {}}
    />
  )
}
