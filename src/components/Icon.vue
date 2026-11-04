<script setup>
defineProps({ name: String, size: { type: Number, default: 18 } })
const paths = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  forecast: 'M3 3v18h18M7 14l4-4 3 3 5-6',
  products: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8',
  recommend: 'M12 2l2.4 6.6L21 9l-5 4.6L17.5 21 12 17.3 6.5 21 8 13.6 3 9l6.6-.4z',
  propose: 'M12 5v14M5 12h14',
  approvals: 'M20 6L9 17l-5-5',
  holdings: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  alerts: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
  audit: 'M9 5h10M9 12h10M9 19h10M4 5h.01M4 12h.01M4 19h.01',
}
</script>
<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path :d="paths[name]" /></svg>
</template>
