<script setup>
import { computed } from 'vue'
import { money } from '../utils/format.js'
const props = defineProps({ slices: { type: Array, default: () => [] }, centerLabel: String, centerValue: String })
const PALETTE = { buffer: '#1f2030', idle: '#4c6ef5', MONEY_MARKET_FUND: '#748ffc', FIXED_DEPOSIT: '#91a7ff', T_BILL: '#bac8ff', BOND_FUND: '#dbe4ff' }
const total = computed(() => props.slices.reduce((a, s) => a + s.value, 0) || 1)
const R = 52; const C = 2 * Math.PI * R
const arcs = computed(() => { let off = 0; return props.slices.map((s) => { const len = (s.value / total.value) * C; const a = { ...s, len, off, color: PALETTE[s.key] || '#8aa'}; off += len; return a }) })
</script>
<template>
  <div class="row" style="gap:18px;align-items:center">
    <svg viewBox="0 0 140 140" width="150" height="150" style="flex:none">
      <g transform="rotate(-90 70 70)"><circle v-for="a in arcs" :key="a.key" cx="70" cy="70" :r="R" fill="none" :stroke="a.color" stroke-width="14" :stroke-dasharray="`${Math.max(0, a.len - 1)} ${C}`" :stroke-dashoffset="-a.off"><title>{{ a.label }}: {{ money(a.value) }}</title></circle></g>
      <text x="70" y="66" text-anchor="middle" font-size="10" fill="#67716c">{{ centerLabel }}</text>
      <text x="70" y="84" text-anchor="middle" font-size="16" font-weight="600" fill="#1c2623" font-family="Georgia, serif">{{ centerValue }}</text>
    </svg>
    <ul class="checks grow" style="gap:8px">
      <li v-for="a in arcs" :key="a.key" style="justify-content:space-between;align-items:center">
        <span><i :style="{ background: a.color, display: 'inline-block', width: '8px', height: '8px', marginRight: '8px' }"></i>{{ a.label }}</span>
        <span class="mono"><b>{{ money(a.value) }}</b> <span class="muted small">{{ ((a.value / total) * 100).toFixed(0) }}%</span></span>
      </li>
    </ul>
  </div>
</template>
