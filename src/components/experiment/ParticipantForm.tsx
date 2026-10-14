'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  User,
  Eye,
  Moon,
  Brain,
  Coffee,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'

type StepId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

const STEPS: { id: StepId; label: string; icon: typeof User }[] = [
  { id: 'A', label: 'Sociodemográficos', icon: User },
  { id: 'B', label: 'Condiciones visuales', icon: Eye },
  { id: 'C', label: 'Sueño y fatiga', icon: Moon },
  { id: 'D', label: 'Estado actual', icon: Brain },
  { id: 'E', label: 'Consumo reciente', icon: Coffee },
  { id: 'F', label: 'Control exp.', icon: ClipboardCheck },
]

// --- Validation helpers ---
function validateSection(step: StepId, form: ReturnType<typeof useAppStore.getState>['participantForm']): string | null {
  switch (step) {
    case 'A':
      if (!form.fullName || form.fullName.trim().length < 3) return 'Ingrese el nombre completo del participante'
      if (!form.age || form.age < 18 || form.age > 100) return 'Ingrese una edad válida (18-100)'
      if (!form.sex) return 'Seleccione su sexo'
      if (!form.education) return 'Seleccione su escolaridad'
      if (!form.computerHoursPerDay) return 'Seleccione las horas de uso de computadora'
      return null
    case 'B':
      if (!form.glassesUse) return 'Seleccione uso de lentes'
      if (!form.visualDifficulty) return 'Seleccione si tiene dificultad visual'
      if (form.visualDifficulty === 'Sí' && !form.visualDifficultyDesc.trim())
        return 'Describa la dificultad visual'
      return null
    case 'C':
      if (form.hoursSleepLastNight === null || form.hoursSleepLastNight < 0 || form.hoursSleepLastNight > 24)
        return 'Ingrese horas de sueño válidas (0-24)'
      return null
    case 'D':
      return null // all sliders have defaults
    case 'E':
      if (form.caffeineLast3h === 'Sí') {
        if (!form.caffeineType.trim()) return 'Indique el tipo de cafeína'
        if (!form.caffeineAmount.trim()) return 'Indique la cantidad aproximada'
        if (!form.caffeineTime.trim()) return 'Indique la hora de consumo'
      }
      return null
    case 'F':
      if (!form.lastMealTime) return 'Indique la hora de la última comida'
      if (!form.locationComfort) return 'Indique si se siente cómodo/a'
      return null
  }
}

// --- Slider row component ---
function SliderField({
  label,
  value,
  onChange,
  min = 0,
  max = 10,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <Badge variant="outline" className="font-mono text-xs tabular-nums">
          {value}
        </Badge>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-neutral-400 w-4 text-right">{min}</span>
        <Slider
          value={[value]}
          onValueChange={([v]) => onChange(v)}
          min={min}
          max={max}
          step={step}
          className="flex-1"
        />
        <span className="text-xs text-neutral-400 w-6">{max}</span>
      </div>
    </div>
  )
}

export default function ParticipantForm() {
  const {
    participantForm,
    setParticipantForm,
    setAppState,
    setParticipantId,
    setSessionId,
    setStudyCode,
    researcherCode,
    studyCode,
    calibration,
    config,
  } = useAppStore()
  const [currentStep, setCurrentStep] = useState<StepId>('A')
  const [errors, setErrors] = useState<Record<StepId, string | null>>({
    A: null, B: null, C: null, D: null, E: null, F: null,
  })
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stepIndex = STEPS.findIndex((s) => s.id === currentStep)
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === STEPS.length - 1

  // --- Debounced auto-save (silent, no toast on success) ---
  const saveDraft = useCallback(async () => {
    try {
      await fetch('/api/participant/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...participantForm, studyCode: studyCode || '' }),
      })
    } catch {
      // Silent — don't spam toasts on every step change
    }
  }, [participantForm, studyCode])

  const scheduleDraftSave = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      saveDraft()
    }, 800)
  }, [saveDraft])

  // Save draft on step change
  useEffect(() => {
    scheduleDraftSave()
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [currentStep, scheduleDraftSave])

  const handleNext = () => {
    const err = validateSection(currentStep, participantForm)
    if (err) {
      setErrors((prev) => ({ ...prev, [currentStep]: err }))
      toast.error(err)
      return
    }
    setErrors((prev) => ({ ...prev, [currentStep]: null }))
    const nextIdx = stepIndex + 1
    if (nextIdx < STEPS.length) {
      setCurrentStep(STEPS[nextIdx].id)
    }
  }

  const handlePrev = () => {
    const prevIdx = stepIndex - 1
    if (prevIdx >= 0) {
      setCurrentStep(STEPS[prevIdx].id)
    }
  }

  const handleFinalSave = async () => {
    const err = validateSection(currentStep, participantForm)
    if (err) {
      setErrors((prev) => ({ ...prev, [currentStep]: err }))
      toast.error(err)
      return
    }
    try {
      const res = await fetch('/api/participant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...participantForm,
          researcherCode,
          studyCode: studyCode || undefined,
          consentVersion: config.consentVersion,
          calibrationStatus: calibration.status,
          calibrationErrorDeg: calibration.errorDeg,
          calibrationTimestamp: calibration.timestamp,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setParticipantId(data.participantId)
        setSessionId(data.sessionId)
        setStudyCode(data.studyCode)
        toast.success('Datos del participante guardados')
        setAppState('CALIBRATION')
      } else {
        toast.error(data.error || 'Error al guardar')
      }
    } catch {
      toast.error('Error al guardar los datos')
    }
  }

  const u = (field: string, value: unknown) => {
    setParticipantForm({ [field]: value })
    // Clear error for current step on change
    setErrors((prev) => ({ ...prev, [currentStep]: null }))
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      <div className="flex-1 flex flex-col items-center p-4 py-8">
        <div className="w-full max-w-2xl flex flex-col gap-6">
          {/* Title */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              Formulario del Participante
            </h1>
            <p className="text-neutral-500 text-sm">
              Complete las siguientes secciones antes de iniciar el experimento.
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
            {STEPS.map((step, i) => {
              const StepIcon = step.icon
              const isActive = step.id === currentStep
              const isPast = STEPS.findIndex((s) => s.id === currentStep) > i
              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(step.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                    isActive
                      ? 'bg-amber-100 border-amber-300 text-amber-800'
                      : isPast
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-white border-neutral-200 text-neutral-400 hover:text-neutral-600 hover:border-neutral-300'
                  }`}
                >
                  <StepIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{step.id}.</span>
                  <span>{step.label}</span>
                </button>
              )
            })}
          </div>

          {/* Error banner */}
          {errors[currentStep] && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-2 rounded-lg">
              {errors[currentStep]}
            </div>
          )}

          {/* ========== SECTION A: Sociodemográficos ========== */}
          {currentStep === 'A' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="h-5 w-5 text-amber-600" />
                  Sección A — Datos sociodemográficos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Nombre completo */}
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nombre completo *</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Ej. Juan Pérez García"
                    value={participantForm.fullName ?? ''}
                    onChange={(e) => u('fullName', e.target.value)}
                  />
                </div>

                {/* Edad */}
                <div className="space-y-2">
                  <Label htmlFor="age">Edad *</Label>
                  <Input
                    id="age"
                    type="number"
                    min={18}
                    max={100}
                    placeholder="Ej. 25"
                    value={participantForm.age ?? ''}
                    onChange={(e) =>
                      u('age', e.target.value ? Number(e.target.value) : null)
                    }
                    className="max-w-[200px]"
                  />
                </div>

                {/* Sexo */}
                <div className="space-y-3">
                  <Label>Sexo *</Label>
                  <RadioGroup
                    value={participantForm.sex}
                    onValueChange={(v) => u('sex', v)}
                    className="flex flex-wrap gap-x-6 gap-y-2"
                  >
                    {['Mujer', 'Hombre', 'Otro', 'Prefiero no responder'].map((opt) => (
                      <div key={opt} className="flex items-center gap-2">
                        <RadioGroupItem value={opt} id={`sex-${opt}`} />
                        <Label htmlFor={`sex-${opt}`} className="text-sm cursor-pointer">
                          {opt}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {/* Escolaridad */}
                <div className="space-y-2">
                  <Label>Escolaridad *</Label>
                  <Select
                    value={participantForm.education}
                    onValueChange={(v) => u('education', v)}
                  >
                    <SelectTrigger className="w-full max-w-xs">
                      <SelectValue placeholder="Seleccione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Educación básica">Educación básica</SelectItem>
                      <SelectItem value="Educación media superior">Educación media superior</SelectItem>
                      <SelectItem value="Licenciatura-Ingeniería">Licenciatura-Ingeniería</SelectItem>
                      <SelectItem value="Posgrado">Posgrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Horas de computadora */}
                <div className="space-y-2">
                  <Label>Horas de uso de computadora por día *</Label>
                  <Select
                    value={participantForm.computerHoursPerDay}
                    onValueChange={(v) => u('computerHoursPerDay', v)}
                  >
                    <SelectTrigger className="w-full max-w-xs">
                      <SelectValue placeholder="Seleccione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Menos de 1 hora">Menos de 1 hora</SelectItem>
                      <SelectItem value="1-2 horas">1-2 horas</SelectItem>
                      <SelectItem value="3-4 horas">3-4 horas</SelectItem>
                      <SelectItem value="5-6 horas">5-6 horas</SelectItem>
                      <SelectItem value="Más de 6 horas">Más de 6 horas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ========== SECTION B: Condiciones visuales ========== */}
          {currentStep === 'B' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Eye className="h-5 w-5 text-amber-600" />
                  Sección B — Condiciones visuales
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Uso de lentes */}
                <div className="space-y-2">
                  <Label>¿Usa lentes o lentes de contacto? *</Label>
                  <Select
                    value={participantForm.glassesUse}
                    onValueChange={(v) => u('glassesUse', v)}
                  >
                    <SelectTrigger className="w-full max-w-xs">
                      <SelectValue placeholder="Seleccione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="No">No</SelectItem>
                      <SelectItem value="Sí lentes">Sí, lentes</SelectItem>
                      <SelectItem value="Sí lentes de contacto">Sí, lentes de contacto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Dificultad visual */}
                <div className="space-y-2">
                  <Label>¿Tiene alguna dificultad visual? *</Label>
                  <Select
                    value={participantForm.visualDifficulty}
                    onValueChange={(v) => u('visualDifficulty', v)}
                  >
                    <SelectTrigger className="w-full max-w-xs">
                      <SelectValue placeholder="Seleccione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="No">No</SelectItem>
                      <SelectItem value="Sí">Sí</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Descripción de dificultad visual */}
                {participantForm.visualDifficulty === 'Sí' && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <Label htmlFor="visual-desc">Describa la dificultad visual *</Label>
                    <Textarea
                      id="visual-desc"
                      placeholder="Describa brevemente su condición visual..."
                      value={participantForm.visualDifficultyDesc}
                      onChange={(e) => u('visualDifficultyDesc', e.target.value)}
                      rows={3}
                      className="max-w-lg"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ========== SECTION C: Sueño y fatiga ========== */}
          {currentStep === 'C' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Moon className="h-5 w-5 text-amber-600" />
                  Sección C — Sueño y fatiga
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Horas de sueño */}
                <div className="space-y-2">
                  <Label htmlFor="hours-sleep">Horas de sueño anoche *</Label>
                  <Input
                    id="hours-sleep"
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    placeholder="Ej. 7.5"
                    value={participantForm.hoursSleepLastNight ?? ''}
                    onChange={(e) =>
                      u(
                        'hoursSleepLastNight',
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    className="max-w-[200px]"
                  />
                </div>

                <Separator />

                {/* Sliders */}
                <SliderField
                  label="Calidad del sueño"
                  value={participantForm.sleepQuality}
                  onChange={(v) => u('sleepQuality', v)}
                />
                <SliderField
                  label="Nivel de descanso"
                  value={participantForm.currentRestLevel}
                  onChange={(v) => u('currentRestLevel', v)}
                />
                <SliderField
                  label="Nivel de cansancio"
                  value={participantForm.currentFatigueLevel}
                  onChange={(v) => u('currentFatigueLevel', v)}
                />
              </CardContent>
            </Card>
          )}

          {/* ========== SECTION D: Estado actual ========== */}
          {currentStep === 'D' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Brain className="h-5 w-5 text-amber-600" />
                  Sección D — Estado actual (escalas 0-10)
                </CardTitle>
                <CardDescription>
                  Indique su estado actual en cada dimensión.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <SliderField
                  label="Cansancio"
                  value={participantForm.stateFatigue}
                  onChange={(v) => u('stateFatigue', v)}
                />
                <SliderField
                  label="Estrés"
                  value={participantForm.stateStress}
                  onChange={(v) => u('stateStress', v)}
                />
                <SliderField
                  label="Somnolencia"
                  value={participantForm.stateSleepiness}
                  onChange={(v) => u('stateSleepiness', v)}
                />
                <SliderField
                  label="Motivación"
                  value={participantForm.stateMotivation}
                  onChange={(v) => u('stateMotivation', v)}
                />
                <SliderField
                  label="Capacidad de concentración"
                  value={participantForm.stateConcentration}
                  onChange={(v) => u('stateConcentration', v)}
                />
              </CardContent>
            </Card>
          )}

          {/* ========== SECTION E: Consumo reciente ========== */}
          {currentStep === 'E' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Coffee className="h-5 w-5 text-amber-600" />
                  Sección E — Consumo reciente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Cafeína */}
                <div className="space-y-3">
                  <Label>¿Ha consumido cafeína en las últimas 3 horas? *</Label>
                  <RadioGroup
                    value={participantForm.caffeineLast3h}
                    onValueChange={(v) => u('caffeineLast3h', v)}
                    className="flex gap-6"
                  >
                    {['No', 'Sí'].map((opt) => (
                      <div key={opt} className="flex items-center gap-2">
                        <RadioGroupItem value={opt} id={`caffeine-${opt}`} />
                        <Label htmlFor={`caffeine-${opt}`} className="cursor-pointer">
                          {opt}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {participantForm.caffeineLast3h === 'Sí' && (
                  <div className="space-y-4 pl-2 border-l-2 border-amber-200 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="space-y-2">
                      <Label htmlFor="caff-type">Tipo *</Label>
                      <Input
                        id="caff-type"
                        placeholder="Ej. Café, té, bebida energética..."
                        value={participantForm.caffeineType}
                        onChange={(e) => u('caffeineType', e.target.value)}
                        className="max-w-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="caff-amount">Cantidad aproximada *</Label>
                      <Input
                        id="caff-amount"
                        placeholder="Ej. 1 taza, 250 ml..."
                        value={participantForm.caffeineAmount}
                        onChange={(e) => u('caffeineAmount', e.target.value)}
                        className="max-w-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="caff-time">Hora de consumo *</Label>
                      <Input
                        id="caff-time"
                        type="time"
                        value={participantForm.caffeineTime}
                        onChange={(e) => u('caffeineTime', e.target.value)}
                        className="max-w-[200px]"
                      />
                    </div>
                  </div>
                )}

                <Separator />

                {/* Alcohol */}
                <div className="space-y-3">
                  <Label>¿Ha consumido alcohol en las últimas 12 horas? *</Label>
                  <RadioGroup
                    value={participantForm.alcoholLast12h}
                    onValueChange={(v) => u('alcoholLast12h', v)}
                    className="flex gap-6"
                  >
                    {['No', 'Sí'].map((opt) => (
                      <div key={opt} className="flex items-center gap-2">
                        <RadioGroupItem value={opt} id={`alcohol-${opt}`} />
                        <Label htmlFor={`alcohol-${opt}`} className="cursor-pointer">
                          {opt}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <Separator />

                {/* Ejercicio */}
                <div className="space-y-3">
                  <Label>¿Ha realizado ejercicio físico en las últimas 3 horas? *</Label>
                  <RadioGroup
                    value={participantForm.exerciseLast3h}
                    onValueChange={(v) => u('exerciseLast3h', v)}
                    className="flex gap-6"
                  >
                    {['No', 'Sí'].map((opt) => (
                      <div key={opt} className="flex items-center gap-2">
                        <RadioGroupItem value={opt} id={`exercise-${opt}`} />
                        <Label htmlFor={`exercise-${opt}`} className="cursor-pointer">
                          {opt}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ========== SECTION F: Control experimental ========== */}
          {currentStep === 'F' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ClipboardCheck className="h-5 w-5 text-amber-600" />
                  Sección F — Control experimental
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Hora última comida */}
                <div className="space-y-2">
                  <Label htmlFor="last-meal">Hora de la última comida *</Label>
                  <Input
                    id="last-meal"
                    type="time"
                    value={participantForm.lastMealTime}
                    onChange={(e) => u('lastMealTime', e.target.value)}
                    className="max-w-[200px]"
                  />
                </div>

                {/* Comodidad */}
                <div className="space-y-3">
                  <Label>¿Se siente cómodo/a en el lugar actual? *</Label>
                  <RadioGroup
                    value={participantForm.locationComfort}
                    onValueChange={(v) => u('locationComfort', v)}
                    className="flex gap-6"
                  >
                    {['Sí', 'No'].map((opt) => (
                      <div key={opt} className="flex items-center gap-2">
                        <RadioGroupItem value={opt} id={`comfort-${opt}`} />
                        <Label htmlFor={`comfort-${opt}`} className="cursor-pointer">
                          {opt}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ========== Navigation buttons ========== */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              onClick={handlePrev}
              disabled={isFirstStep}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>

            {isLastStep ? (
              <Button
                onClick={handleFinalSave}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Save className="h-4 w-4" />
                Guardar y continuar
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
