<script setup>
import { reactive, ref, watch } from 'vue'
import { api } from '../api/index.js'
import { useLoad } from '../composables/useApp.js'
import PageState from '../components/PageState.vue'
import Badge from '../components/Badge.vue'
import { dateTime, titleCase, ROLE_LABEL } from '../utils/format.js'

const flt = reactive({ q: '', event: '', actorId: '', from: '', to: '' })
const { data: d, loading, error, reload } = useLoad(() => api.getAuditLog({ ...flt }))
let t; watch(flt, () => { clearTimeout(t); t = setTimeout(reload, 250) })
const open = ref(null)
const tone = (e) => (/FAILED|REJECTED|RAISED/.test(e) ? 'red' : /APPROVED|SUCCEEDED|RESOLVED|CREATED/.test(e) ? 'green' : /SUBMITTED|RECOMMENDATION/.test(e) ? 'blue' : /SIMULATED/.test(e) ? 'sim' : 'grey')
function exportCsv() {
  const rows = [['Timestamp', 'Event', 'Actor', 'Role', 'Entity', 'Entity ID', 'Summary']].concat(d.value.events.map((e) => [e.ts, e.event, e.actor.name, e.actor.role, e.entityType, e.entityId, e.summary]))
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'surplusiq-audit.csv'; a.click()
}
</script>

<template>
  <div class="page-head"><div><h1>Audit history</h1><p>Every recommendation, proposal change, approval, execution attempt and outcome - with who, when and why.</p></div><button class="btn" :disabled="!d" @click="exportCsv">Export CSV</button></div>
  <div class="card row wrap" style="margin-bottom:16px">
    <input v-model="flt.q" style="max-width:260px" placeholder="Search summary, ID, person..." />
    <select v-model="flt.event" style="width:auto"><option value="">All events</option><option v-for="e in d?.eventTypes || []" :key="e" :value="e">{{ titleCase(e) }}</option></select>
    <select v-model="flt.actorId" style="width:auto"><option value="">Everyone</option><option v-for="a in d?.actors || []" :key="a.id" :value="a.id">{{ a.name }}</option></select>
    <input v-model="flt.from" type="date" style="width:auto" aria-label="From" /><span class="muted">to</span><input v-model="flt.to" type="date" style="width:auto" aria-label="To" />
    <button class="btn sm" @click="Object.assign(flt, { q: '', event: '', actorId: '', from: '', to: '' })">Clear</button>
  </div>
  <PageState :loading="loading" :error="error" :ready="!!d">
    <div v-if="d" class="card flush"><div v-if="!d.events.length" class="empty">No events match.</div>
      <div v-else class="table-wrap"><table><thead><tr><th>When</th><th>Event</th><th>Who</th><th>What happened</th><th></th></tr></thead>
        <tbody><template v-for="e in d.events" :key="e.id"><tr><td class="small" style="white-space:nowrap">{{ dateTime(e.ts) }}</td><td><Badge :tone="tone(e.event)" :label="titleCase(e.event)" /></td>
          <td class="small">{{ e.actor.name }}<br /><span class="muted">{{ ROLE_LABEL[e.actor.role] }}</span></td><td>{{ e.summary }}<br /><span class="muted small">{{ e.entityType }} {{ e.entityId }}</span></td>
          <td class="right"><button class="btn sm" @click="open = open === e.id ? null : e.id">{{ open === e.id ? 'Hide' : 'Details' }}</button></td></tr>
          <tr v-if="open === e.id"><td colspan="5" style="background:#fafcfc"><pre class="json">{{ JSON.stringify(e.details, null, 2) }}</pre></td></tr></template></tbody></table></div>
      <div class="small muted" style="padding:10px 16px">{{ d.total }} event{{ d.total === 1 ? '' : 's' }}. In production the log is append-only (OutSystems AuditLog entity).</div></div>
  </PageState>
</template>
