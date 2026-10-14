'use client'

import { useAppStore } from '@/stores/useAppStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MessageSquare } from 'lucide-react'

export default function ParticipantExperienceK() {
  const { sectionK, setSectionK, setAppState } = useAppStore()

  const handleContinue = () => {
    setAppState('RESEARCHER_NOTES_L')
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-start bg-gradient-to-b from-neutral-50 to-neutral-100 px-4 py-8">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-100 mb-3">
            <MessageSquare className="w-7 h-7 text-rose-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900">
            Experiencia del Participante
          </h1>
          <p className="text-sm text-neutral-500 max-w-md mx-auto">
            Sus respuestas ayudan a mejorar el experimento
          </p>
        </div>

        {/* Questions */}
        <div className="space-y-4">
          {/* 1. ¿La prueba fue clara? */}
          <Card className="border-neutral-200 bg-white shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-3">
              <Label className="text-base font-semibold text-neutral-800">
                1. ¿La prueba fue clara?
              </Label>
              <RadioGroup
                value={sectionK.testClear}
                onValueChange={(v) => setSectionK({ testClear: v })}
                className="flex flex-wrap gap-4"
              >
                {['Sí', 'No', 'Parcialmente'].map((opt) => (
                  <div key={opt} className="flex items-center gap-2">
                    <RadioGroupItem value={opt} id={`clear-${opt}`} />
                    <Label htmlFor={`clear-${opt}`} className="text-sm font-normal text-neutral-700 cursor-pointer">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* 2. ¿Las instrucciones fueron fáciles de comprender? */}
          <Card className="border-neutral-200 bg-white shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-3">
              <Label className="text-base font-semibold text-neutral-800">
                2. ¿Las instrucciones fueron fáciles de comprender?
              </Label>
              <RadioGroup
                value={sectionK.instructionsClear}
                onValueChange={(v) => setSectionK({ instructionsClear: v })}
                className="flex flex-wrap gap-4"
              >
                {['Sí', 'No', 'Parcialmente'].map((opt) => (
                  <div key={opt} className="flex items-center gap-2">
                    <RadioGroupItem value={opt} id={`instr-${opt}`} />
                    <Label htmlFor={`instr-${opt}`} className="text-sm font-normal text-neutral-700 cursor-pointer">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* 3. ¿El tiempo para responder fue suficiente? */}
          <Card className="border-neutral-200 bg-white shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-3">
              <Label className="text-base font-semibold text-neutral-800">
                3. ¿El tiempo para responder fue suficiente?
              </Label>
              <RadioGroup
                value={sectionK.timeSufficient}
                onValueChange={(v) => setSectionK({ timeSufficient: v })}
                className="flex flex-wrap gap-4"
              >
                {['Sí', 'No', 'Algunas veces'].map((opt) => (
                  <div key={opt} className="flex items-center gap-2">
                    <RadioGroupItem value={opt} id={`time-${opt}`} />
                    <Label htmlFor={`time-${opt}`} className="text-sm font-normal text-neutral-700 cursor-pointer">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* 4. ¿Hubo distracciones? */}
          <Card className="border-neutral-200 bg-white shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-3">
              <Label className="text-base font-semibold text-neutral-800">
                4. ¿Hubo distracciones?
              </Label>
              <RadioGroup
                value={sectionK.hadDistractions}
                onValueChange={(v) => {
                  setSectionK({ hadDistractions: v })
                  if (v === 'No') setSectionK({ distractionDescription: '' })
                }}
                className="flex flex-wrap gap-4"
              >
                {['No', 'Sí'].map((opt) => (
                  <div key={opt} className="flex items-center gap-2">
                    <RadioGroupItem value={opt} id={`dist-${opt}`} />
                    <Label htmlFor={`dist-${opt}`} className="text-sm font-normal text-neutral-700 cursor-pointer">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {sectionK.hadDistractions === 'Sí' && (
                <Textarea
                  value={sectionK.distractionDescription}
                  onChange={(e) => setSectionK({ distractionDescription: e.target.value })}
                  placeholder="Describa las distracciones..."
                  className="mt-2"
                  rows={3}
                />
              )}
            </CardContent>
          </Card>

          {/* 5. ¿Hubo problemas técnicos? */}
          <Card className="border-neutral-200 bg-white shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-3">
              <Label className="text-base font-semibold text-neutral-800">
                5. ¿Hubo problemas técnicos?
              </Label>
              <RadioGroup
                value={sectionK.hadTechnicalIssues}
                onValueChange={(v) => {
                  setSectionK({ hadTechnicalIssues: v })
                  if (v === 'No') setSectionK({ technicalIssueDesc: '' })
                }}
                className="flex flex-wrap gap-4"
              >
                {['No', 'Sí'].map((opt) => (
                  <div key={opt} className="flex items-center gap-2">
                    <RadioGroupItem value={opt} id={`tech-${opt}`} />
                    <Label htmlFor={`tech-${opt}`} className="text-sm font-normal text-neutral-700 cursor-pointer">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {sectionK.hadTechnicalIssues === 'Sí' && (
                <Textarea
                  value={sectionK.technicalIssueDesc}
                  onChange={(e) => setSectionK({ technicalIssueDesc: e.target.value })}
                  placeholder="Describa los problemas técnicos..."
                  className="mt-2"
                  rows={3}
                />
              )}
            </CardContent>
          </Card>

          {/* 6. Comentarios adicionales */}
          <Card className="border-neutral-200 bg-white shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-3">
              <Label className="text-base font-semibold text-neutral-800">
                6. Comentarios adicionales <span className="text-neutral-400 font-normal">(opcional)</span>
              </Label>
              <Textarea
                value={sectionK.additionalComments}
                onChange={(e) => setSectionK({ additionalComments: e.target.value })}
                placeholder="Cualquier comentario o sugerencia..."
                rows={4}
              />
            </CardContent>
          </Card>
        </div>

        {/* Continue button */}
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleContinue}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            Continuar
          </Button>
        </div>
      </div>
    </main>
  )
}
