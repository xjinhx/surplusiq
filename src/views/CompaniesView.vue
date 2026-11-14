<script setup>
import { api } from '../api/index.js'
import { useLoad } from '../composables/useApp.js'
import { setUen, UEN } from '../api/live/config.js'
import { currentUser } from '../composables/useApp.js'
import PageState from '../components/PageState.vue'
import Badge from '../components/Badge.vue'
import { money, ROLE_LABEL } from '../utils/format.js'

const { data: list, loading, error } = useLoad(() => api.getCompanies())
function open(c) {
  setUen(c.uen)
  try { sessionStorage.setItem('siq.picked', '1') } catch { /* ignore */ }
  location.hash = '#/'; location.reload() // fresh data for the chosen company
}
</script>

<template>
  <div class="companies">
    <div class="brand" style="margin-bottom:28px"><span class="logo">S</span> <span class="lbl">SurplusIQ</span></div>
    <h1>Your companies</h1>
    <p class="who">Signed in as <b>{{ currentUser.name }}</b></p>
    <PageState :loading="loading" :error="error" :ready="!!list">
      <div class="co-grid">
        <button v-for="c in list" :key="c.uen" type="button" class="card co" :class="{ cur: c.uen === UEN }" @click="open(c)">
          <div class="co-head"><div><b class="co-name">{{ c.name }}</b><div class="small muted">UEN {{ c.uen }}</div></div><Badge v-if="c.ok" tone="blue" :label="ROLE_LABEL[c.role]" /></div>
          <template v-if="c.ok">
            <div class="co-cash"><span class="small muted">Total cash</span><b>{{ money(c.totalCash) }}</b></div>
            <div class="co-row"><span>Available to invest</span><b style="color:var(--accent)">{{ money(c.available) }}</b></div>
            <div class="co-row"><span>Operating buffer</span><b>{{ money(c.buffer) }}</b></div>
            <div class="co-row"><span>Waiting for approval</span><b>{{ money(c.awaiting) }}</b></div>
            <div class="co-foot"><Badge :tone="c.totalCash >= c.buffer ? 'green' : 'red'" :label="c.totalCash >= c.buffer ? 'Above buffer' : 'Below buffer'" /><span class="open">Open ›</span></div>
          </template>
          <div v-else class="small" style="color:var(--alert)">Could not load: {{ c.error }}</div>
        </button>
      </div>
    </PageState>
  </div>
</template>
