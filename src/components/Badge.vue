<script setup>
import { STATUS_TONE, titleCase } from '../utils/format.js'
const props = defineProps({ value: String, tone: String, label: String })
</script>
<template>
  <span class="badge" :class="tone || STATUS_TONE[value] || 'grey'"><slot>{{ label || titleCase(value) }}</slot></span>
</template>
