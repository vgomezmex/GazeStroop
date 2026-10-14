'use client'

import { useState } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Brain, ChevronLeft, ChevronRight } from 'lucide-react'

interface DimensionDef {
  key: 'mentalDemand' | 'physicalDemand' | 'temporalDemand' | 'performance' | 'effort' | 'frustration'
  label: string
  description: string
  note?: string
  // Etiquetas de los extremos del slider tal como las VE el participante.
  // Por defecto "Bajo"/"Alto" (0/100). Rendimiento es la única dimensión
  // donde el sentido se invierte para el participante (ver más abajo).
  lowLabel?: string
  highLabel?: string
}

const DIMENSIONS: DimensionDef[] = [
  {
    key: 'mentalDemand',
    label: 'Demanda Mental',
    description: '¿Cuánta demanda mental e intelectual se requirió?',
  },
  {
    key: 'physicalDemand',
    label: 'Demanda Física',
    description: '¿Cuánta actividad física se requirió?',
  },
  {
    key: 'temporalDemand',
    label: 'Demanda Temporal',
    description: '¿Sintió presión por el tiempo?',
  },
  {
    key: 'performance',
    label: 'Rendimiento',
    description: '¿Qué tan satisfecho está con su desempeño?',
    // BUG CORREGIDO: antes decía "0 = perfecto, 100 = muy deficiente",
    // pero el slider mostraba "Bajo" a la izquierda (0) y "Alto" a la
    // derecha (100) — es decir, mover el control hacia "Alto" (lo que
    // intuitivamente se lee como "mejor") en realidad reportaba el PEOR
    // desempeño. Confundía al participante (ver observación del tester:
    // deslizó a "Alto" pensando que eso significaba "100 perfecto").
    // Ahora el slider que VE el participante va en el sentido intuitivo
    // (derecha = mejor desempeño); internamente se sigue guardando en la
    // convención NASA-TLX estándar (0=perfecto, 100=deficiente) para que
    // el cálculo del puntaje global (que promedia las 6 dimensiones
    // asumiendo que "100 siempre es peor/más carga") no se vea afectado —
    // ver el comentario en handleValueChange.
    note: '0 = muy deficiente, 100 = perfecto',
    lowLabel: 'Deficiente',
    highLabel: 'Perfecto',
  },
  {
    key: 'effort',
    label: 'Esfuerzo',
    description: '¿Cuánto esfuerzo tuvo que hacer?',
  },
  {
    key: 'frustration',
    label: 'Frustración',
    description: '¿Qué tan frustrado/estresado se sintió?',
  },
]

export default function NasaTlxForm() {
  const { config, setNasaTlx, setAppState } = useAppStore()
  const step = config.nasaTlxStep || 5

  const [values, setValues] = useState<Record<string, number>>({
    mentalDemand: 50,
    physicalDemand: 50,
    temporalDemand: 50,
    performance: 50,
    effort: 50,
    frustration: 50,
  })

  const [page, setPage] = useState(0)
  const ITEMS_PER_PAGE_MOBILE = 2
  const ITEMS_PER_PAGE_DESKTOP = 6

  const totalDesktopPages = Math.ceil(DIMENSIONS.length / ITEMS_PER_PAGE_DESKTOP)
  const totalMobilePages = Math.ceil(DIMENSIONS.length / ITEMS_PER_PAGE_MOBILE)
  const isLastPage = page >= totalDesktopPages - 1

  const getVisibleDimensions = () => {
    // On desktop show all 6, on mobile paginate 2 at a time
    // We handle this via CSS classes
    return DIMENSIONS
  }

  // Convierte entre el valor MOSTRADO al participante (Rendimiento:
  // derecha=mejor desempeño, intuitivo) y el valor ALMACENADO internamente
  // (convención NASA-TLX estándar: 0=perfecto, 100=deficiente, la misma
  // dirección que las otras 5 dimensiones — necesaria para que el promedio
  // simple del puntaje global siga siendo válido sin tener que tocar esa
  // fórmula). Solo 'performance' se invierte; las demás dimensiones ya
  // están alineadas (0=bajo/bueno, 100=alto/malo) y no necesitan conversión.
  const toDisplayValue = (key: string, stored: number) => (key === 'performance' ? 100 - stored : stored)
  const toStoredValue = (key: string, displayed: number) => (key === 'performance' ? 100 - displayed : displayed)

  const handleValueChange = (key: string, displayedVal: number[]) => {
    setValues(prev => ({ ...prev, [key]: toStoredValue(key, displayedVal[0]) }))
  }

  const handleSubmit = () => {
    const globalScore =
      (values.mentalDemand +
        values.physicalDemand +
        values.temporalDemand +
        values.performance +
        values.effort +
        values.frustration) /
      6

    setNasaTlx({
      mentalDemand: values.mentalDemand,
      physicalDemand: values.physicalDemand,
      temporalDemand: values.temporalDemand,
      performance: values.performance,
      effort: values.effort,
      frustration: values.frustration,
      globalScore: Math.round(globalScore * 10) / 10,
      method: config.nasaTlxMethod || 'simple',
    })

    setAppState('POST_EXPERIMENT_J')
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-start bg-gradient-to-b from-neutral-50 to-neutral-100 px-4 py-8">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100 mb-3">
            <Brain className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900">
            Evaluación de Carga de Trabajo — NASA-TLX
          </h1>
          <p className="text-sm text-neutral-500 max-w-md mx-auto">
            Para cada dimensión, ajuste la barra según su experiencia durante la tarea
          </p>
        </div>

        {/* Progress indicator for mobile */}
        <div className="flex justify-center gap-1.5 md:hidden">
          {Array.from({ length: totalMobilePages }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === page
                  ? 'w-6 bg-emerald-500'
                  : i < page
                    ? 'w-4 bg-emerald-300'
                    : 'w-4 bg-neutral-200'
              }`}
            />
          ))}
        </div>

        {/* Dimension cards */}
        <div className="space-y-4">
          {DIMENSIONS.map((dim, idx) => {
            const isHiddenMobile = idx >= page * ITEMS_PER_PAGE_MOBILE + ITEMS_PER_PAGE_MOBILE || idx < page * ITEMS_PER_PAGE_MOBILE
            return (
              <Card
                key={dim.key}
                className={`border-neutral-200 bg-white shadow-sm transition-opacity ${isHiddenMobile ? 'md:opacity-100 opacity-0 h-0 md:h-auto overflow-hidden md:overflow-visible p-0 md:p-6 m-0 md:m-0' : 'opacity-100'}`}
              >
                <CardContent className="p-4 md:p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold text-neutral-800">
                      {dim.label}
                    </Label>
                    <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                      {toDisplayValue(dim.key, values[dim.key])}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-500">{dim.description}</p>
                  {dim.note && (
                    <p className="text-xs text-amber-600 font-medium">{dim.note}</p>
                  )}
                  <Slider
                    value={[toDisplayValue(dim.key, values[dim.key])]}
                    onValueChange={(v) => handleValueChange(dim.key, v)}
                    min={0}
                    max={100}
                    step={step}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-neutral-400">
                    <span>{dim.lowLabel ?? 'Bajo'}</span>
                    <span>{dim.highLabel ?? 'Alto'}</span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between pt-2">
          <Button
            variant="outline"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="md:hidden"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Anterior
          </Button>

          <Button
            onClick={handleSubmit}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Enviar Evaluación
          </Button>

          <Button
            variant="outline"
            onClick={() => setPage(p => Math.min(totalMobilePages - 1, p + 1))}
            disabled={page >= totalMobilePages - 1}
            className="md:hidden"
          >
            Siguiente
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </main>
  )
}
