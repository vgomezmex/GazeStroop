'use client'

import { useAppStore } from '@/stores/useAppStore'
import { STROOP_COLORS } from '@/types/experiment'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BookOpen, ArrowRight } from 'lucide-react'

export default function InstructionsScreen() {
  const setAppState = useAppStore((s) => s.setAppState)
  const config = useAppStore((s) => s.config)
  const activeBlocks = useAppStore((s) => s.activeBlocks)
  const initExperimentTrials = useAppStore((s) => s.initExperimentTrials)
  const initPracticeTrials = useAppStore((s) => s.initPracticeTrials)

  const handleStartPractice = () => {
    initExperimentTrials()
    initPracticeTrials(config.practiceTrialsPerCondition)
    setAppState('PRACTICE')
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <BookOpen className="h-7 w-7 text-amber-600" />
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">
            Instrucciones de la Tarea
          </h1>
        </div>

        {/* Total trials info */}
        <p className="text-sm text-neutral-500 mb-6">
          Se realizarán <span className="font-semibold">{activeBlocks.length}</span> bloques de{' '}
          <span className="font-semibold">{config.trialsPerBlock}</span> ensayos cada uno
          ({config.trialsPerBlock / 4} por color, balanceados).
        </p>

        {/* Block cards */}
        {activeBlocks.map((block, index) => {
          return (
            <div key={`${block.condition}-${block.blockOrder}`}>
              <Card className="mb-4 border-neutral-200 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-lg font-semibold text-neutral-800">
                      Bloque {index + 1}: {block.label}
                    </CardTitle>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        block.congruency === 'congruent'
                          ? 'bg-emerald-100 text-emerald-800'
                          : block.congruency === 'neutral'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {block.congruency === 'congruent'
                        ? 'Congruente'
                        : block.congruency === 'neutral'
                          ? 'Neutral'
                          : 'Incongruente'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    <span className="font-medium text-neutral-800">Instrucción:</span>{' '}
                    {block.instruction}
                  </p>
                  <p className="text-sm text-neutral-500 leading-relaxed">
                    {block.description}
                  </p>

                  {/* Example stimulus */}
                  <div className="mt-3 rounded-lg bg-neutral-50 border border-neutral-100 p-4">
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
                      Ejemplo
                    </p>
                    <div className="flex flex-col items-center gap-3">
                      {block.condition === 'WORD' && (
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
                      {block.condition === 'NEUTRAL' && (
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
                      {block.condition === 'COLOR' && (
                        <>
                          <div
                            className="w-40 h-24 rounded-lg border-2 border-neutral-200"
                            style={{ backgroundColor: STROOP_COLORS[2].hex }}
                          />
                          <p className="text-sm text-neutral-700 font-medium">
                            Respuesta correcta: VERDE (el color del rectángulo es verde)
                          </p>
                        </>
                      )}
                      {block.condition === 'REVERSE_STROOP' && (
                        <>
                          <div className="inline-flex items-center justify-center rounded-lg border-2 border-neutral-200 bg-white px-8 py-5">
                            <span
                              className="text-4xl font-black tracking-tight"
                              style={{ color: STROOP_COLORS[3].hex }}
                            >
                              VERDE
                            </span>
                          </div>
                          <p className="text-sm text-neutral-700 font-medium">
                            Respuesta correcta: VERDE (leer la palabra, ignorar la tinta café)
                          </p>
                        </>
                      )}
                      {block.condition === 'STROOP' && (
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
                </CardContent>
              </Card>

              {index < activeBlocks.length - 1 && (
                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-neutral-200" />
                  <ArrowRight className="h-4 w-4 text-neutral-400" />
                  <div className="flex-1 h-px bg-neutral-200" />
                </div>
              )}
            </div>
          )
        })}

        {/* Start practice button */}
        <div className="mt-8 flex justify-center">
          <Button
            size="lg"
            onClick={handleStartPractice}
            className="bg-amber-600 hover:bg-amber-700 text-white px-8 py-3 text-base font-semibold"
          >
            <BookOpen className="mr-2 h-5 w-5" />
            Iniciar práctica
          </Button>
        </div>
      </div>
    </div>
  )
}
