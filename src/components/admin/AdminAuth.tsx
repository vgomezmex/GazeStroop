'use client'

import { useState } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Lock, LogIn } from 'lucide-react'

export default function AdminAuth() {
  const { setAdminAuth, setAppState } = useAppStore()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) {
      toast.error('Ingresa el código de acceso')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Código inválido')
      }

      const data = await res.json()
      setAdminAuth(code.trim(), data.name, data.role)
      setAppState('ADMIN_DASHBOARD')
      toast.success(`Bienvenido, ${data.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de autenticación')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 dark:from-stone-900 dark:to-stone-950 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <Lock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            Panel de Administración
          </CardTitle>
          <CardDescription>
            Ingresa tu código de acceso para continuar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-code">Código de acceso</Label>
              <Input
                id="admin-code"
                type="password"
                placeholder="Ingresa el código"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={loading}
                autoComplete="off"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !code.trim()}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Verificando…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  Iniciar sesión
                </span>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}