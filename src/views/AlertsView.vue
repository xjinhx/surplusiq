<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/index.js'
import { useLoad, toast, errMsg } from '../composables/useApp.js'
import PageState from '../components/PageState.vue'
import Badge from '../components/Badge.vue'
import { money, dateTime, titleCase } from '../utils/format.js'

const { data: d, loading, error } = useLoad(async () => ({ active: await api.getAlerts({ status: 'ACTIVE' }), resolved: await api.getAlerts({ status: 'RESOLVED' }) }))
const checking = ref(false)
async function check() {
  checking.value = true
  try { const active = await api.getAlerts({ status: 'ACTIVE', check: true }); d.value = { ...d.value, active }; toast(active.rebalancing.message || 'Liquidity checked') } catch (e) { toast(errMsg(e), 'red') } finally { checking.value = false }
}
const route = useRoute()
const router = useRouter()
onMounted(() => { if (route.query.action === 'check') { router.replace({ path: '/activity/alerts' }); check() } })
const tone = { CRITICAL: 'red', WARNING: 'amber', INFO: 'blue' }
const actTone = { REDEEM: 'red', REDUCE: 'amber', INVEST: 'green', MAINTAIN: 'grey', ROLLOVER_REVIEW: 'blue', ESCALATE: 'red' }
const showResolved = ref(false)

// Daily monitor: the same buffer check for every company. Writes audit rows and snapshots, so button only.
const daily = ref(null); const running = ref(false)
async function runDaily() {
  running.value = true
  try { daily.value = await api.runDailyCheck(); toast(`Daily check: ${daily.value.checked} checked, ${daily.value.failed} failed`) } catch (e) { toast(errMsg(e), 'red') } finally { running.value = false }
}
const levelTone = { OK: 'green', Warning: 'amber', Critical: 'red', Failed: 'grey' }
</script>

<template>
  <div class="page-head"><div><h1>Buffer &amp; liquidity alerts</h1></div><button class="btn primary" :disabled="checking" @click="check">{{ checking ? 'Checking...' : 'Check liquidity' }}</button></div>
  <PageState :loading="loading" :error="error" :ready="!!d">
    <div v-if="d" class="stack">
      <div v-if="!d.active.alerts.length" class="banner green"><div><b>All clear</b>Cash covers the operating buffer and commitments.</div></div>
      <div v-for="a in d.active.alerts" :key="a.id" class="banner" :class="tone[a.severity]">
        <div class="grow"><div class="row"><b style="margin:0">{{ a.title }}</b><Badge :value="a.severity" /></div><div>{{ a.message }}</div><div class="small muted" style="margin-top:4px">Raised {{ dateTime(a.raisedAt) }} · {{ a.id }}</div></div>
        <div v-if="a.shortfall" class="right"><div class="small muted">Shortfall</div><div style="font-size:22px;font-weight:700">{{ money(a.shortfall) }}</div></div>
      </div>

      <div class="card flush"><div class="row spread wrap" style="padding:20px 24px"><div><h2 style="margin:0">Daily monitor</h2><p class="small muted" style="margin:4px 0 0">Runs every day at 08:00 for every company (same check as Check liquidity, plus redemption advice).</p></div>
        <button class="btn" :disabled="running" @click="runDaily">{{ running ? 'Running... (about 10s)' : 'Run daily check' }}</button></div>
        <template v-if="daily">
          <p class="small muted" style="padding:0 24px;margin:0 0 8px">{{ daily.checked }} checked, {{ daily.failed }} failed · {{ dateTime(daily.checkedOn) }}</p>
          <div class="table-wrap"><table><thead><tr><th>UEN</th><th>Level</th><th>Result</th></tr></thead>
            <tbody><tr v-for="l in daily.lines" :key="l.uen"><td><b>{{ l.uen }}</b></td><td><Badge :tone="levelTone[l.level] || 'grey'" :label="l.level" /></td><td class="small">{{ l.message }}</td></tr>
              <tr v-if="!daily.lines.length"><td colspan="3" class="empty">No companies were checked.</td></tr></tbody></table></div>
        </template></div>

      <div class="card flush"><div style="padding:20px 24px 0"><div class="row"><h2 style="margin:0">Recommended liquidity actions</h2><Badge :tone="d.active.rebalancing.status === 'SHORTFALL' ? 'red' : 'green'" :label="titleCase(d.active.rebalancing.status)" /></div>
        <p class="small" style="margin-top:6px">Cash {{ money(d.active.rebalancing.cash) }} vs required {{ money(d.active.rebalancing.buffer + d.active.rebalancing.pendingCommitments) }}.</p></div>
        <div class="table-wrap"><table><tbody><tr v-for="x in d.active.rebalancing.actions" :key="x.id">
          <td style="width:140px"><Badge :tone="actTone[x.action]" :label="titleCase(x.action)" /></td>
          <td><b>{{ x.productName || 'Treasury' }}</b><br /><span class="small">{{ x.reason }}</span><br /><span v-if="x.estimatedSettlement" class="small muted">Settlement: {{ x.estimatedSettlement }}</span><span v-if="x.penaltyNote" class="small" style="color:var(--amber)"> · {{ x.penaltyNote }}</span></td>
          <td class="num"><b v-if="x.amount">{{ money(x.amount) }}</b></td>
          <td class="right"><router-link v-if="x.prefill" class="btn sm primary" :to="{ path: '/propose', query: x.prefill }">Create redemption proposal</router-link><router-link v-else-if="x.link" class="btn sm" to="/recommendations">View recommendation</router-link></td></tr></tbody></table></div></div>

      <div class="card flush"><div class="row spread" style="padding:20px 24px"><h2 style="margin:0">Resolved alerts ({{ d.resolved.alerts.length }})</h2><button class="btn sm" @click="showResolved = !showResolved">{{ showResolved ? 'Hide' : 'Show' }}</button></div>
        <div v-if="showResolved" class="table-wrap"><table><tbody><tr v-for="a in d.resolved.alerts" :key="a.id"><td><Badge :value="a.severity" /></td><td><b>{{ a.title }}</b><br /><span class="small muted">{{ a.message }}</span></td><td class="small">Raised {{ dateTime(a.raisedAt) }}<br />Resolved {{ dateTime(a.resolvedAt) }}</td></tr>
          <tr v-if="!d.resolved.alerts.length"><td class="empty">None yet.</td></tr></tbody></table></div></div>
    </div>
  </PageState>
</template>
