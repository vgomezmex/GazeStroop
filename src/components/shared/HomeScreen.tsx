'use client'

import { useAppStore } from '@/stores/useAppStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useState, useEffect, useCallback } from 'react'
import {
  Play, Shield, Settings, BarChart3,
  Eye, Brain, FileText, ClipboardCheck, Loader2
} from 'lucide-react'

interface ResearcherOption {
  id: number
  code: string
  name: string
  email: string | null
  institution: string | null
  active: boolean
  createdAt: string
}

export default function HomeScreen() {
  const { setAppState, calibration, setParticipantForm, setResearcherCode, setStudyCode } = useAppStore()
  const [researcherText, setResearcherText] = useState('')
  const [researcherSelectValue, setResearcherSelectValue] = useState('')
  const [participantCode, setParticipantCode] = useState('')
  const [researchers, setResearchers] = useState<ResearcherOption[]>([])
  const [loadingResearchers, setLoadingResearchers] = useState(false)

  const fetchResearchers = useCallback(async () => {
    setLoadingResearchers(true)
    try {
      const res = await fetch('/api/researchers')
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data) ? data : data.researchers ?? []
        setResearchers(list.filter((r: ResearcherOption) => r.active !== false))
      }
    } catch {
      // Silently fail — user can still type manually
    } finally {
      setLoadingResearchers(false)
    }
  }, [])

  useEffect(() => {
    // fetchResearchers() marca loading=true de forma intencional al iniciar la carga; es el
    // patrón estándar de "fetch on mount". Falso positivo conocido de esta regla.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchResearchers()
  }, [fetchResearchers])

  const startSession = () => {
    // Determine researcher code: prefer dropdown selection, fall back to text input
    const selectedResearcher = researchers.find(r => r.code === researcherSelectValue)
    const code = selectedResearcher ? selectedResearcher.code : researcherText.trim()
    if (code) {
      setResearcherCode(code)
    }

    // Store participant code as study code if provided
    if (participantCode.trim()) {
      setStudyCode(participantCode.trim())
    }

    setParticipantForm({})
    setAppState('CONSENT')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100 flex flex-col">
      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-4xl space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-full text-sm font-medium">
              <Eye className="w-4 h-4" />
              <span>Stroop Eye-Tracking</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 tracking-tight">
              Sistema de Evaluación Neuropsicológica
            </h1>
            <p className="text-neutral-600 text-lg max-w-2xl mx-auto">
              Paradigma Stroop computarizado con registro de eye tracking para evaluar interferencia y carga cognitiva
            </p>
            <Badge variant="outline" className="text-xs">
              Basado en Yamamoto et al. (2026) — Frontiers in Aging Neuroscience
            </Badge>
          </div>

          {/* Main Actions */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* New Session Card */}
            <Card className="border-2 border-neutral-200 hover:border-emerald-300 transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Play className="w-6 h-6 text-emerald-700" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Nueva Sesión Experimental</CardTitle>
                    <CardDescription>Iniciar evaluación con un participante</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Researcher dropdown */}
                <div className="space-y-2">
                  <Label htmlFor="researcher-select">Investigador</Label>
                  <Select
                    value={researcherSelectValue}
                    onValueChange={(val) => {
                      setResearcherSelectValue(val)
                      // Clear text input when dropdown is used
                      setResearcherText('')
                    }}
                  >
                    <SelectTrigger id="researcher-select" className="w-full">
                      {loadingResearchers ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Cargando…
                        </span>
                      ) : (
                        <SelectValue placeholder="Seleccionar investigador…" />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {researchers.map((r) => (
                        <SelectItem key={r.code} value={r.code}>
                          {r.name} ({r.code})
                        </SelectItem>
                      ))}
                      {researchers.length === 0 && !loadingResearchers && (
                        <SelectItem value="__none" disabled>
                          No hay investigadores registrados
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    O ingresa el código manualmente abajo
                  </p>
                </div>

                {/* Researcher text fallback */}
                <div className="space-y-2">
                  <Label htmlFor="researcher">Código del investigador (manual)</Label>
                  <Input
                    id="researcher"
                    placeholder="Ej: INV-001"
                    value={researcherText}
                    onChange={(e) => {
                      setResearcherText(e.target.value)
                      // Clear dropdown when typing manually
                      setResearcherSelectValue('')
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pcode">Código del participante (opcional)</Label>
                  <Input
                    id="pcode"
                    placeholder="Se generará automáticamente si se deja vacío"
                    value={participantCode}
                    onChange={e => setParticipantCode(e.target.value)}
                  />
                </div>

                {/* Calibration indicator */}
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    calibration.status === 'success'
                      ? 'bg-emerald-500'
                      : calibration.status === 'failed'
                        ? 'bg-rose-500'
                        : 'bg-neutral-300'
                  }`} />
                  <span>
                    {calibration.status === 'success'
                      ? `Calibración completada${calibration.errorDeg != null ? ` (${calibration.errorDeg}°)` : ''}`
                      : calibration.status === 'failed'
                        ? 'Calibración fallida — debe repetirse'
                        : 'Se requiere calibración antes de iniciar'
                    }
                  </span>
                </div>

                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={startSession}
                  size="lg"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Iniciar Sesión
                </Button>
              </CardContent>
            </Card>

            {/* Admin Card */}
            <Card className="border-2 border-neutral-200 hover:border-amber-300 transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <Shield className="w-6 h-6 text-amber-700" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Panel de Administración</CardTitle>
                    <CardDescription>Investigadores y administración del sistema</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm text-neutral-600 p-2 bg-neutral-50 rounded">
                    <Settings className="w-4 h-4" />
                    <span>Configuración</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-neutral-600 p-2 bg-neutral-50 rounded">
                    <BarChart3 className="w-4 h-4" />
                    <span>Visualizaciones</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-neutral-600 p-2 bg-neutral-50 rounded">
                    <FileText className="w-4 h-4" />
                    <span>Exportar datos</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-neutral-600 p-2 bg-neutral-50 rounded">
                    <ClipboardCheck className="w-4 h-4" />
                    <span>Auditoría</span>
                  </div>
                </div>
                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => setAppState('ADMIN_AUTH')}
                  size="lg"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Acceder al Panel
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Info Footer */}
          <div className="text-center text-sm text-neutral-400 space-y-1">
            <p>Paradigma Stroop con Eye Tracking</p>
            <p>Estructura de 3 niveles: Participante → Sesión → Trial</p>
          </div>
        </div>
      </main>
    </div>
  )
}