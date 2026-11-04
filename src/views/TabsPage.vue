<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
const route = useRoute()
const tabs = computed(() => route.matched.find((r) => r.meta.tabs)?.meta.tabs || [])
</script>

<template>
  <div class="tabs-page">
    <div class="seg tab-row"><router-link v-for="t in tabs" :key="t.to" :to="t.to" custom v-slot="{ href, navigate, isActive }"><a :href="href" :class="{ on: isActive }" @click="navigate">{{ t.label }}</a></router-link></div>
    <router-view :key="route.path" />
  </div>
</template>
