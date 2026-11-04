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
onMounted(() => { if (route.query.action === 'generate') { router.replace({ path: '/recommendations' }); generate() } })
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
</script>

<template>
  <div class="page-head"><div><h1>Allocation recommendations</h1><p>A transparent, rules-based liquidity-first allocation. Nothing is executed until it goes through the approval rules.</p></div>
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

      <div v-if="d.rec.lines.length" class="grid g-main">
        <div class="card flush"><div class="t-head"><h2>Recommended allocation</h2><span class="sub">{{ d.rec.id }} · {{ dateTime(d.rec.createdAt) }}</span></div>
          <div v-for="l in d.rec.lines" :key="l.productId" class="line-item">
            <div class="top-row">
              <div><div class="name">{{ l.productName }} <Badge :tone="l.role === 'TERM' ? 'blue' : 'green'" :label="l.role === 'TERM' ? 'Term' : 'Liquidity'" /></div>
                <div class="facts"><span>Rate <b>{{ pct(l.rate) }}</b></span><span>Share of surplus <b>{{ pct(l.pctOfSurplus, 1) }}</b></span><span>Projected return <b style="color:var(--pos)">+{{ money(l.projectedReturn, true) }}</b> {{ l.projectedReturnBasis }}</span></div></div>
              <div class="amt">{{ money(l.amount) }}</div>
            </div>
            <p class="why">{{ l.reason }}</p>
          </div>
          <div class="total-row">
            <span class="small muted"><template v-if="d.rec.totals.baselineReturn">Vs about {{ money(d.rec.totals.baselineReturn, true) }} if left in the current account over {{ d.rec.totals.horizonMonths }} months. </template>Total {{ money(wf.allocated) }} at {{ pct(d.rec.totals.blendedRate) }} blended, +{{ money(d.rec.totals.projectedReturn, true) }} projected. Indicative only, not guaranteed.</span>
            <button class="btn green" :disabled="d.rec.status === 'ACTIONED'" @click="openConfirm">Create {{ d.rec.lines.length }} proposal{{ d.rec.lines.length > 1 ? 's' : '' }}</button></div></div>

        <div class="card"><h2>How the engine decided</h2>
          <ol class="steps"><li v-for="s in d.rec.steps" :key="s.n"><div><b>{{ s.title }}</b><br /><span class="muted small">{{ s.detail }}</span></div></li></ol>
          <template v-if="d.rec.excluded.length"><div class="divider"></div><h3>Considered but not selected</h3>
          <ul class="checks"><li v-for="x in d.rec.excluded" :key="x.productId"><span class="dot WARN" style="background:#9fb0b0">–</span><span><b>{{ x.productName }}</b><br /><span class="muted small">{{ x.reason }}</span></span></li></ul></template></div>
      </div>

      <div class="card flush"><div style="padding:20px 24px 0"><h2>Rebalancing check <Badge :tone="d.reb.status === 'SHORTFALL' ? 'red' : d.reb.status === 'IDLE_SURPLUS' ? 'amber' : 'green'" :label="titleCase(d.reb.status)" /></h2>
        <p class="muted small">Compares today's cash position and holdings with the rules and proposes maintain / reduce / redeem / invest.</p></div>
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
    <p class="hint" style="margin-top:10px">Execution is simulated in this prototype and holdings are labelled accordingly.</p>
    <template #actions><button class="btn" @click="confirm = false">Cancel</button><button class="btn green" :disabled="busy || previews.some((p) => !p.v.valid)" @click="submitAll">{{ busy ? 'Submitting...' : 'Submit proposals' }}</button></template>
  </Modal>
</template>
