<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import Icon from './components/Icon.vue'
import DemoPanel from './components/DemoPanel.vue'
import { app, currentUser, loadShell } from './composables/useApp.js'
import { session, setUser } from './api/session.js'
import { UEN } from './api/live/config.js'
import { ROLE_LABEL, date } from './utils/format.js'

const main = [
  ['/', 'Dashboard', 'dashboard'], ['/forecast', 'Cash forecast', 'forecast'], ['/products', 'Products', 'products'],
  ['/recommendations', 'Recommendations', 'recommend'], ['/propose', 'Propose investment', 'propose'], ['/approvals', 'Approvals', 'approvals'], ['/holdings', 'Holdings', 'holdings'],
]
const more = [['/alerts', 'Alerts', 'alerts'], ['/audit', 'Audit history', 'audit']]
const route = useRoute()
const title = computed(() => [...main, ...more].find(([to]) => to === route.path)?.[1] || 'SurplusIQ')
onMounted(loadShell)
watch(() => app.version, loadShell)
</script>

<template>
  <div class="shell">
    <aside class="side">
      <div class="brand"><span class="logo">S</span> SurplusIQ</div>
      <nav class="nav stack gap-s" style="gap:2px">
        <router-link v-for="[to, label, icon] in main" :key="to" :to="to">
          <Icon :name="icon" /> {{ label }}
          <span v-if="to === '/approvals' && app.nav.approvals" class="count amber">{{ app.nav.approvals }}</span>
        </router-link>
        <hr />
        <router-link v-for="[to, label, icon] in more" :key="to" :to="to">
          <Icon :name="icon" /> {{ label }}
          <span v-if="to === '/alerts' && app.nav.alerts" class="count">{{ app.nav.alerts }}</span>
        </router-link>
      </nav>
      <div class="foot">Treasury decision support. Rates are illustrative; returns are never guaranteed. Investment execution is simulated unless a live integration is connected.</div>
    </aside>
    <div class="main">
      <header class="top">
        <span class="collapse" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg></span>
        <span class="topbar-title">{{ title }}</span>
        <span class="muted small">Kopi &amp; Co Pte Ltd · UEN {{ UEN }} · {{ date(app.asOf) }}</span>
        <div class="grow"></div>
        <div class="row">
          <div class="small right"><b>{{ currentUser.name }}</b><br /><span class="muted">{{ ROLE_LABEL[currentUser.role] }}</span></div>
          <select style="width:auto" :value="session.userId" @change="setUser($event.target.value)" aria-label="Switch user">
            <option v-for="u in app.users" :key="u.id" :value="u.id">{{ u.name }} - {{ u.role === 'DIRECTOR' ? 'Director' : 'Finance' }}</option>
          </select>
          <router-link class="btn dark" to="/propose">Create new...</router-link>
        </div>
      </header>
      <main class="page"><router-view /></main>
    </div>
    <DemoPanel />
    <div class="toasts"><div v-for="t in app.toasts" :key="t.id" class="toast" :class="t.tone">{{ t.message }}</div></div>
  </div>
</template>
