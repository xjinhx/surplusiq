<script setup>
// Cash projection line with dashed buffer line and hover read-out. points: [{date, balance}]
import { ref, computed } from 'vue'
import { compact, date as fmtDate } from '../utils/format.js'
const props = defineProps({ points: { type: Array, default: () => [] }, buffer: Number, height: { type: Number, default: 220 } })
const W = 720; const padL = 54; const padR = 12; const padT = 12; const padB = 30
const hover = ref(null)
const bounds = computed(() => {
  const vals = props.points.map((p) => p.balance).concat(props.buffer != null ? [props.buffer] : [])
  let lo = Math.min(...vals); let hi = Math.max(...vals); const span = hi - lo || 1
  lo -= span * 0.12; hi += span * 0.12
  return { lo, hi }
})
const x = (i) => padL + (i / Math.max(1, props.points.length - 1)) * (W - padL - padR)
const y = (v) => padT + (1 - (v - bounds.value.lo) / (bounds.value.hi - bounds.value.lo)) * (props.height - padT - padB)
const path = computed(() => props.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' '))
const area = computed(() => (props.points.length ? `${path.value} L${x(props.points.length - 1)},${props.height - padB} L${padL},${props.height - padB} Z` : ''))
const ticks = computed(() => [0, 0.25, 0.5, 0.75, 1].map((t) => bounds.value.lo + t * (bounds.value.hi - bounds.value.lo)))
const xTicks = computed(() => { const n = props.points.length; return [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1].filter((i) => i >= 0 && props.points[i]) })
function onMove(e) {
  const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W
  hover.value = Math.max(0, Math.min(props.points.length - 1, Math.round(((px - padL) / (W - padL - padR)) * (props.points.length - 1))))
}
</script>
<template>
  <svg :viewBox="`0 0 ${W} ${height}`" width="100%" @mousemove="onMove" @mouseleave="hover = null" style="display:block">
    <g v-for="t in ticks" :key="t"><line :x1="padL" :x2="W - padR" :y1="y(t)" :y2="y(t)" stroke="#eceef5" /><text :x="padL - 8" :y="y(t) + 4" text-anchor="end" font-size="11" fill="#8a8da6">{{ compact(t) }}</text></g>
    <defs><linearGradient id="lcFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4c6ef5" stop-opacity=".28" /><stop offset="100%" stop-color="#4c6ef5" stop-opacity="0" /></linearGradient></defs>
    <path :d="area" fill="url(#lcFill)" />
    <line v-if="buffer != null" :x1="padL" :x2="W - padR" :y1="y(buffer)" :y2="y(buffer)" stroke="#8a8da6" stroke-dasharray="4 4" />
    <text v-if="buffer != null" :x="W - padR" :y="y(buffer) - 5" text-anchor="end" font-size="11" fill="#8a8da6">Operating buffer {{ compact(buffer) }}</text>
    <path :d="path" fill="none" stroke="#4c6ef5" stroke-width="2" stroke-linejoin="round" />
    <text v-for="i in xTicks" :key="i" :x="x(i)" :y="height - 4" :text-anchor="i === points.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'" font-size="11" fill="#8a8da6">{{ fmtDate(points[i].date).slice(0, -5) }}</text>
    <g v-if="hover != null && points[hover]">
      <line :x1="x(hover)" :x2="x(hover)" :y1="padT" :y2="height - padB" stroke="#b6beba" />
      <circle :cx="x(hover)" :cy="y(points[hover].balance)" r="4" fill="#4c6ef5" />
      <g :transform="`translate(${Math.min(x(hover) + 8, W - 150)},${padT + 4})`"><rect width="140" height="38" rx="2" fill="#1f2030" /><text x="8" y="16" font-size="11" fill="#b6beba">{{ fmtDate(points[hover].date) }}</text><text x="8" y="31" font-size="13" font-weight="700" fill="#fff">{{ compact(points[hover].balance) }}</text></g>
    </g>
  </svg>
</template>
