import { reactive, ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { session } from '../api/session.js'
import { api } from '../api/index.js'

export const app = reactive({ version: 0, toasts: [], users: [], asOf: '', nav: { approvals: 0, alerts: 0 } })

export const currentUser = computed(() => app.users.find((u) => u.id === session.userId) || { id: session.userId, name: '...', role: 'FINANCE_STAFF', title: '' })
export const isDirector = computed(() => currentUser.value.role === 'DIRECTOR')

/** call after any mutation so every mounted screen re-fetches */
export const refreshAll = () => { app.version++ }

let tid = 0
export function toast(message, tone = 'green') {
  const id = ++tid
  app.toasts.push({ id, message, tone })
  setTimeout(() => { app.toasts = app.toasts.filter((t) => t.id !== id) }, 5000)
}
export const errMsg = (e) => (e && e.message) || String(e)

export async function loadShell() {
  const [users, props, alerts, cp] = await Promise.all([api.getUsers(), api.getProposals({ status: 'PENDING_APPROVAL' }), api.getAlerts({ status: 'ACTIVE' }), api.getCashPosition()])
  app.users = users; app.asOf = cp.asOf
  app.nav.approvals = props.length
  app.nav.alerts = alerts.activeCount
}

/** Fetch on mount, on mutation (app.version) and on user switch. */
export function useLoad(fn) {
  const data = ref(null); const loading = ref(true); const error = ref(null)
  let seq = 0
  async function load() {
    const my = ++seq
    try { const r = await fn(); if (my === seq) { data.value = r; error.value = null } } catch (e) { if (my === seq) error.value = errMsg(e) } finally { if (my === seq) loading.value = false }
  }
  onMounted(load)
  const stop = watch(() => [app.version, session.userId], load)
  onBeforeUnmount(stop)
  return { data, loading, error, reload: load }
}

/** run a mutation: toast on success/failure, refresh all screens. returns result or null */
export async function act(fn, okMsg) {
  try {
    const r = await fn()
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg)
    refreshAll()
    return r
  } catch (e) {
    toast(errMsg(e), 'red')
    return null
  }
}
