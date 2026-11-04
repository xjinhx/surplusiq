<script setup>
defineProps({ checks: { type: Array, default: () => [] } })
const sym = { PASS: '✓', FAIL: '✕', WARN: '!' }
</script>
<template>
  <ul class="checks">
    <li v-for="c in checks" :key="c.id">
      <span class="dot" :class="c.status">{{ sym[c.status] }}</span>
      <span><b>{{ c.label }}</b><br /><span class="muted small">{{ c.detail }}</span></span>
    </li>
  </ul>
</template>
