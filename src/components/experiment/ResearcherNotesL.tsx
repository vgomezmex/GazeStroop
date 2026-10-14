'use client'

import { useState } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { ClipboardCheck } from 'lucide-react'

export default function ResearcherNotesL() {
  const {
    sectionL,
    setSectionL,
    setAppState,
    nasaTlx,
    sectionJ,
    sectionK,
    calibration,
    experimentalTrials,
    participantForm,
    participantId,
    sessionId,
    studyCode,
    researcherCode,
    config,
  } = useAppStore()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSaveAndGenerate = async () => {
    if (sectionL.excludedFromAnalysis && !sectionL.exclusionReason.trim()) {
      setError('Debe indicar el motivo de exclusión del análisis.')
      return
    }
    if (!participantId || !sessionId) {
      toast.error('Faltan datos de sesión. Vuelva a iniciar.')
      return
    }
    setError(null)
    setSaving(true)

    try {
      // Flatten trials: extract nested stimulus fields
      //
      // BUG CORREGIDO (causa raíz real de "RT/errores/omisiones siempre en
      // 0 para los primeros ensayos de cada bloque"): faltaba incluir `id`
      // aquí. Sin el id, /api/session/complete SIEMPRE hacía CREATE (nunca
      // UPDATE) para cada ensayo — aunque /api/trial/start ya había creado
      // la fila real en tiempo real (con las muestras de eye tracking
      // correctamente vinculadas a ella) y setTrialRealId ya había guardado
      // ese id correctamente en el store. El resultado: CADA ensayo
      // terminaba duplicado en la base de datos — la fila original (sin
      // respuesta, porque nunca se actualizaba) y una fila nueva creada al
      // final de la sesión (con la respuesta correcta, pero sin ninguna
      // muestra de mirada vinculada). Como las filas originales tienen un
      // trialStartedAt más temprano (se crean cuando se muestra cada
      // estímulo) y las duplicadas se crean todas casi al mismo instante al
      // final de la sesión, al ordenar por trialStartedAt las filas "vacías"
      // quedaban agrupadas al principio de cada bloque — exactamente el
      // patrón que reportó el tester.
      const flatTrials = experimentalTrials.map((t) => ({
        id: t.id,
        blockOrder: t.blockOrder,
        condition: t.condition,
        congruency: t.congruency,
        stimulusWord: t.stimulus.stimulusWord,
        stimulusInkColorHex: t.stimulus.stimulusInkColorHex,
        stimulusInkColorName: t.stimulus.stimulusInkColorName,
        correctAnswer: t.stimulus.correctAnswer,
        correctRoiPosition: t.stimulus.correctRoiPosition,
        distractorColors: t.stimulus.distractorColors,
        participantResponse: t.participantResponse,
        responseRoiPosition: t.responseRoiPosition,
        reactionTimeMs: t.reactionTimeMs,
        accuracy: t.accuracy,
        isOmission: t.isOmission,
        isPractice: t.isPractice,
        isValid: t.isValid,
        stimulusOnsetPerfNow: t.stimulusOnsetPerfNow,
        responsePerfNow: t.responsePerfNow,
      }))

      const body = {
        participantId,
        sessionId,
        participantData: participantForm,
        trials: flatTrials,
        // NASA-TLX (flattened)
        nasaMentalDemand: nasaTlx?.mentalDemand,
        nasaPhysicalDemand: nasaTlx?.physicalDemand,
        nasaTemporalDemand: nasaTlx?.temporalDemand,
        nasaPerformance: nasaTlx?.performance,
        nasaEffort: nasaTlx?.effort,
        nasaFrustration: nasaTlx?.frustration,
        nasaGlobalScore: nasaTlx?.globalScore,
        nasaWeightingMethod: nasaTlx?.method || config.nasaTlxMethod,
        // Section J (flattened)
        postDifficultyPerceived: sectionJ.difficultyPerceived,
        postConcentrationReq: sectionJ.concentrationRequired,
        postFatigue: sectionJ.postFatigue,
        postStress: sectionJ.postStress,
        postDifficultyResponding: sectionJ.difficultyResponding,
        // Section K (flattened)
        testClear: sectionK.testClear,
        instructionsClear: sectionK.instructionsClear,
        timeSufficient: sectionK.timeSufficient,
        hadDistractions: sectionK.hadDistractions,
        distractionDescription: sectionK.distractionDescription,
        hadTechnicalIssues: sectionK.hadTechnicalIssues,
        technicalIssueDesc: sectionK.technicalIssueDesc,
        additionalComments: sectionK.additionalComments,
        // Section L (flattened)
        researcherExcessiveHead: sectionL.excessiveHeadMovement,
        researcherTrackingProbs: sectionL.trackingProblems,
        researcherCalibStable: sectionL.calibStable,
        researcherInterruptions: sectionL.interruptions,
        researcherFollowedInstr: sectionL.followedInstructions,
        excludedFromAnalysis: sectionL.excludedFromAnalysis,
        exclusionReason: sectionL.exclusionReason,
        // Calibration
        calibrationStatus: calibration.status,
        calibrationErrorDeg: calibration.errorDeg,
        calibrationTimestamp: calibration.timestamp,
      }

      const res = await fetch('/api/session/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        toast.error(errData.error || 'Error al guardar la sesión')
        return
      }

      toast.success('Sesión guardada correctamente')
      setAppState('RESULTS_REPORT')
    } catch {
      toast.error('Error de conexión al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-start bg-gradient-to-b from-neutral-50 to-neutral-100 px-4 py-8">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-100 mb-3">
            <ClipboardCheck className="w-7 h-7 text-cyan-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900">
            Registro del Investigador
          </h1>
          <p className="text-sm text-neutral-500 max-w-md mx-auto">
            Complete esta sección al finalizar la sesión
          </p>
        </div>

        {/* Questions */}
        <div className="space-y-4">
          {/* 1. Movimientos excesivos de cabeza */}
          <Card className="border-neutral-200 bg-white shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-3">
              <Label className="text-base font-semibold text-neutral-800">
                1. ¿Movimientos excesivos de cabeza?
              </Label>
              <RadioGroup
                value={sectionL.excessiveHeadMovement}
                onValueChange={(v) => setSectionL({ excessiveHeadMovement: v })}
                className="flex flex-wrap gap-4"
              >
                {['No', 'Sí'].map((opt) => (
                  <div key={opt} className="flex items-center gap-2">
                    <RadioGroupItem value={opt} id={`head-${opt}`} />
                    <Label htmlFor={`head-${opt}`} className="text-sm font-normal text-neutral-700 cursor-pointer">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* 2. Problemas de seguimiento ocular */}
          <Card className="border-neutral-200 bg-white shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-3">
              <Label className="text-base font-semibold text-neutral-800">
                2. ¿Problemas de seguimiento ocular?
              </Label>
              <RadioGroup
                value={sectionL.trackingProblems}
                onValueChange={(v) => setSectionL({ trackingProblems: v })}
                className="flex flex-wrap gap-4"
              >
                {['No', 'Sí'].map((opt) => (
                  <div key={opt} className="flex items-center gap-2">
                    <RadioGroupItem value={opt} id={`track-${opt}`} />
                    <Label htmlFor={`track-${opt}`} className="text-sm font-normal text-neutral-700 cursor-pointer">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* 3. Calibración estable */}
          <Card className="border-neutral-200 bg-white shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-3">
              <Label className="text-base font-semibold text-neutral-800">
                3. ¿La calibración se mantuvo estable?
              </Label>
              <RadioGroup
                value={sectionL.calibStable}
                onValueChange={(v) => setSectionL({ calibStable: v })}
                className="flex flex-wrap gap-4"
              >
                {['Sí', 'No', 'Parcialmente'].map((opt) => (
                  <div key={opt} className="flex items-center gap-2">
                    <RadioGroupItem value={opt} id={`calib-${opt}`} />
                    <Label htmlFor={`calib-${opt}`} className="text-sm font-normal text-neutral-700 cursor-pointer">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* 4. Interrupciones */}
          <Card className="border-neutral-200 bg-white shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-3">
              <Label className="text-base font-semibold text-neutral-800">
                4. ¿Hubo interrupciones durante el experimento?
              </Label>
              <RadioGroup
                value={sectionL.interruptions}
                onValueChange={(v) => setSectionL({ interruptions: v })}
                className="flex flex-wrap gap-4"
              >
                {['No', 'Sí'].map((opt) => (
                  <div key={opt} className="flex items-center gap-2">
                    <RadioGroupItem value={opt} id={`inter-${opt}`} />
                    <Label htmlFor={`inter-${opt}`} className="text-sm font-normal text-neutral-700 cursor-pointer">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* 5. Seguimiento de instrucciones */}
          <Card className="border-neutral-200 bg-white shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-3">
              <Label className="text-base font-semibold text-neutral-800">
                5. ¿El participante comprendió y siguió las instrucciones?
              </Label>
              <RadioGroup
                value={sectionL.followedInstructions}
                onValueChange={(v) => setSectionL({ followedInstructions: v })}
                className="flex flex-wrap gap-4"
              >
                {['Sí', 'No', 'Parcialmente'].map((opt) => (
                  <div key={opt} className="flex items-center gap-2">
                    <RadioGroupItem value={opt} id={`follow-${opt}`} />
                    <Label htmlFor={`follow-${opt}`} className="text-sm font-normal text-neutral-700 cursor-pointer">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* 6. Exclusión del análisis */}
          <Card className="border-neutral-200 bg-white shadow-sm">
            <CardContent className="p-4 md:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold text-neutral-800">
                  6. ¿El registro debe excluirse del análisis?
                </Label>
                <Switch
                  checked={sectionL.excludedFromAnalysis}
                  onCheckedChange={(checked) => {
                    setSectionL({ excludedFromAnalysis: checked })
                    if (!checked) setSectionL({ exclusionReason: '' })
                  }}
                />
              </div>

              {sectionL.excludedFromAnalysis && (
                <div className="space-y-2">
                  <Label className="text-sm text-rose-600 font-medium">
                    Motivo de exclusión (obligatorio)
                  </Label>
                  <Textarea
                    value={sectionL.exclusionReason}
                    onChange={(e) => {
                      setSectionL({ exclusionReason: e.target.value })
                      if (error) setError(null)
                    }}
                    placeholder="Describa el motivo por el cual este registro debe excluirse..."
                    rows={3}
                    className={error ? 'border-rose-500 focus-visible:ring-rose-500' : ''}
                  />
                  {error && (
                    <p className="text-xs text-rose-600 font-medium">{error}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Save & Generate button */}
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSaveAndGenerate}
            disabled={saving}
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            {saving ? 'Guardando...' : 'Guardar y Generar Reporte'}
          </Button>
        </div>
      </div>
    </main>
  )
}
