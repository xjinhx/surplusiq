<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/index.js'
import { useLoad, act, isDirector } from '../composables/useApp.js'
import PageState from '../components/PageState.vue'
import Badge from '../components/Badge.vue'
import Modal from '../components/Modal.vue'
import { money, pct, titleCase, dateTime } from '../utils/format.js'

const router = useRouter()
const route = useRoute()
const { data: d, loading, error } = useLoad(async () => {
  const [rec, reb] = await Promise.all([api.recommendAllocation(), api.evaluateRebalancing()])
  return { rec, reb }
})

const generating = ref(false)
const generate = async () => { generating.value = true; await act(() => api.recommendAllocation({ generate: true }), 'New recommendation generated'); generating.value = false }
onMounted(() => { if (route.query.action === 'generate') { router.replace({ path: '/invest/recommended' }); generate() } })
const confirm = ref(false); const busy = ref(false); const previews = ref([])
async function openConfirm() {
  const rec = d.value.rec
  previews.value = await Promise.all(rec.lines.map(async (l) => ({ line: l, v: await api.validateProposal({ type: 'INVEST', productId: l.productId, amount: l.amount }) })))
  confirm.value = true
}
async function submitAll() {
  busy.value = true
  const rec = d.value.rec; let ok = 0
  // Largest first so term deposits reserve surplus before the liquid fund is sized.
  for (const l of [...rec.lines].sort((a, b) => b.amount - a.amount)) {
    const r = await act(() => api.submitProposal({ type: 'INVEST', productId: l.productId, amount: l.amount, recommendationId: rec.id, engineReason: l.reason, notes: 'From SurplusIQ allocation recommendation' }), (p) => `${p.productName}: ${p.status === 'EXECUTED' ? 'executed (simulated)' : 'sent to Director for approval'}`)
    if (r) ok++
  }
  busy.value = false; confirm.value = false
  if (ok) router.push('/approvals')
}
const actionTone = { REDEEM: 'red', REDUCE: 'amber', INVEST: 'green', MAINTAIN: 'grey', ROLLOVER_REVIEW: 'blue', ESCALATE: 'red' }
const wf = computed(() => d.value && d.value.rec.waterfall)
const termAmt = computed(() => d.value.rec.lines.filter((l) => l.role === 'TERM').reduce((a, l) => a + l.amount, 0))
const liqAmt = computed(() => d.value.rec.lines.filter((l) => l.role !== 'TERM').reduce((a, l) => a + l.amount, 0))
const segs = computed(() => {
  const w = wf.value
  const list = [
    { label: 'Operating buffer', value: w.operatingBuffer, color: '#9aa0b4' },
    { label: 'Term deposits', value: termAmt.value, color: '#4c6ef5' },
    { label: 'Money market fund', value: liqAmt.value, color: '#1f9d6b' },
    { label: 'Left in cash', value: Math.max(0, w.totalCash - w.operatingBuffer - w.allocated), color: '#d5d9e6' },
  ].filter((x) => x.value > 0)
  return list.map((x) => ({ ...x, w: (x.value / w.totalCash) * 100 }))
})
// Assumed current-account rate; the live data does not provide one.
const IDLE_RATE = 0.0005
const idleRatePct = (IDLE_RATE * 100).toFixed(2)
const idleReturn = computed(() => wf.value.allocated * IDLE_RATE * (d.value.rec.totals.horizonMonths / 12))
const idleW = computed(() => Math.max(2, (idleReturn.value / Math.max(1, d.value.rec.totals.projectedReturn)) * 100))
const ladder = computed(() => {
  const w = wf.value; const today = w.totalCash - w.allocated
  return [
    { label: 'Today', value: today, color: '#9aa0b4' },
    { label: 'Next business day', value: today + liqAmt.value, color: '#1f9d6b' },
    { label: 'At maturity', value: w.totalCash, color: '#4c6ef5' },
  ]
})
</script>

<template>
  <div class="page-head"><div><h1>Allocation recommendations</h1></div>
    <div v-if="d" class="row"><button class="btn primary" :disabled="generating" @click="generate">{{ generating ? 'Generating...' : 'Generate recommendation' }}</button></div></div>
  <PageState :loading="loading" :error="error" :ready="!!d">
    <div v-if="d" class="stack">
      <div class="card"><div class="flow">
        <div class="step"><div class="label">Total cash</div><div class="value">{{ money(wf.totalCash) }}</div></div>
        <div class="step"><div class="label">Operating buffer</div><div class="value">{{ money(wf.operatingBuffer) }}</div></div>
        <div class="step"><div class="label">Commitments + reserved</div><div class="value">{{ money(wf.pendingCommitments + wf.reservedByProposals) }}</div></div>
        <div class="step hl"><div class="label">Available to invest</div><div class="value">{{ money(wf.availableToPropose) }}</div></div>
        <div class="step"><div class="label">Recommended</div><div class="value">{{ money(wf.allocated) }}</div><div class="small muted">{{ money(wf.unallocated) }} stays in cash</div></div>
      </div></div>

      <div v-if="d.rec.status === 'ACTIONED'" class="banner green"><div><b>Proposals already submitted</b>Every line of this recommendation has a proposal. Generate a new run once cash changes.</div></div>
      <div v-if="d.rec.message" class="banner grey"><div><b>No new allocation</b>{{ d.rec.message }}</div></div>

      <template v-if="d.rec.lines.length">
        <div class="grid g3">
          <div class="card kpi"><div class="label">Recommended to invest</div><div class="value">{{ money(wf.allocated) }}</div></div>
          <div class="card kpi good"><div class="label">Projected return, {{ d.rec.totals.horizonMonths }} months</div><div class="value">+{{ money(d.rec.totals.projectedReturn) }}</div></div>
          <div class="card kpi"><div class="label">Blended rate</div><div class="value">{{ pct(d.rec.totals.blendedRate) }}</div></div>
        </div>

        <div class="card"><h2>Where your {{ money(wf.totalCash) }} sits after investing</h2>
          <div class="bar-stack"><div v-for="s in segs" :key="s.label" :style="{ width: s.w + '%', background: s.color }" :title="s.label + ' ' + money(s.value)"></div></div>
          <div class="legend"><span v-for="s in segs" :key="s.label"><i :style="{ background: s.color }"></i>{{ s.label }} {{ money(s.value) }}</span></div></div>

        <div class="grid g2">
          <div class="card"><h2>Idle vs invested</h2>
            <div class="hbar"><div class="hl"><span>In the current account</span><b>{{ money(idleReturn, true) }}</b></div><div class="track"><div :style="{ width: idleW + '%', background: '#9aa0b4' }"></div></div></div>
            <div class="hbar"><div class="hl"><span>Invested as recommended</span><b>{{ money(d.rec.totals.projectedReturn, true) }}</b></div><div class="track"><div style="width:100%;background:var(--accent)"></div></div></div>
            <div class="small">Assumes {{ idleRatePct }}% a year in the current account. Not guaranteed.</div></div>
          <div class="card"><h2>When your money is available</h2>
            <div v-for="r in ladder" :key="r.label" class="hbar"><div class="hl"><span>{{ r.label }}</span><b>{{ money(r.value) }}</b></div><div class="track"><div :style="{ width: (r.value / wf.totalCash * 100) + '%', background: r.color }"></div></div></div></div>
        </div>

        <div class="card flush"><div class="t-head"><h2>Recommended allocation</h2><span class="sub">{{ d.rec.id }} · {{ dateTime(d.rec.createdAt) }}</span></div>
          <div v-for="l in d.rec.lines" :key="l.productId" class="line-item">
            <div class="top-row">
              <div><div class="name">{{ l.productName }} <Badge :tone="l.role === 'TERM' ? 'blue' : 'green'" :label="l.role === 'TERM' ? 'Term' : 'Liquidity'" /></div>
                <div class="facts"><span>Rate <b>{{ pct(l.rate) }}</b></span><span>Return <b style="color:var(--pos)">+{{ money(l.projectedReturn, true) }}</b></span></div></div>
              <div class="amt">{{ money(l.amount) }}</div>
            </div>
          </div>
          <div class="total-row"><span class="small">Indicative only, not guaranteed.</span>
            <button class="btn green" :disabled="d.rec.status === 'ACTIONED'" @click="openConfirm">Create {{ d.rec.lines.length }} proposal{{ d.rec.lines.length > 1 ? 's' : '' }}</button></div></div>
      </template>

      <div class="card flush"><div style="padding:20px 24px 0"><h2>Rebalancing check <Badge :tone="d.reb.status === 'SHORTFALL' ? 'red' : d.reb.status === 'IDLE_SURPLUS' ? 'amber' : 'green'" :label="titleCase(d.reb.status)" /></h2></div>
        <div class="table-wrap"><table><tbody><tr v-for="a in d.reb.actions" :key="a.id"><td style="width:140px"><Badge :tone="actionTone[a.action]" :label="titleCase(a.action)" /></td>
          <td><b v-if="a.productName">{{ a.productName }}</b><b v-else>Treasury</b><br /><span class="small">{{ a.reason }}</span><br /><span v-if="a.penaltyNote" class="small" style="color:var(--amber)">{{ a.penaltyNote }}</span></td>
          <td class="num"><b v-if="a.amount">{{ money(a.amount) }}</b></td>
          <td class="right"><router-link v-if="a.prefill" class="btn sm primary" :to="{ path: '/propose', query: a.prefill }">Create proposal</router-link></td></tr></tbody></table></div></div>
      <p class="hint">{{ d.rec.disclaimer }}</p>
    </div>
  </PageState>

  <Modal v-if="confirm" title="Submit these proposals?" wide @close="confirm = false">
    <p class="muted">Each line becomes its own proposal and follows the approval rules.</p>
    <table><tbody><tr v-for="p in previews" :key="p.line.productId"><td><b>{{ p.line.productName }}</b></td><td class="num">{{ money(p.line.amount) }}</td>
      <td><Badge :tone="p.v.approval.required ? 'amber' : 'green'" :label="p.v.approval.required ? 'Director approval' : 'Direct execution'" /><br /><span class="small muted">{{ p.v.approval.reason }}</span></td><td><span v-if="!p.v.valid" class="small" style="color:var(--red)">Fails checks</span></td></tr></tbody></table>
    <template #actions><button class="btn" @click="confirm = false">Cancel</button><button class="btn green" :disabled="busy || previews.some((p) => !p.v.valid)" @click="submitAll">{{ busy ? 'Submitting...' : 'Submit proposals' }}</button></template>
  </Modal>
</template>
