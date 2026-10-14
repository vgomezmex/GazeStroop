# gazepoint-bridge

Relay entre el **Gazepoint GP3** (a través de la API TCP de Gazepoint Control,
`127.0.0.1:4242`) y la app web del experimento, vía un WebSocket local
(`127.0.0.1:4243`). Es necesario porque un navegador no puede abrir un socket
TCP crudo contra el hardware — este proceso corre en la misma computadora
que el participante y hace de puente.

```
GP3 (USB) → Gazepoint Control → TCP 4242 → [gazepoint-bridge] → WS 4243 → navegador
```

## Uso

En la computadora del participante, **antes** de iniciar el experimento:

1. Abre Gazepoint Control y confirma que el GP3 está conectado y calibrando
   normalmente ahí (esto valida que el hardware funciona antes de meter la
   capa web).
2. En esta carpeta:
   ```bash
   npm install
   npm start
   ```
3. Deja esa terminal abierta durante toda la sesión del participante.
4. En `AdminConfig` → sección "Eye Tracker", confirma que `eyeTrackerBridgeUrl`
   apunta a `ws://127.0.0.1:4243` (valor por defecto).

## Modo de prueba sin hardware

```bash
npm run mock
```

Transmite una señal sintética a 60 Hz y simula resultados de calibración,
para poder desarrollar/probar todo el pipeline (bridge → API → base de
datos → reporte) sin tener el GP3 a la mano. **Toda muestra generada en
este modo va marcada `simulated: true`** en el mensaje WebSocket, y ese flag
se puede rastrear hasta los logs del bridge — no se inserta silenciosamente
como si fuera dato real (el endpoint actual no persiste ese flag en la BD;
si vas a usar `--mock` contra una base de datos de producción, no lo hagas —
úsalo solo contra una base de desarrollo).

## ⚠️ Verifica los nombres de campo contra tu versión de Gazepoint

El protocolo OpenGaze de Gazepoint ha cambiado nombres de atributos entre
versiones de firmware/API. Este bridge fue escrito contra la documentación
de la API OpenGaze v2.0, verificada palabra por palabra contra el manual
oficial completo (`Gazepoint_API_v2.0.pdf`, secciones 3 y 5).

**Corrección importante (confirmada leyendo el manual completo):**
`LPMM`/`RPMM`/`LPMMV`/`RPMMV` **no existen como nombres de atributo en el
protocolo TCP en vivo** — nunca existieron, en ninguna versión. Es un error
que tuvo esta bridge durante un tiempo, originado en una exportación CSV del
propio software Gazepoint Analysis (que sí renombra/convierte campos
internamente al exportar), confundido con un nombre de atributo del stream
en vivo. El campo real, documentado en la sección 5.10/5.11 del manual, es:

- `LPUPILD` / `RPUPILD` — diámetro de pupila en **metros** (no milímetros)
- `LPUPILV` / `RPUPILV` — flag de validez
- Se activan con `ENABLE_SEND_EYE_LEFT` / `ENABLE_SEND_EYE_RIGHT` — **no**
  con `ENABLE_SEND_PUPIL_LEFT/RIGHT` (ese comando solo activa `LPD`/`RPD`,
  el diámetro en *píxeles*, documentado en la sección 5.8/5.9 — por eso esos
  dos campos sí funcionaban aunque LPMM/RPMM nunca llegaran).

Este bridge ya lee `LPUPILD`/`RPUPILD` y los convierte a milímetros
(×1000) para seguir llamando a la columna "LPMM"/"RPMM" en el CSV, y ya
manda los comandos `ENABLE_SEND_EYE_LEFT`/`ENABLE_SEND_EYE_RIGHT`
necesarios. Si aun así no llegan datos, revisa la consola del bridge: hay
un diagnóstico automático que avisa tras ~2 segundos de datos reales si
`LPUPILD` nunca aparece — en ese caso lo más probable es un problema de
detección del ojo (revisa la ventana de Gazepoint Control), no de nombres
de comando.

Otros comandos ya verificados como correctos: `ENABLE_SEND_POG_FIX` (no
`ENABLE_SEND_FIXATION`, que no existe), `ENABLE_SEND_BLINK`/`BKID`/`BKDUR`
(reales, aunque posiblemente añadidos en una versión de Gazepoint Control
posterior a 2013 — si tu versión es muy vieja y no los soporta, revisa si
Gazepoint Control responde `<NACK ID="ENABLE_SEND_BLINK" .../>`).

Si al correr `npm start` con hardware real ves en consola que llegan líneas
`<REC .../>` pero algún campo específico sale siempre `null`, es casi
seguro que tu SDK usa un nombre de atributo distinto para ese campo en
particular.

La solución sigue siendo un solo lugar: edita el objeto `FIELD_MAP` al
inicio de `bridge.mjs` con los nombres exactos que tu Gazepoint Control esté
mandando (puedes verlos imprimiendo `line` crudo en `handleLine()`
temporalmente). Todo lo demás — el WebSocket, el endpoint
`/api/eyetracking/batch`, el schema de base de datos — es agnóstico a esos
nombres exactos.

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `GAZEPOINT_HOST` | `127.0.0.1` | Host de Gazepoint Control |
| `GAZEPOINT_PORT` | `4242` | Puerto TCP de la API OpenGaze |
| `BRIDGE_PORT` | `4243` | Puerto del WebSocket que expone este bridge |

## Limitaciones conocidas

- La frecuencia de muestreo real la determina el hardware (60 Hz en el GP3
  estándar, 150 Hz en el GP3 HD) — este bridge no la "configura", solo la
  reporta tal cual llega. El campo `eyeTrackerSamplingHz` en la configuración
  del experimento es informativo/de registro, no un comando al dispositivo.
- La reconexión automática tiene backoff exponencial (hasta 30s) si se
  pierde la conexión con Gazepoint Control a medio experimento.
- No hay autenticación en el WebSocket local — se asume que solo el propio
  navegador del participante, en la misma máquina, se conecta a
  `127.0.0.1:4243`. No expongas este puerto a la red.
