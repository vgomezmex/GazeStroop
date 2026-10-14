'use client'

import { useMemo, useState } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { FileText, Shield, ArrowLeft } from 'lucide-react'
import { AVAILABLE_BLOCKS } from '@/types/experiment'
import type { Condition } from '@/types/experiment'

export default function ConsentForm() {
  const { config, setConsentAccepted, setAppState, goBack } = useAppStore()
  const [checkGeneral, setCheckGeneral] = useState(false)
  const [checkEyeTracking, setCheckEyeTracking] = useState(false)

  const bothChecked = checkGeneral && checkEyeTracking

  const handleAccept = () => {
    setConsentAccepted(true)
    setAppState('PARTICIPANT_FORM')
  }

  const researcherName = config.researcherName || '[No configurado — defínalo en el panel de administración]'
  const institutionName = config.institutionName || '[No configurado — defínalo en el panel de administración]'
  const researcherEmail = config.researcherEmail || '[No configurado]'
  const researcherPhone = config.researcherPhone || '[No configurado]'
  const ethicsApproval = config.ethicsApprovalNumber || '[Pendiente de asignación]'

  const isMissingConfig = !config.researcherName || !config.institutionName

  // Dynamic block descriptions from config.blockOrder
  const blockDescriptions = useMemo(() => {
    const activeBlocks = config.blockOrder
      .filter((c) => c in AVAILABLE_BLOCKS)
      .map((c) => AVAILABLE_BLOCKS[c as Condition])

    const neutralTotal = activeBlocks.filter((b) => b.condition === 'NEUTRAL').length
    let neutralIdx = 0

    return activeBlocks.map((block, i) => {
      let label: string = block.label
      let description: string = block.description

      if (block.condition === 'NEUTRAL' && neutralTotal > 1) {
        neutralIdx++
        label = `Línea base pupilar (Neutral ${neutralIdx})`
        description += neutralIdx === 1
          ? ' Este bloque sirve como línea base para la medición pupilar.'
          : ' Este bloque sirve como segunda línea base para la medición pupilar.'
      }

      return { blockNum: i + 1, label, description }
    })
  }, [config.blockOrder])

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col">
      {/* Header — sticky */}
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-5 w-5 text-amber-600 shrink-0" />
            <h1 className="text-lg font-bold tracking-tight truncate">
              Consentimiento Informado
            </h1>
          </div>
        </div>
        {isMissingConfig && (
          <p className="max-w-3xl mx-auto mt-1.5 text-xs text-amber-700 bg-amber-50 rounded px-3 py-1.5">
            ⚠ Algunos campos del consentimiento no están configurados. Complete los datos en el panel de administración → Configuración.
          </p>
        )}
      </header>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {/* Study name subtitle */}
          <p className="text-center text-neutral-500 text-sm">
            {config.studyName}
          </p>

          {/* Main consent document */}
          <Card className="shadow-lg border-neutral-200">
            <CardContent className="p-6 space-y-6 text-sm leading-relaxed text-neutral-700">

              {/* 1. Título del estudio */}
              <section>
                <h2 className="text-base font-semibold text-neutral-900 mb-2">
                  1. Título del estudio
                </h2>
                <p>
                  Evaluación neuropsicológica mediante paradigma Stroop
                  computarizado con registro de eye tracking.
                </p>
              </section>

              <Separator />

              {/* 2. Investigador responsable */}
              <section>
                <h2 className="text-base font-semibold text-neutral-900 mb-2">
                  2. Investigador responsable
                </h2>
                <p className={isMissingConfig ? 'text-amber-700 font-medium' : ''}>
                  {researcherName}
                </p>
              </section>

              <Separator />

              {/* 3. Institución */}
              <section>
                <h2 className="text-base font-semibold text-neutral-900 mb-2">
                  3. Institución
                </h2>
                <p className={isMissingConfig ? 'text-amber-700 font-medium' : ''}>
                  {institutionName}
                </p>
              </section>

              <Separator />

              {/* 4. Propósito */}
              <section>
                <h2 className="text-base font-semibold text-neutral-900 mb-2">
                  4. Propósito del estudio
                </h2>
                <p>
                  El propósito de esta investigación es evaluar la interferencia
                  cognitiva y la carga de trabajo utilizando el paradigma Stroop
                  con registro simultáneo de eye tracking. El estudio busca
                  comprender los patrones de mirada y las respuestas
                  conductuales ante estímulos congruentes e incongruentes,
                  contribuyendo al conocimiento en neurociencia cognitiva.
                </p>
              </section>

              <Separator />

              {/* 5. Procedimiento */}
              <section>
                <h2 className="text-base font-semibold text-neutral-900 mb-2">
                  5. Procedimiento
                </h2>
                <p className="mb-3">
                  La sesión experimental consiste en la presentación de
                  palabras de colores y rectángulos de color en la pantalla de
                  una computadora. Usted deberá responder seleccionando el
                  color correspondiente según la instrucción dada en cada
                  bloque. El experimento incluye los siguientes {blockDescriptions.length} bloques:
                </p>
                <div className="space-y-3 ml-1">
                  {blockDescriptions.map((bd) => (
                    <div key={bd.blockNum} className="flex gap-3">
                      <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-neutral-400" />
                      <p>
                        <strong>Bloque {bd.blockNum} — {bd.label}:</strong>{' '}
                        {bd.description}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3">
                  Antes de las pruebas experimentales, se realizará una breve
                  práctica para familiarizarse con la tarea. Durante toda la
                  sesión se registrará su mirada mediante un eye tracker tipo
                  Gazepoint GP3. La duración total estimada es de
                  aproximadamente <strong>20 minutos</strong>, incluyendo
                  calibración, práctica y los {blockDescriptions.length} bloques experimentales.
                </p>
              </section>

              <Separator />

              {/* 6. Riesgos */}
              <section>
                <h2 className="text-base font-semibold text-neutral-900 mb-2">
                  6. Riesgos
                </h2>
                <p>
                  Los riesgos asociados con la participación en este estudio
                  son mínimos y se limitan a:
                </p>
                <div className="space-y-2 ml-1 mt-2">
                  <div className="flex gap-3">
                    <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-neutral-400" />
                    <p>
                      Fatiga visual leve derivada de la fijación prolongada en
                      la pantalla.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-neutral-400" />
                    <p>
                      Posible incomodidad por el uso del dispositivo de eye
                      tracking, el cual no tiene contacto físico con el
                      participante.
                    </p>
                  </div>
                </div>
                <p className="mt-2">
                  No se espera ningún efecto adverso significativo. Si en
                  cualquier momento experimenta molestias, puede suspender su
                  participación sin ninguna consecuencia.
                </p>
              </section>

              <Separator />

              {/* 7. Beneficios */}
              <section>
                <h2 className="text-base font-semibold text-neutral-900 mb-2">
                  7. Beneficios
                </h2>
                <p>
                  La participación directa puede no ofrecer beneficios
                  individuales inmediatos; sin embargo, los datos obtenidos
                  contribuirán al avance de la investigación en neurociencia
                  cognitiva y a la comprensión de los mecanismos de
                  interferencia atencional y control inhibitorio.
                </p>
              </section>

              <Separator />

              {/* 8. Confidencialidad */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-amber-600 shrink-0" />
                  <h2 className="text-base font-semibold text-neutral-900">
                    8. Confidencialidad y protección de datos
                  </h2>
                </div>
                <p className="mb-2">
                  Se garantiza la confidencialidad de todos los datos
                  recopilados. Se aplicarán las siguientes medidas de
                  protección:
                </p>
                <div className="space-y-2 ml-1">
                  <div className="flex gap-3">
                    <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-neutral-400" />
                    <p>
                      <strong>Pseudonimización:</strong> Sus datos serán
                      identificados mediante un código de estudio único, sin
                      vincularlos a su nombre o datos personales directos.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-neutral-400" />
                    <p>
                      <strong>Almacenamiento seguro:</strong> Los datos se
                      almacenarán en un servidor seguro con acceso restringido
                      únicamente al equipo de investigación.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-neutral-400" />
                    <p>
                      <strong>Cumplimiento normativo:</strong> El manejo de
                      datos personales se realizará en estricto cumplimiento de
                      la Ley General de Protección de Datos Personales en
                      Posesión de los Sujetos Obligados (LGPD) y demás
                      disposiciones aplicables en México.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-neutral-400" />
                    <p>
                      Los datos de eye tracking (puntos de mirada y diámetro
                      pupilar) se almacenarán de forma cifrada y serán
                      utilizados exclusivamente para los fines de esta
                      investigación.
                    </p>
                  </div>
                </div>
              </section>

              <Separator />

              {/* 9. Voluntariedad */}
              <section>
                <h2 className="text-base font-semibold text-neutral-900 mb-2">
                  9. Voluntariedad
                </h2>
                <p>
                  Su participación en este estudio es completamente voluntaria.
                  Usted puede retirarse en cualquier momento sin necesidad de
                  proporcionar justificación y sin que ello tenga consecuencia
                  alguna sobre su persona, calificaciones o relación con la
                  institución. La decisión de no participar o de abandonar el
                  estudio no afectará de ninguna forma sus derechos.
                </p>
              </section>

              <Separator />

              {/* 10. Contacto */}
              <section>
                <h2 className="text-base font-semibold text-neutral-900 mb-2">
                  10. Contacto
                </h2>
                <p className="mb-2">
                  Si tiene preguntas o inquietudes sobre este estudio, puede
                  contactar al investigador responsable:
                </p>
                <div className="space-y-1 ml-1">
                  <p>{researcherName}</p>
                  <p>Correo: {researcherEmail}</p>
                  <p>Teléfono: {researcherPhone}</p>
                  <p>{institutionName}</p>
                </div>
              </section>

              <Separator />

              {/* 11. Aprobación ética */}
              <section>
                <h2 className="text-base font-semibold text-neutral-900 mb-2">
                  11. Aprobación ética
                </h2>
                <p>
                  Este estudio ha sido revisado y aprobado por el Comité de
                  Ética en Investigación de la institución.
                </p>
                <p className="mt-1">
                  Número de aprobación: {ethicsApproval}
                </p>
              </section>

            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sticky bottom: checkboxes and accept button */}
      <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur-sm border-t shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="check-general"
                checked={checkGeneral}
                onCheckedChange={(v) => setCheckGeneral(v === true)}
                className="mt-0.5"
              />
              <Label
                htmlFor="check-general"
                className="text-sm leading-relaxed cursor-pointer"
              >
                He leído y comprendo la información anterior y acepto
                participar voluntariamente en este estudio.
              </Label>
            </div>

            <Separator />

            <div className="flex items-start gap-3">
              <Checkbox
                id="check-eyetracking"
                checked={checkEyeTracking}
                onCheckedChange={(v) => setCheckEyeTracking(v === true)}
                className="mt-0.5"
              />
              <Label
                htmlFor="check-eyetracking"
                className="text-sm leading-relaxed cursor-pointer"
              >
                Acepto el registro de datos de eye tracking (mirada y
                diámetro pupilar) como parte de esta investigación.
              </Label>
            </div>
          </div>

          <Button
            onClick={handleAccept}
            disabled={!bothChecked}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            size="lg"
          >
            <Shield className="h-4 w-4 mr-2" />
            Aceptar y continuar
          </Button>
        </div>
      </div>
    </div>
  )
}
