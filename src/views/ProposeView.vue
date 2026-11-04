<script setup>
import { reactive, ref, watch, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api/index.js'
import { useLoad, act, currentUser } from '../composables/useApp.js'
import PageState from '../components/PageState.vue'
import Badge from '../components/Badge.vue'
import Checks from '../components/Checks.vue'
import { money, pct, date, dateTime } from '../utils/format.js'

const route = useRoute(); const router = useRouter()
const { data: ref0, loading, error } = useLoad(async () => {
  const [products, hold, cash, mine] = await Promise.all([api.getProducts(), api.getHoldings({ status: 'ACTIVE' }), api.getCashPosition(), api.getProposals({})])
  return { products, holdings: hold.holdings, cash, mine }
})

const f = reactive({ type: 'INVEST', productId: '', holdingId: '', amount: null, notes: '' })
const v = ref(null); const busy = ref(false)
onMounted(() => {
  const q = route.query
  if (q.type === 'REDEEM' || q.holdingId) { f.type = 'REDEEM'; f.holdingId = q.holdingId || '' }
  if (q.productId) f.productId = q.productId
  if (q.amount) f.amount = Number(q.amount)
})
const approved = computed(() => (ref0.value?.products || []).filter((p) => p.approved))
const product = computed(() => approved.value.find((p) => p.id === f.productId))
const holding = computed(() => ref0.value?.holdings.find((h) => h.id === f.holdingId))
watch(() => f.holdingId, (id) => { const h = ref0.value?.holdings.find((x) => x.id === id); if (h && h.earlyBreakForfeitsInterest && !f.amount) f.amount = h.principal })

let timer
watch([() => f.type, () => f.productId, () => f.holdingId, () => f.amount, () => ref0.value], () => {
  clearTimeout(timer)
  if (!ref0.value || !f.amount || (f.type === 'INVEST' ? !f.productId : !f.holdingId)) { v.value = null; return }
  timer = setTimeout(async () => { try { v.value = await api.validateProposal({ type: f.type, productId: f.productId, holdingId: f.holdingId, amount: f.amount }) } catch { v.value = null } }, 250)
}, { immediate: true })

async function submit() {
  busy.value = true
  const r = await act(() => api.submitProposal({ type: f.type, productId: f.productId, holdingId: f.holdingId, amount: f.amount, notes: f.notes }), (p) => p.status === 'EXECUTED' ? `${p.id} executed (simulated)` : `${p.id} sent to a Director for approval`)
  busy.value = false
  if (r) { f.amount = null; f.notes = ''; router.replace({ path: '/propose' }); if (r.status === 'PENDING_APPROVAL') router.push('/approvals') }
}
const setMax = () => { f.amount = f.type === 'INVEST' ? ref0.value.cash.availableToPropose : holding.value?.principal }
const mine = computed(() => (ref0.value?.mine || []).slice(0, 8))
</script>

<template>
  <div class="page-head"><div><h1>Propose investment</h1><p>Submit an investment or redemption. Checks run live; the approval route depends on the amount and the Director-set policy.</p></div></div>
  <PageState :loading="loading" :error="error" :ready="!!ref0">
    <div v-if="ref0" class="stack">
      <div class="grid g-main">
        <div class="card">
          <div class="seg" style="margin-bottom:16px"><button :class="{ on: f.type === 'INVEST' }" @click="f.type = 'INVEST'">Invest</button><button :class="{ on: f.type === 'REDEEM' }" @click="f.type = 'REDEEM'">Redeem</button></div>
          <template v-if="f.type === 'INVEST'">
            <div class="field"><label>Product</label><select v-model="f.productId"><option value="" disabled>Choose an approved product</option>
              <option v-for="p in approved" :key="p.id" :value="p.id">{{ p.name }} - {{ pct(p.rate) }} · {{ p.tenorMonths ? p.tenorMonths + 'M' : 'open-ended' }}</option></select>
              <span v-if="product" class="hint">{{ product.liquidityTerms }} · min {{ money(product.minInvestment) }} · risk {{ product.riskClass.replace('_', ' ').toLowerCase() }}</span></div>
          </template>
          <template v-else>
            <div class="field"><label>Holding to redeem</label><select v-model="f.holdingId"><option value="" disabled>Choose a holding</option>
              <option v-for="h in ref0.holdings" :key="h.id" :value="h.id">{{ h.productName }} - {{ money(h.principal) }} ({{ h.id }})</option></select>
              <span v-if="holding" class="hint">Accrued interest {{ money(holding.accruedInterest, true) }} · {{ holding.liquidityTerms }}</span></div>
          </template>
          <div class="field"><label>Amount (S$)</label><div class="row"><input v-model.number="f.amount" type="number" min="0" step="1000" placeholder="0" /><button type="button" class="btn sm" @click="setMax">{{ f.type === 'INVEST' ? 'Max available' : 'Full' }}</button></div>
            <span class="hint">Available to invest now: {{ money(ref0.cash.availableToPropose) }} (surplus {{ money(ref0.cash.investableSurplus) }}{{ ref0.cash.reservedByProposals ? `, ${money(ref0.cash.reservedByProposals)} reserved by pending proposals` : '' }})</span></div>
          <div class="field"><label>Notes for the approver (optional)</label><textarea v-model="f.notes" placeholder="Why this, why now?"></textarea></div>
          <div class="row spread"><span class="small muted">Submitting as <b>{{ currentUser.name }}</b></span>
            <button class="btn green" :disabled="busy || !v || !v.valid" @click="submit">{{ v && !v.approval.required ? 'Submit & execute' : 'Submit for approval' }}</button></div>
        </div>

        <div class="stack">
          <div class="card"><h2>Validation</h2>
            <div v-if="!v" class="muted small">Choose a {{ f.type === 'INVEST' ? 'product' : 'holding' }} and amount to run the checks.</div>
            <Checks v-else :checks="v.checks" /></div>
          <div v-if="v" class="card"><h2>Approval route</h2>
            <Badge :tone="v.approval.required ? 'amber' : 'green'" :label="v.approval.required ? 'Director approval required' : 'Direct execution'" />
            <p class="small muted" style="margin-top:8px">{{ v.approval.reason }}.</p>
            <dl v-if="v.impact.cashAfter != null" class="kv" style="margin-top:8px"><dt>Cash before</dt><dd>{{ money(v.impact.cashBefore) }}</dd><dt>Cash after</dt><dd>{{ money(v.impact.cashAfter) }}</dd><dt>Headroom over buffer</dt><dd :style="{ color: v.impact.headroomAfter < 0 ? 'var(--red)' : '' }">{{ money(v.impact.headroomAfter) }}</dd>
              <template v-if="f.type === 'INVEST'"><dt>Projected return</dt><dd style="color:var(--green)">+{{ money(v.impact.projectedReturn, true) }}</dd></template>
              <template v-else><dt>Interest realised</dt><dd>{{ money(v.impact.realisedInterest, true) }}</dd></template></dl>
            <p class="hint" style="margin-top:8px">Execution is simulated; indicative returns are not guaranteed.</p></div>
        </div>
      </div>

      <div class="card flush"><div style="padding:20px 24px 0"><h2>Recent proposals</h2></div>
        <div v-if="!mine.length" class="empty">No proposals yet.</div>
        <div v-else class="table-wrap"><table><thead><tr><th>Proposal</th><th>Maker</th><th class="num">Amount</th><th>Status</th><th>Created</th></tr></thead>
          <tbody><tr v-for="p in mine" :key="p.id"><td><b>{{ p.id }}</b> · {{ p.type === 'INVEST' ? 'Invest' : 'Redeem' }}<br /><span class="muted small">{{ p.productName }}</span></td><td>{{ p.maker.name }}</td><td class="num">{{ money(p.amount) }}</td><td><Badge :value="p.status" /></td><td class="small">{{ dateTime(p.createdAt) }}</td></tr></tbody></table></div></div>
    </div>
  </PageState>
</template>
