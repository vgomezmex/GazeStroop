'use client'

import { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { ArrowLeft, Download, Loader2, Clock, FileSpreadsheet, User } from 'lucide-react'

type ExportFormat = 'csv' | 'json' | 'excel' | 'statistical' | 'individual' | 'complete' | 'ml-dataset'

type DataLevel = 'participants' | 'sessions' | 'trials' | 'eyetracking' | 'nasatlx'

const DATA_LEVELS: { key: DataLevel; label: string }[] = [
  { key: 'participants', label: 'Participantes' },
  { key: 'sessions', label: 'Sesiones' },
  { key: 'trials', label: 'Ensayos' },
  { key: 'eyetracking', label: 'Eye Tracking' },
  { key: 'nasatlx', label: 'NASA-TLX' },
]

interface SessionOption {
  id: string
  participantId: string
  studyCode: string
  completedAt: string | null
}

export default function AdminExport() {
  const { goBack } = useAppStore()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [format, setFormat] = useState<ExportFormat>('statistical')
  const [anonymized, setAnonymized] = useState(true)
  const [levels, setLevels] = useState<DataLevel[]>(['sessions', 'trials'])
  const [exporting, setExporting] = useState(false)
  const [lastExport, setLastExport] = useState<string | null>(null)

  // Subject selection for statistical export
  const [sessions, setSessions] = useState<SessionOption[]>([])
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])
  const [sessionsLoaded, setSessionsLoaded] = useState(false)

  // Individual export session picker
  const [individualSession, setIndividualSession] = useState('')

  const isStatistical = format === 'statistical'
  const isIndividual = format === 'individual'
  const isComplete = format === 'complete'
  const isMlDataset = format === 'ml-dataset'

  useEffect(() => {
    if (!isStatistical && !isIndividual && !isComplete && !isMlDataset) return
    fetch('/api/admin/sessions')
      .then(r => r.json())
      .then((data) => {
        const list: SessionOption[] = (Array.isArray(data) ? data : (data as Record<string, unknown[]>)?.sessions || []).map((s: Record<string, unknown>) => ({
          id: String(s.id),
          participantId: String(s.participantId),
          studyCode: String((s as Record<string, unknown>).studyCode ?? '-'),
          completedAt: s.completedAt ? String(s.completedAt) : null,
        }))
        setSessions(list)
        setSessionsLoaded(true)
        // Default: select all
        setSelectedSubjects(list.map((s: SessionOption) => s.participantId))
      })
      .catch(() => setSessionsLoaded(true))
  }, [isStatistical, isIndividual, isComplete])

  const toggleLevel = (key: DataLevel) => {
    setLevels((prev) =>
      prev.includes(key) ? prev.filter((l) => l !== key) : [...prev, key]
    )
  }

  const toggleSubject = (participantId: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(participantId)
        ? prev.filter((id) => id !== participantId)
        : [...prev, participantId]
    )
  }

  const selectAllSubjects = () => setSelectedSubjects(sessions.map((s) => s.participantId))
  const deselectAllSubjects = () => setSelectedSubjects([])

  const handleExport = async () => {
    if (!isStatistical && !isIndividual && !isComplete && !isMlDataset && levels.length === 0) {
      toast.error('Selecciona al menos un nivel de datos')
      return
    }
    if (isIndividual && !individualSession) {
      toast.error('Selecciona una sesion para exportar')
      return
    }

    setExporting(true)
    try {
      const buildParams = (fmt: string) => {
        const params = new URLSearchParams()
        if (dateFrom) params.set('from', dateFrom)
        if (dateTo) params.set('to', dateTo)
        params.set('format', fmt)

        if (fmt === 'individual') {
          params.set('session', individualSession)
        } else if (isStatistical || isComplete || isMlDataset) {
          if (selectedSubjects.length > 0 && selectedSubjects.length < sessions.length) {
            params.set('subjects', selectedSubjects.join(','))
          }
        } else {
          params.set('anonymized', String(anonymized))
          params.set('levels', levels.join(','))
        }
        return params
      }

      const downloadOne = async (fmt: string, filename: string) => {
        const res = await fetch(`/api/admin/export?${buildParams(fmt).toString()}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `Error al exportar ${fmt}`)
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }

      if (isMlDataset) {
        // 4 archivos, uno por formato — el navegador maneja bien varias
        // descargas seguidas. Un pequeño espacio entre cada una evita que
        // algunos navegadores bloqueen descargas múltiples "simultáneas".
        const mlFiles: Array<[string, string]> = [
          ['ml-subject-context', 'stroop_ML_subject_context.csv'],
          ['ml-block-level', 'stroop_ML_block_level.csv'],
          ['ml-condition-summary', 'stroop_ML_condition_summary.csv'],
          ['ml-qc-subjects', 'stroop_ML_QC_subjects.csv'],
        ]
        for (const [fmt, filename] of mlFiles) {
          await downloadOne(fmt, filename)
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      } else {
        const ext = format === 'excel' ? 'xlsx' : format === 'statistical' || format === 'individual' || format === 'complete' ? 'csv' : format
        let prefix = 'stroop-export'
        if (format === 'statistical') prefix = 'stroop-analisis-estadistico'
        if (format === 'individual') prefix = 'stroop-individual'
        if (format === 'complete') prefix = 'stroop-datos-completos'
        await downloadOne(format, `${prefix}-${new Date().toISOString().slice(0, 10)}.${ext}`)
      }

      setLastExport(new Date().toLocaleString('es-ES'))
      toast.success('Exportacion completada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al exportar')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-950 dark:to-stone-900">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-4xl px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold tracking-tight">Exportar datos</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        {/* Rango de fechas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rango de fechas</CardTitle>
            <CardDescription>
              Deja vacio para incluir todos los datos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateFrom">Desde</Label>
                <Input id="dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateTo">Hasta</Label>
                <Input id="dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Formato */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Formato de exportacion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="exportFormat">Formato</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                <SelectTrigger id="exportFormat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="statistical">
                    <span className="flex items-center gap-2">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      CSV Estadistico (operacionalizacion)
                    </span>
                  </SelectItem>
                  <SelectItem value="individual">
                    <span className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5" />
                      CSV Individual por sujeto
                    </span>
                  </SelectItem>
                  <SelectItem value="complete">
                    <span className="flex items-center gap-2">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      CSV Datos Completos (un solo renglon por participante)
                    </span>
                  </SelectItem>
                  <SelectItem value="ml-dataset">
                    <span className="flex items-center gap-2">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Dataset ML (4 archivos)
                    </span>
                  </SelectItem>
                  <SelectItem value="csv">CSV crudo (.csv)</SelectItem>
                  <SelectItem value="json">JSON (.json)</SelectItem>
                  <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isStatistical && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-800">
                  <span className="font-semibold">CSV Estadistico:</span> Incluye todas las variables de operacionalizacion. Accuracy como valor numerico (1=correcto, 0=incorrecto). Incluye bloques neutrales.
                </p>
              </div>
            )}

            {isIndividual && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                <p className="text-sm text-sky-800">
                  <span className="font-semibold">CSV Individual:</span> Genera un archivo con las columnas: Time Stamp (ms) a 60Hz, Tipo de prueba, Error, Omision, Sexo, Resultado NASA TLX, Ensayo. Compatible con datos de eyetracker.
                </p>
              </div>
            )}

            {isComplete && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm text-emerald-800">
                  <span className="font-semibold">CSV Datos Completos:</span> Genera un archivo con un solo renglon por participante. Incluye todos los campos de los formularios (A-F), precision y RT promedio por cada condicion (Neutral, Word Test, Reverse Stroop, Color Test, Stroop Test), indices de interferencia (Stroop, relativa, costo de precision) y las 6 dimensiones NASA-TLX.
                </p>
              </div>
            )}

            {isMlDataset && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                <p className="text-sm text-sky-800">
                  <span className="font-semibold">Dataset ML:</span> Descarga 4 archivos preparados para analisis/Machine Learning — <code>subject_context</code> (contexto completo por sesion), <code>block_level</code> (una fila por bloque, sin repetir a nivel de ensayo), <code>condition_summary</code> (agregado por congruencia) y <code>QC_subjects</code> (control de calidad: datos faltantes e inconsistencias logicas por sujeto).
                </p>
              </div>
            )}

            {!isStatistical && !isIndividual && !isComplete && !isMlDataset && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="anonymized">Datos anonimizados</Label>
                  <p className="text-xs text-muted-foreground">
                    Eliminar informacion identificable de participantes
                  </p>
                </div>
                <Switch id="anonymized" checked={anonymized} onCheckedChange={setAnonymized} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Individual: session picker */}
        {isIndividual && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Seleccionar sesion</CardTitle>
              <CardDescription>Elige la sesion del sujeto a exportar</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={individualSession} onValueChange={setIndividualSession}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una sesion..." />
                </SelectTrigger>
                <SelectContent>
                  {sessions.filter((s) => s.completedAt).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.studyCode} — {new Date(s.completedAt!).toLocaleDateString('es-ES')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sessions.filter((s) => s.completedAt).length === 0 && sessionsLoaded && (
                <p className="text-sm text-muted-foreground mt-2">No hay sesiones completadas disponibles.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Statistical & Complete: subject selector */}
        {(isStatistical || isComplete || isMlDataset) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Seleccion de sujetos</CardTitle>
              <CardDescription>Filtra que participantes se incluyen en la exportacion</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllSubjects}>Todos</Button>
                <Button variant="outline" size="sm" onClick={deselectAllSubjects}>Ninguno</Button>
                <span className="text-sm text-muted-foreground self-center ml-auto">
                  {selectedSubjects.length} de {sessions.length} seleccionados
                </span>
              </div>
              <div className="max-h-[60vh] overflow-y-auto rounded-lg border p-2 space-y-1">
                {sessions.filter((s) => s.completedAt).map((s) => (
                  <div key={s.participantId} className="flex items-center space-x-3 rounded-md px-2 py-1.5 hover:bg-stone-50">
                    <Checkbox
                      checked={selectedSubjects.includes(s.participantId)}
                      onCheckedChange={() => toggleSubject(s.participantId)}
                    />
                    <Label className="cursor-pointer flex-1 text-sm">{s.studyCode}</Label>
                  </div>
                ))}
                {sessions.filter((s) => s.completedAt).length === 0 && sessionsLoaded && (
                  <p className="text-sm text-muted-foreground text-center py-2">No hay sesiones completadas.</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Nivel de datos - solo formatos basicos */}
        {!isStatistical && !isIndividual && !isComplete && !isMlDataset && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nivel de datos</CardTitle>
              <CardDescription>Selecciona que datos incluir en la exportacion</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DATA_LEVELS.map(({ key, label }) => (
                  <div key={key} className="flex items-center space-x-3 rounded-lg border p-3">
                    <Checkbox
                      id={`level-${key}`}
                      checked={levels.includes(key)}
                      onCheckedChange={() => toggleLevel(key)}
                    />
                    <Label htmlFor={`level-${key}`} className="cursor-pointer flex-1">
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Export button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <Button
            onClick={handleExport}
            disabled={exporting}
            size="lg"
            className="gap-2"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {exporting ? 'Exportando...' : 'Exportar datos'}
          </Button>

          {lastExport && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Ultima exportacion: {lastExport}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
