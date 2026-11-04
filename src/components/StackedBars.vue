<script setup>
// groups: [{label, parts:[{key,label,value,color}]}]
import { computed } from 'vue'
import { compact } from '../utils/format.js'
const props = defineProps({ groups: { type: Array, default: () => [] }, height: { type: Number, default: 200 } })
const W = 520; const padL = 48; const padB = 24; const padT = 10
const max = computed(() => Math.max(1, ...props.groups.map((g) => g.parts.reduce((a, p) => a + p.value, 0))) * 1.1)
const bw = computed(() => Math.min(70, ((W - padL) / Math.max(1, props.groups.length)) * 0.55))
const gx = (i) => padL + ((i + 0.5) * (W - padL)) / props.groups.length
const h = (v) => (v / max.value) * (props.height - padB - padT)
const legend = computed(() => { const m = new Map(); props.groups.forEach((g) => g.parts.forEach((p) => m.set(p.key, p))); return [...m.values()] })
const stack = (g) => { let acc = 0; return g.parts.map((p) => { const y = props.height - padB - h(acc + p.value); acc += p.value; return { ...p, y, hh: h(p.value) } }) }
</script>
<template>
  <div>
    <svg :viewBox="`0 0 ${W} ${height}`" width="100%" style="display:block">
      <g v-for="t in [0, .25, .5, .75, 1]" :key="t"><line :x1="padL" :x2="W" :y1="height - padB - h(t * max)" :y2="height - padB - h(t * max)" stroke="#eceef5" /><text :x="padL - 6" :y="height - padB - h(t * max) + 4" text-anchor="end" font-size="12" fill="#4b5068">{{ compact(t * max) }}</text></g>
      <g v-for="(g, i) in groups" :key="g.label">
        <rect v-for="p in stack(g)" :key="p.key" :x="gx(i) - bw / 2" :y="p.y" :width="bw" :height="Math.max(0, p.hh)" :fill="p.color"><title>{{ g.label }} - {{ p.label }}: {{ compact(p.value) }}</title></rect>
        <text :x="gx(i)" :y="height - 7" text-anchor="middle" font-size="12" fill="#4b5068">{{ g.label }}</text>
      </g>
    </svg>
    <div class="legend"><span v-for="l in legend" :key="l.key"><i :style="{ background: l.color }"></i>{{ l.label }}</span></div>
  </div>
</template>
