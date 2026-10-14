'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { AVAILABLE_BLOCKS, DEFAULT_BLOCK_ORDER, type ExperimentConfig } from '@/types/experiment'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { ArrowLeft, Save, Loader2, GripVertical, MoveUp, MoveDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

const DEFAULT_CONFIG: ExperimentConfig = {
  blockOrder: [...DEFAULT_BLOCK_ORDER],
  trialsPerBlock: 40,
  maxExposureMs: 2000,
  interTrialIntervalMs: 1000,
  blockInstructionDurationMs: 6000,
  practiceTrialsPerCondition: 2,
  practiceMinAccuracy: 0.5,
  nasaTlxStep: 5,
  nasaTlxMethod: 'simple',
  excludeVisualDifficulty: true,
  anticipatoryRtThresholdMs: 200,
  stopSignalEnabled: false,
  eyeTrackerType: 'gazepoint',
  eyeTrackerSamplingHz: 60,
  eyeTrackerBridgeUrl: process.env.NEXT_PUBLIC_EYETRACKER_BRIDGE_URL || 'ws://127.0.0.1:4243',
  screenWidthCm: 34,
  viewingDistanceCm: 60,
  consentVersion: '1.0',
  studyName: 'Stroop Eye-Tracking',
  sampleSizeTarget: 100,
  researcherName: '',
  institutionName: '',
  researcherEmail: '',
  researcherPhone: '',
  ethicsApprovalNumber: '',
}

const BLOCK_INFO: Record<string, { label: string; congruency: string; colorClass: string }> = {
  NEUTRAL: { label: 'Neutral', congruency: 'Neutral', colorClass: 'bg-sky-100 text-sky-800' },
  WORD: { label: 'Word Test', congruency: 'Congruente', colorClass: 'bg-emerald-100 text-emerald-800' },
  REVERSE_STROOP: { label: 'Reverse Stroop', congruency: 'Incongruente', colorClass: 'bg-rose-100 text-rose-800' },
  COLOR: { label: 'Color Test', congruency: 'Congruente', colorClass: 'bg-emerald-100 text-emerald-800' },
  STROOP: { label: 'Stroop Test', congruency: 'Incongruente', colorClass: 'bg-rose-100 text-rose-800' },
}

function serializeConfig(config: ExperimentConfig): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(config)) {
    if (Array.isArray(value)) {
      result[key] = JSON.stringify(value)
    } else if (typeof value === 'boolean') {
      result[key] = value ? 'true' : 'false'
    } else if (typeof value === 'number') {
      result[key] = String(value)
    } else {
      result[key] = String(value)
    }
  }
  return result
}

function deserializeConfig(data: Record<string, string>): ExperimentConfig {
  const config = { ...DEFAULT_CONFIG }
  for (const [key, value] of Object.entries(data)) {
    if (!(key in config)) continue
    const typedKey = key as keyof ExperimentConfig
    if (typedKey === 'blockOrder') {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
          config.blockOrder = parsed
        }
      } catch { /* keep default */ }
    } else if (typedKey === 'nasaTlxMethod') {
      if (value === 'simple' || value === 'weighted') {
        config.nasaTlxMethod = value
      }
    } else if (typeof config[typedKey] === 'boolean') {
      (config as Record<string, unknown>)[typedKey] = value === 'true'
    } else if (typeof config[typedKey] === 'number') {
      (config as Record<string, unknown>)[typedKey] = parseFloat(value) || 0
    } else {
      (config as Record<string, unknown>)[typedKey] = value
    }
  }
  return config
}

export default function AdminConfig() {
  const { goBack, setConfig } = useAppStore()
  const [config, setLocalConfig] = useState<ExperimentConfig>(DEFAULT_CONFIG)
  const [originalConfig, setOriginalConfig] = useState<ExperimentConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/admin/config')
        if (!res.ok) throw new Error('Error al cargar configuración')
        const data = await res.json()
        const merged = deserializeConfig(data)
        setLocalConfig(merged)
        setOriginalConfig(merged)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al cargar configuración')
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [])

  const update = <K extends keyof ExperimentConfig>(key: K, value: ExperimentConfig[K]) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const serialized = serializeConfig(config)
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serialized),
      })
      if (!res.ok) throw new Error('Error al guardar configuración')
      setConfig(config)
      setOriginalConfig(config)
      toast.success('Configuración guardada correctamente')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  // Block order management
  const moveBlock = useCallback((index: number, direction: 'up' | 'down') => {
    setLocalConfig((prev) => {
      const newOrder = [...prev.blockOrder]
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= newOrder.length) return prev
      ;[newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]]
      return { ...prev, blockOrder: newOrder }
    })
  }, [])

  const addBlock = useCallback((condition: string) => {
    setLocalConfig((prev) => ({
      ...prev,
      blockOrder: [...prev.blockOrder, condition]
    }))
  }, [])

  const removeBlock = useCallback((index: number) => {
    setLocalConfig((prev) => {
      if (prev.blockOrder.length <= 1) {
        toast.error('Debe haber al menos un bloque')
        return prev
      }
      const newOrder = [...prev.blockOrder]
      newOrder.splice(index, 1)
      return { ...prev, blockOrder: newOrder }
    })
  }, [])

  const hasChanges = JSON.stringify(serializeConfig(config)) !== JSON.stringify(serializeConfig(originalConfig))

  // All block types available for adding (duplicates allowed)
  const allBlockTypes = Object.keys(AVAILABLE_BLOCKS)

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-950 dark:to-stone-900">
        <header className="border-b bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="mx-auto max-w-4xl px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={goBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold tracking-tight">Configuración</h1>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6 space-y-4">{Array.from({ length: 3 }).map((_, j) => <Skeleton key={j} className="h-10 w-full" />)}</CardContent></Card>
          ))}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-950 dark:to-stone-900">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-4xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={goBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold tracking-tight">Configuración</h1>
            {hasChanges && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full">
                Sin guardar
              </span>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        {/* Bloques — Order configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orden de Bloques</CardTitle>
            <CardDescription>Configura el orden y selección de bloques del experimento</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Ordered blocks list */}
            <div className="space-y-2">
              {config.blockOrder.map((condition, index) => {
                const info = BLOCK_INFO[condition]
                if (!info) return null
                return (
                  <div
                    key={`${condition}-${index}`}
                    className="flex items-center gap-3 rounded-lg border bg-white p-3"
                  >
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveBlock(index, 'up')}
                        disabled={index === 0}
                        className="p-0.5 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <MoveUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBlock(index, 'down')}
                        disabled={index === config.blockOrder.length - 1}
                        className="p-0.5 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <MoveDown className="h-4 w-4" />
                      </button>
                    </div>

                    <span className="text-lg font-bold text-neutral-300 tabular-nums w-6 text-center">
                      {index + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-800 text-sm">{info.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${info.colorClass}`}>
                          {info.congruency}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 truncate mt-0.5">
                        {AVAILABLE_BLOCKS[condition as keyof typeof AVAILABLE_BLOCKS]?.instruction}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-neutral-400 hover:text-rose-600"
                      onClick={() => removeBlock(index)}
                    >
                      <span className="text-lg leading-none">×</span>
                    </Button>
                  </div>
                )
              })}
            </div>

            {/* Add block */}
            <div className="flex items-center gap-2 pt-2">
              <span className="text-sm text-neutral-500">Agregar bloque:</span>
              <Select onValueChange={addBlock}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {allBlockTypes.map(c => (
                    <SelectItem key={c} value={c}>
                      {BLOCK_INFO[c]?.label || c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Ensayos y Tiempos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ensayos y Tiempos</CardTitle>
            <CardDescription>Configuración de ensayos por bloque, tiempos de presentación e intervalos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="trialsPerBlock">Ensayos por bloque</Label>
                <Input
                  id="trialsPerBlock"
                  type="number"
                  min={4}
                  max={48}
                  step={4}
                  value={config.trialsPerBlock}
                  onChange={(e) => update('trialsPerBlock', Math.max(4, Math.min(48, parseInt(e.target.value) || 40)))}
                />
                <p className="text-xs text-muted-foreground">Rango: 4–48 (debe ser múltiplo de 4 para balanceo equitativo por color)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxExposureMs">Tiempo de exposición por slide (ms)</Label>
                <Input
                  id="maxExposureMs"
                  type="number"
                  min={1000}
                  max={15000}
                  step={500}
                  value={config.maxExposureMs}
                  onChange={(e) => update('maxExposureMs', Math.max(1000, Math.min(15000, parseInt(e.target.value) || 7000)))}
                />
                <p className="text-xs text-muted-foreground">Rango: 1000–15000 ms</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="interTrialIntervalMs">Intervalo entre ensayos (ms)</Label>
                <Input
                  id="interTrialIntervalMs"
                  type="number"
                  min={200}
                  max={5000}
                  step={100}
                  value={config.interTrialIntervalMs}
                  onChange={(e) => update('interTrialIntervalMs', Math.max(200, Math.min(5000, parseInt(e.target.value) || 1000)))}
                />
                <p className="text-xs text-muted-foreground">Rango: 200–5000 ms (pantalla negra sin instrucciones)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="blockInstructionDurationMs">Duración instrucciones de bloque (ms)</Label>
                <Input
                  id="blockInstructionDurationMs"
                  type="number"
                  min={3000}
                  max={30000}
                  step={1000}
                  value={config.blockInstructionDurationMs}
                  onChange={(e) => update('blockInstructionDurationMs', Math.max(3000, Math.min(30000, parseInt(e.target.value) || 6000)))}
                />
                <p className="text-xs text-muted-foreground">Rango: 3000–30000 ms (cuenta regresiva al inicio de cada bloque)</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="practiceMinAccuracy">Precisión mínima en práctica</Label>
              <Input
                id="practiceMinAccuracy"
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={config.practiceMinAccuracy}
                onChange={(e) => update('practiceMinAccuracy', Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
              />
              <p className="text-xs text-muted-foreground">Rango: 0–1 (ej. 0.5 = 50%)</p>
            </div>
          </CardContent>
        </Card>

        {/* Experimento */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Experimento</CardTitle>
            <CardDescription>Parámetros generales del estudio</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="studyName">Nombre del estudio</Label>
                <Input
                  id="studyName"
                  value={config.studyName}
                  onChange={(e) => update('studyName', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sampleSizeTarget">Tamaño muestral objetivo</Label>
                <Input
                  id="sampleSizeTarget"
                  type="number"
                  min={1}
                  value={config.sampleSizeTarget}
                  onChange={(e) => update('sampleSizeTarget', parseInt(e.target.value) || 1)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* NASA-TLX */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">NASA-TLX</CardTitle>
            <CardDescription>Configuración del cuestionario de carga mental</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nasaTlxStep">Escala (step)</Label>
                <Input
                  id="nasaTlxStep"
                  type="number"
                  min={1}
                  max={20}
                  value={config.nasaTlxStep}
                  onChange={(e) => update('nasaTlxStep', Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                />
                <p className="text-xs text-muted-foreground">Rango: 1–20</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nasaTlxMethod">Método</Label>
                <Select
                  value={config.nasaTlxMethod}
                  onValueChange={(v) => update('nasaTlxMethod', v as 'simple' | 'weighted')}
                >
                  <SelectTrigger id="nasaTlxMethod">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">Simple (escala 0–21)</SelectItem>
                    <SelectItem value="weighted">Ponderado (15 comparaciones)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Eye Tracker */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eye Tracker</CardTitle>
            <CardDescription>Configuración del rastreador ocular (Gazepoint GP3 — Open Gaze API)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="eyeTrackerType">Tipo de eye tracker</Label>
                <Input
                  id="eyeTrackerType"
                  value={config.eyeTrackerType}
                  onChange={(e) => update('eyeTrackerType', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eyeTrackerSamplingHz">Frecuencia de muestreo (Hz)</Label>
                <Input
                  id="eyeTrackerSamplingHz"
                  type="number"
                  min={30}
                  max={2000}
                  value={config.eyeTrackerSamplingHz}
                  onChange={(e) => update('eyeTrackerSamplingHz', parseInt(e.target.value) || 60)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="eyeTrackerBridgeUrl">URL del bridge (WebSocket local)</Label>
                <Input
                  id="eyeTrackerBridgeUrl"
                  value={config.eyeTrackerBridgeUrl}
                  onChange={(e) => update('eyeTrackerBridgeUrl', e.target.value)}
                  placeholder="ws://127.0.0.1:4243"
                />
                <p className="text-xs text-muted-foreground">
                  Dirección del proceso <code>gazepoint-bridge</code> que debe estar corriendo en la
                  computadora del participante, conectado a Gazepoint Control. El navegador se conecta
                  a esta URL para recibir mirada y pupila en tiempo real.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="screenWidthCm">Ancho físico de pantalla (cm)</Label>
                <Input
                  id="screenWidthCm"
                  type="number"
                  min={1}
                  value={config.screenWidthCm}
                  onChange={(e) => update('screenWidthCm', parseFloat(e.target.value) || 34)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="viewingDistanceCm">Distancia de visión (cm)</Label>
                <Input
                  id="viewingDistanceCm"
                  type="number"
                  min={1}
                  value={config.viewingDistanceCm}
                  onChange={(e) => update('viewingDistanceCm', parseFloat(e.target.value) || 60)}
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Gazepoint Control no reporta el error de calibración en grados — solo como fracción de
                pantalla. Estos dos valores se usan para convertirlo a grados de ángulo visual; mídelos
                en tu laboratorio para mayor precisión.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Criterios de exclusión */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Criterios de exclusión</CardTitle>
            <CardDescription>Configuración automática de exclusión de participantes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="excludeVisualDifficulty">Excluir dificultad visual</Label>
                <p className="text-xs text-muted-foreground">Excluir automáticamente participantes con dificultad visual reportada</p>
              </div>
              <Switch
                id="excludeVisualDifficulty"
                checked={config.excludeVisualDifficulty}
                onCheckedChange={(v) => update('excludeVisualDifficulty', v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="stopSignalEnabled">Señal de parada (stop signal)</Label>
                <p className="text-xs text-muted-foreground">Habilitar tarea de señal de parada adicional</p>
              </div>
              <Switch
                id="stopSignalEnabled"
                checked={config.stopSignalEnabled}
                onCheckedChange={(v) => update('stopSignalEnabled', v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="anticipatoryRtThreshold">Umbral RT anticipatoria (ms)</Label>
                <p className="text-xs text-muted-foreground">Respuestas más rápidas que este umbral se marcan como anticipatorias</p>
              </div>
              <Input
                id="anticipatoryRtThreshold"
                type="number"
                className="w-24 text-right"
                value={config.anticipatoryRtThresholdMs}
                onChange={(e) => update('anticipatoryRtThresholdMs', parseInt(e.target.value) || 200)}
              />
            </div>
          </CardContent>
        </Card>
        {/* Consentimiento informado */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consentimiento informado</CardTitle>
            <CardDescription>Datos del investigador y ética que aparecen en el formulario de consentimiento</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="researcherName">Nombre del investigador responsable</Label>
                <Input
                  id="researcherName"
                  value={config.researcherName}
                  onChange={(e) => update('researcherName', e.target.value)}
                  placeholder="Ej: Dra. María García López"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="institutionName">Nombre de la institución</Label>
                <Input
                  id="institutionName"
                  value={config.institutionName}
                  onChange={(e) => update('institutionName', e.target.value)}
                  placeholder="Ej: Universidad Autónoma"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="researcherEmail">Correo electrónico de contacto</Label>
                <Input
                  id="researcherEmail"
                  type="email"
                  value={config.researcherEmail}
                  onChange={(e) => update('researcherEmail', e.target.value)}
                  placeholder="investigador@institucion.edu"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="researcherPhone">Teléfono de contacto</Label>
                <Input
                  id="researcherPhone"
                  value={config.researcherPhone}
                  onChange={(e) => update('researcherPhone', e.target.value)}
                  placeholder="Ej: +52 951 123 4567"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ethicsApprovalNumber">Número de aprobación ética</Label>
                <Input
                  id="ethicsApprovalNumber"
                  value={config.ethicsApprovalNumber}
                  onChange={(e) => update('ethicsApprovalNumber', e.target.value)}
                  placeholder="Ej: CEI-2025-001"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
