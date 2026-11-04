<script setup>
defineProps({ loading: Boolean, error: String, ready: Boolean })
</script>
<template>
  <div v-if="error" class="banner red"><div><b>Could not load data</b>{{ error }}</div></div>
  <div v-else-if="loading && !ready" class="spinner">Loading...</div>
  <slot v-else />
</template>
