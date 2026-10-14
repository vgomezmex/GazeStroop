'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  ArrowLeft, Plus, Pencil, Trash2, Loader2, Search, Users, RotateCcw,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface Researcher {
  id: number
  code: string
  name: string
  email: string | null
  phone: string | null
  institution: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  institution: '',
}

export default function AdminResearchers() {
  const { goBack } = useAppStore()
  const [researchers, setResearchers] = useState<Researcher[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Researcher | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchResearchers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/researchers')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setResearchers(data)
    } catch {
      toast.error('Error al cargar investigadores')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // fetchResearchers() solo llama a setState después del `await fetch(...)`, nunca de forma
    // síncrona; es el patrón estándar de "fetch on mount". Falso positivo conocido de esta regla.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchResearchers()
  }, [fetchResearchers])

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (r: Researcher) => {
    setEditingId(r.id)
    setForm({
      name: r.name,
      email: r.email || '',
      phone: r.phone || '',
      institution: r.institution || '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        const res = await fetch(`/api/researchers/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Error al actualizar')
        }
        toast.success('Investigador actualizado')
      } else {
        const res = await fetch('/api/researchers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Error al crear')
        }
        const newResearcher = await res.json()
        toast.success(`Investigador ${newResearcher.code} creado`)
      }
      setDialogOpen(false)
      fetchResearchers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/researchers/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al eliminar')
      }
      toast.success(`Investigador ${deleteTarget.code} desactivado`)
      setDeleteTarget(null)
      fetchResearchers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setDeleting(false)
    }
  }

  const handleReactivate = async (r: Researcher) => {
    try {
      const res = await fetch(`/api/researchers/${r.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al reactivar')
      }
      toast.success(`${r.name} (${r.code}) reactivado`)
      fetchResearchers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    }
  }

  const filtered = researchers.filter(r => {
    if (statusFilter === 'active' && !r.active) return false
    if (statusFilter === 'inactive' && r.active) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      r.name.toLowerCase().includes(q) ||
      r.code.toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q)
    )
  })

  const inactiveCount = researchers.filter(r => !r.active).length

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100">
        <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={goBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold tracking-tight">Investigadores</h1>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6 space-y-3">{Array.from({ length: 3 }).map((_, j) => <Skeleton key={j} className="h-10 w-full" />)}</CardContent></Card>
          ))}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={goBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold tracking-tight">Investigadores</h1>
            <Badge variant="secondary" className="text-xs">
              {researchers.length} registrado{researchers.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo investigador
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, código o correo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5">
            {([['all', 'Todos'], ['active', 'Activos'], ['inactive', 'Inactivos']] as const).map(([val, label]) => (
              <Button
                key={val}
                variant={statusFilter === val ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
                onClick={() => setStatusFilter(val)}
              >
                {label}
                {val === 'inactive' && inactiveCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 text-[10px] px-1.5">{inactiveCount}</Badge>
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground font-medium">
                {search || statusFilter !== 'all'
                  ? 'Sin resultados para los filtros aplicados'
                  : 'No hay investigadores registrados'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {search || statusFilter !== 'all'
                  ? 'Intente con otros filtros o cambie el estado'
                  : 'Haga clic en "Nuevo investigador" para agregar uno'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[32rem] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="hidden md:table-cell">Correo</TableHead>
                      <TableHead className="hidden lg:table-cell">Teléfono</TableHead>
                      <TableHead className="hidden lg:table-cell">Institución</TableHead>
                      <TableHead className="w-[90px]">Estado</TableHead>
                      <TableHead className="w-[140px] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(r => (
                      <TableRow key={r.id} className={!r.active ? 'opacity-60' : ''}>
                        <TableCell>
                          <span className="font-mono text-xs font-semibold text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 px-2 py-0.5 rounded">
                            {r.code}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {r.email || '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground">
                          {r.phone || '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground max-w-[200px] truncate">
                          {r.institution || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.active ? 'default' : 'outline'} className={r.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30' : 'text-neutral-400'}>
                            {r.active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {r.active ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-destructive hover:text-destructive text-xs"
                                onClick={() => setDeleteTarget(r)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Desactivar</span>
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 text-xs"
                                onClick={() => handleReactivate(r)}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Reactivar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Editar investigador' : 'Nuevo investigador'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? `Modificando datos de ${form.name || 'investigador'}`
                : 'Se asignará un código automático (INV-XXX)'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="r-name">Nombre completo *</Label>
              <Input
                id="r-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Dra. María García López"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-email">Correo electrónico</Label>
              <Input
                id="r-email"
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="investigador@institucion.edu"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-phone">Teléfono</Label>
              <Input
                id="r-phone"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Ej: +52 951 123 4567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-institution">Institución</Label>
              <Input
                id="r-institution"
                value={form.institution}
                onChange={e => setForm(f => ({ ...f, institution: e.target.value }))}
                placeholder="Ej: Universidad Autónoma"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? 'Guardar cambios' : 'Crear investigador'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar investigador?</AlertDialogTitle>
            <AlertDialogDescription>
              Se desactivará a <strong>{deleteTarget?.name}</strong> ({deleteTarget?.code}).
              El investigador no podrá iniciar nuevas sesiones pero sus datos históricos se conservarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
