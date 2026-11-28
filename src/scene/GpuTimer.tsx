/**
 * ?bench / ?debug only: measures GPU time per frame with EXT_disjoint_timer_query_webgl2, around
 * the whole frame (shadow maps + scene + post). Frame intervals alone are unreliable for comparing
 * variants (vsync, compositor queueing); GPU time is what the quality budget is about.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { NO_POST } from './Effects'

export const gpuStats = { samples: [] as number[], supported: false }

const params = new URLSearchParams(window.location.search)
export const GPU_TIMING = params.has('bench') || params.has('debug')

export function GpuTimer() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const ctx = gl.getContext() as WebGL2RenderingContext
  const ext = useMemo(() => ctx.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null, [ctx])
  const pending = useMemo<WebGLQuery[]>(() => [], [])
  const current = useMemo(() => ({ q: null as WebGLQuery | null }), [])
  useEffect(() => {
    gpuStats.supported = !!ext
  }, [ext])

  // just before the composer renders (priority 1) …
  useFrame(() => {
    if (!ext || current.q) return
    const q = ctx.createQuery()
    if (!q) return
    ctx.beginQuery(ext.TIME_ELAPSED_EXT, q)
    current.q = q
  }, 0.9)
  // ?off=post: no composer runs, and these priority callbacks stop R3F's own render, so draw here
  useFrame(() => {
    if (NO_POST) gl.render(scene, camera)
  }, 1)
  // … and just after; then collect any finished results
  useFrame(() => {
    if (!ext) return
    if (current.q) {
      ctx.endQuery(ext.TIME_ELAPSED_EXT)
      pending.push(current.q)
      current.q = null
    }
    const disjoint = ctx.getParameter(ext.GPU_DISJOINT_EXT)
    while (pending.length && ctx.getQueryParameter(pending[0], ctx.QUERY_RESULT_AVAILABLE)) {
      const q = pending.shift()!
      if (!disjoint) gpuStats.samples.push(ctx.getQueryParameter(q, ctx.QUERY_RESULT) / 1e6)
      ctx.deleteQuery(q)
    }
    if (gpuStats.samples.length > 4000) gpuStats.samples.splice(0, 2000)
  }, 1.1)
  return null
}
