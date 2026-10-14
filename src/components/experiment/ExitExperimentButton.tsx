'use client'

import { useState } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { Button } from '@/components/ui/button'
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
import { LogOut, Loader2 } from 'lucide-react'
import type { AppState } from '@/types/experiment'

// Pantallas donde tiene sentido mostrar el botón de salida: todo el flujo
// del PARTICIPANTE. Se excluye HOME (ahí no hay nada de qué salir),
// RESULTS_REPORT (el experimento ya terminó) y todas las pantallas de
// ADMIN_* (son del investigador, no del participante).
const SHOW_ON_STATES: AppState[] = [
  'CONSENT', 'PARTICIPANT_FORM', 'CALIBRATION', 'INSTRUCTIONS', 'PRACTICE',
  'PUPIL_BASELINE', 'BLOCK_TRANSITION', 'TRIAL', 'INTER_TRIAL_INTERVAL',
  'BLOCK_COMPLETE', 'NASA_TLX', 'POST_EXPERIMENT_J', 'PARTICIPANT_EXPERIENCE_K',
  'RESEARCHER_NOTES_L',
]

/**
 * Botón de salida del experimento — presente en todas las pantallas del
 * participante (esquina superior derecha), en cumplimiento del derecho a
 * retirarse en cualquier momento que ya se le informa en el consentimiento.
 *
 * Al confirmar: si ya existe una sesión, se marca en el servidor como
 * completada-pero-excluida-del-análisis (con motivo), para que quede
 * registrada pero automáticamente señalada. Después se recarga la página
 * por completo — la forma más segura de garantizar que no quede ningún
 * resto de estado del participante que abandonó contaminando la sesión
 * del siguiente (el store de Zustand no persiste en localStorage, así que
 * una recarga completa restaura todo a su estado inicial limpio).
 */
export default function ExitExperimentButton() {
  const appState = useAppStore((s) => s.appState)
  const sessionId = useAppStore((s) => s.sessionId)
  const [open, setOpen] = useState(false)
  const [exiting, setExiting] = useState(false)

  if (!SHOW_ON_STATES.includes(appState)) return null

  const handleConfirm = async () => {
    setExiting(true)
    try {
      await fetch('/api/session/abandon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    } catch {
      // No bloqueamos la salida del participante aunque falle el guardado
      // en el servidor — su derecho a retirarse no depende de la red.
    } finally {
      window.location.reload()
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="fixed top-3 right-3 z-50 gap-1.5 bg-white/90 backdrop-blur-sm shadow-md border-neutral-300 text-neutral-600 hover:text-rose-700 hover:border-rose-300"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Fin de experimento</span>
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desea salir del experimento?</AlertDialogTitle>
            <AlertDialogDescription>
              Como se indicó en el consentimiento informado, puede retirarse en cualquier
              momento sin ninguna consecuencia. Si continúa, el experimento terminará ahora
              y no podrá retomarlo desde donde se quedó.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={exiting}>Continuar en el experimento</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirm()
              }}
              disabled={exiting}
              className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600"
            >
              {exiting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Sí, salir del experimento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
