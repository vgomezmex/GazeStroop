'use client'

import { useAppStore } from '@/stores/useAppStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { ClipboardList } from 'lucide-react'

type SectionJKey = 'difficultyPerceived' | 'concentrationRequired' | 'postFatigue' | 'postStress' | 'difficultyResponding'

interface SliderItem {
  key: SectionJKey
  label: string
  description: string
}

const SLIDERS: SliderItem[] = [
  {
    key: 'difficultyPerceived',
    label: 'Dificultad percibida de la prueba',
    description: '¿Qué tan difícil le resultó la prueba en general?',
  },
  {
    key: 'concentrationRequired',
    label: 'Nivel de concentración requerido',
    description: '¿Cuánta concentración necesitó para realizar la tarea?',
  },
  {
    key: 'postFatigue',
    label: 'Cansancio post-prueba',
    description: '¿Qué tan cansado/a se siente después de completar la prueba?',
  },
  {
    key: 'postStress',
    label: 'Nivel de estrés percibido durante la prueba',
    description: '¿Qué nivel de estrés experimentó durante la tarea?',
  },
  {
    key: 'difficultyResponding',
    label: 'Dificultad para responder correctamente',
    description: '¿Qué tan difícil fue dar la respuesta correcta en cada ensayo?',
  },
]

export default function PostExperimentJ() {
  const { sectionJ, setSectionJ, setAppState } = useAppStore()

  const handleValueChange = (key: SectionJKey, val: number[]) => {
    setSectionJ({ [key]: val[0] })
  }

  const handleSave = () => {
    setAppState('PARTICIPANT_EXPERIENCE_K')
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-start bg-gradient-to-b from-neutral-50 to-neutral-100 px-4 py-8">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 mb-3">
            <ClipboardList className="w-7 h-7 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900">
            Evaluación Global Post-Experimento
          </h1>
          <p className="text-sm text-neutral-500 max-w-md mx-auto">
            Valore los siguientes aspectos de su experiencia (0 a 10)
          </p>
        </div>

        {/* Sliders */}
        <div className="space-y-4">
          {SLIDERS.map((item) => (
            <Card key={item.key} className="border-neutral-200 bg-white shadow-sm">
              <CardContent className="p-4 md:p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold text-neutral-800">
                    {item.label}
                  </Label>
                  <span className="text-sm font-bold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full">
                    {sectionJ[item.key]}
                  </span>
                </div>
                <p className="text-sm text-neutral-500">{item.description}</p>
                <Slider
                  value={[sectionJ[item.key]]}
                  onValueChange={(v) => handleValueChange(item.key, v)}
                  min={0}
                  max={10}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-neutral-400">
                  <span>Nada</span>
                  <span>Muchísimo</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Save button */}
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            Guardar y Continuar
          </Button>
        </div>
      </div>
    </main>
  )
}
