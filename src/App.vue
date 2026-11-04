<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
const router = useRouter()
const title = computed(() => [...main, ...more].find(([to]) => to === route.path)?.[1] || 'SurplusIQ')

// Sidebar collapse, remembered per browser.
let saved = false
try { saved = localStorage.getItem('siq.nav') === 'collapsed' } catch { /* private mode */ }
const collapsed = ref(saved)
const toggleNav = () => {
  collapsed.value = !collapsed.value
  try { localStorage.setItem('siq.nav', collapsed.value ? 'collapsed' : 'open') } catch { /* ignore */ }
}

// "Create new..." menu.
const menuOpen = ref(false)
const menuRef = ref(null)
const creates = [
  ['New investment', 'Propose putting surplus cash to work', { path: '/propose' }],
  ['New redemption', 'Propose taking money out of a holding', { path: '/propose', query: { type: 'REDEEM' } }],
  ['Add commitment', 'Record a known payment or receipt', { path: '/forecast', query: { focus: 'commitment' } }],
  ['Generate recommendation', 'Run a fresh allocation recommendation', { path: '/recommendations', query: { action: 'generate' } }],
  ['Check liquidity', 'Check cash against the buffer now', { path: '/alerts', query: { action: 'check' } }],
]
const go = (to) => { menuOpen.value = false; router.push(to) }

// Profile switcher at the bottom of the sidebar.
const profileOpen = ref(false)
const profileRef = ref(null)
const initials = (n) => String(n || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
const pick = (id) => { setUser(id); profileOpen.value = false }

const outside = (e) => {
  if (menuOpen.value && menuRef.value && !menuRef.value.contains(e.target)) menuOpen.value = false
  if (profileOpen.value && profileRef.value && !profileRef.value.contains(e.target)) profileOpen.value = false
}
const esc = (e) => { if (e.key === 'Escape') { menuOpen.value = false; profileOpen.value = false } }
onMounted(() => { loadShell(); document.addEventListener('click', outside); document.addEventListener('keydown', esc) })
onBeforeUnmount(() => { document.removeEventListener('click', outside); document.removeEventListener('keydown', esc) })
watch(() => app.version, loadShell)
watch(() => route.fullPath, () => { menuOpen.value = false; profileOpen.value = false })
</script>

<template>
  <div class="shell" :class="{ collapsed }">
    <aside class="side">
      <div class="brand"><span class="logo">S</span> <span class="lbl">SurplusIQ</span></div>
      <nav class="nav stack gap-s" style="gap:2px">
        <router-link v-for="[to, label, icon] in main" :key="to" :to="to" :title="label">
          <Icon :name="icon" /> <span class="lbl">{{ label }}</span>
          <span v-if="to === '/approvals' && app.nav.approvals" class="count amber">{{ app.nav.approvals }}</span>
        </router-link>
        <hr />
        <router-link v-for="[to, label, icon] in more" :key="to" :to="to" :title="label">
          <Icon :name="icon" /> <span class="lbl">{{ label }}</span>
          <span v-if="to === '/alerts' && app.nav.alerts" class="count">{{ app.nav.alerts }}</span>
        </router-link>
      </nav>

      <div ref="profileRef" class="profile">
        <div v-if="profileOpen" class="profile-menu" role="menu">
          <div class="menu-head">Switch user</div>
          <button v-for="u in app.users" :key="u.id" type="button" role="menuitem" class="menu-item" :class="{ on: u.id === session.userId }" @click="pick(u.id)">
            <b>{{ u.name }}</b><span>{{ ROLE_LABEL[u.role] }}</span>
          </button>
        </div>
        <button class="profile-btn" type="button" aria-haspopup="menu" :aria-expanded="profileOpen" :title="currentUser.name" @click.stop="profileOpen = !profileOpen">
          <span class="avatar">{{ initials(currentUser.name) }}</span>
          <span class="who lbl"><b>{{ currentUser.name }}</b><small>{{ ROLE_LABEL[currentUser.role] }}</small></span>
          <svg class="lbl" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 15l5-5 5 5" /></svg>
        </button>
      </div>
    </aside>
    <div class="main">
      <header class="top">
        <button class="collapse" type="button" :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'" :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'" @click="toggleNav">
          <svg :style="{ transform: collapsed ? 'rotate(180deg)' : 'none' }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span class="topbar-title">{{ title }}</span>
        <span class="muted small">Kopi &amp; Co Pte Ltd · UEN {{ UEN }} · {{ date(app.asOf) }}</span>
        <div class="grow"></div>
        <div ref="menuRef" class="menu-wrap">
          <button class="btn dark" type="button" aria-haspopup="menu" :aria-expanded="menuOpen" @click.stop="menuOpen = !menuOpen">Create new... <span aria-hidden="true">▾</span></button>
          <div v-if="menuOpen" class="menu" role="menu">
            <button v-for="[label, hint, to] in creates" :key="label" type="button" role="menuitem" class="menu-item" @click="go(to)"><b>{{ label }}</b><span>{{ hint }}</span></button>
          </div>
        </div>
      </header>
      <main class="page"><router-view /></main>
    </div>
    <DemoPanel />
    <div class="toasts"><div v-for="t in app.toasts" :key="t.id" class="toast" :class="t.tone">{{ t.message }}</div></div>
  </div>
</template>
