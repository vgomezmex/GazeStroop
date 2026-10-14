'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/useAppStore'

export default function BlockTransitionScreen() {
  const currentBlockIndex = useAppStore((s) => s.currentBlockIndex)
  const activeBlocks = useAppStore((s) => s.activeBlocks)
  const blockInstructionDurationMs = useAppStore((s) => s.config.blockInstructionDurationMs)
  const setAppState = useAppStore((s) => s.setAppState)

  const nextBlock = activeBlocks[currentBlockIndex]
  const countdownRef = useRef<HTMLSpanElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const startTime = performance.now()
    const el = countdownRef.current
    const durationMs = blockInstructionDurationMs

    const tick = () => {
      const elapsed = performance.now() - startTime
      const remainingMs = Math.max(0, durationMs - elapsed)
      const remainingSec = Math.ceil(remainingMs / 1000)

      if (el) {
        el.textContent = String(remainingSec)
      }

      if (remainingMs <= 0) {
        setAppState('TRIAL')
        return
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [blockInstructionDurationMs, setAppState])

  if (!nextBlock) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-neutral-400">Cargando...</p>
      </div>
    )
  }

  const congruencyColor =
    nextBlock.congruency === 'congruent'
      ? 'text-emerald-400'
      : nextBlock.congruency === 'neutral'
        ? 'text-sky-400'
        : 'text-rose-400'

  const congruencyLabel =
    nextBlock.congruency === 'congruent'
      ? 'Congruente'
      : nextBlock.congruency === 'neutral'
        ? 'Neutral'
        : 'Incongruente'

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 select-none">
      {/* Block number */}
      <p className="text-neutral-500 text-sm mb-2">
        Bloque {nextBlock.blockOrder}
      </p>

      {/* Block name - LARGE font */}
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6">
        {nextBlock.label}
      </h1>

      {/* Congruency badge */}
      <p className={`text-lg font-semibold mb-8 ${congruencyColor}`}>
        {congruencyLabel}
      </p>

      {/* Instruction - LARGE font */}
      <div className="max-w-2xl text-center mb-12">
        <p className="text-xl sm:text-2xl md:text-3xl font-medium text-white leading-relaxed">
          {nextBlock.instruction}
        </p>
      </div>

      {/* Countdown timer - LARGE */}
      <div className="text-center">
        <span
          ref={countdownRef}
          className="text-7xl sm:text-8xl md:text-9xl font-bold tabular-nums text-amber-400"
        >
          {Math.ceil(blockInstructionDurationMs / 1000)}
        </span>
      </div>
    </div>
  )
}
