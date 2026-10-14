'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

// Matches the Prisma AuditLog object returned by /api/admin/audit
// (with `admin: { name, role }` included via `include: { admin: { select: { name, role } } }`)
interface AuditEntry {
  id: string
  adminId: string | null
  researcherId: string | null
  participantId: string | null
  sessionId: string | null
  action: string
  details: string | null
  ipAddress: string | null
  createdAt: string | Date
  updatedAt: string | Date
  // Included relation
  admin: {
    name: string
    role: string
  } | null
  researcher: unknown | null
  participant: unknown | null
  session: unknown | null
}

export default function AdminAudit() {
  const { goBack } = useAppStore()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAudit = async () => {
      try {
        const res = await fetch('/api/admin/audit')
        if (!res.ok) throw new Error('Error al cargar auditoría')
        const data = await res.json()
        setEntries(Array.isArray(data) ? data.slice(0, 100) : (data.entries ?? []).slice(0, 100))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al cargar auditoría')
      } finally {
        setLoading(false)
      }
    }
    fetchAudit()
  }, [])

  const formatDate = (d: string | Date) => {
    try {
      return new Date(d).toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return '—'
    }
  }

  const actionColor = (action: string) => {
    if (action.toLowerCase().includes('login') || action.toLowerCase().includes('inicio')) {
      return 'text-emerald-700 dark:text-emerald-400'
    }
    if (action.toLowerCase().includes('export') || action.toLowerCase().includes('exportar')) {
      return 'text-cyan-700 dark:text-cyan-400'
    }
    if (action.toLowerCase().includes('config') || action.toLowerCase().includes('guardar')) {
      return 'text-amber-700 dark:text-amber-400'
    }
    if (action.toLowerCase().includes('excluir') || action.toLowerCase().includes('delete')) {
      return 'text-rose-700 dark:text-rose-400'
    }
    return ''
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-950 dark:to-stone-900">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold tracking-tight">Registro de auditoría</h1>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[180px]">Fecha</TableHead>
                    <TableHead className="w-[140px]">Admin</TableHead>
                    <TableHead className="w-[180px]">Acción</TableHead>
                    <TableHead>Detalles</TableHead>
                    <TableHead className="w-[130px] hidden md:table-cell">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 5 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        No hay registros de auditoría
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {formatDate(entry.createdAt)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {entry.admin?.name || '—'}
                        </TableCell>
                        <TableCell>
                          <span className={`font-medium text-sm ${actionColor(entry.action)}`}>
                            {entry.action}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                          {entry.details || '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground">
                          {entry.ipAddress || '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
