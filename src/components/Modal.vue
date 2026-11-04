<script setup>
defineProps({ title: String, wide: Boolean })
const emit = defineEmits(['close'])
</script>
<template>
  <div class="overlay" @mousedown.self="emit('close')" @keydown.esc="emit('close')">
    <div class="modal" :class="{ wide }" role="dialog" aria-modal="true">
      <h2>{{ title }}</h2>
      <slot />
      <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
    </div>
  </div>
</template>
