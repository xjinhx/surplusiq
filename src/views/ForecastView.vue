<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/index.js'
import { useLoad, act, errMsg, isDirector, currentUser } from '../composables/useApp.js'
import PageState from '../components/PageState.vue'
import Badge from '../components/Badge.vue'
import Modal from '../components/Modal.vue'
import LineChart from '../components/LineChart.vue'
import StackedBars from '../components/StackedBars.vue'
import { money, date, monthLabel, titleCase } from '../utils/format.js'

const route = useRoute()
onMounted(() => {
  if (route.query.focus !== 'commitment') return
  setTimeout(() => { const el = document.getElementById('commitment-form'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); const i = el.querySelector('input'); if (i) i.focus() } }, 900)
})
const refreshing = ref(false)
const { data: f, loading, error } = useLoad(async () => {
  const [forecast, commitments, buffer] = await Promise.all([api.forecastCashFlow({ days: 90 }), api.getCashCommitments(), api.getBufferSettings()])
  return { forecast, commitments, buffer }
})
async function recalc() {
  refreshing.value = true
  await act(() => api.forecastCashFlow({ days: 90, refresh: true }), 'Forecast recalculated')
  refreshing.value = false
}

const CATS = ['Tax - GST', 'Rent', 'Payroll - Salaries', 'Suppliers - COGS', 'Equipment', 'Marketing', 'Insurance', 'Revenue - Catering', 'Other']
const blank = () => ({ description: '', category: 'Tax - GST', direction: 'OUTFLOW', amount: null, dueDate: '', notes: '', payeeAccountId: '' })
const form = reactive(blank())
const saving = ref(false)
async function add() {
  saving.value = true
  const r = await act(() => api.createCommitment({ ...form }), 'Commitment added - surplus and forecast updated')
  saving.value = false
  if (r) Object.assign(form, blank())
}
const setStatus = (c, status) => act(() => api.updateCommitment({ id: c.id, status }), `Marked ${status.toLowerCase()}`)
const remove = (c) => act(() => api.deleteCommitment({ id: c.id }), 'Commitment removed')

// Pay a one-off payment through SIQ_Payment: dry run first (nothing moves), real transfer only on confirm.
const pay = reactive({ open: false, c: null, preview: null, busy: false })
async function openPay(c) {
  Object.assign(pay, { open: true, c, preview: null, busy: true })
  try { pay.preview = await api.payCommitment({ id: c.id, dryRun: true }) } catch (e) { pay.preview = { ok: false, message: errMsg(e) } } finally { pay.busy = false }
}
async function confirmPay() {
  pay.busy = true
  const r = await act(() => api.payCommitment({ id: pay.c.id, dryRun: false }), (x) => `Paid ${money(x.amount, true)} · tBank ref ${x.tbankRef}${x.belowBuffer ? ` · cash now ${money(x.shortfall)} below the buffer` : ''}`)
  pay.busy = false
  if (r) pay.open = false
}

const showBuf = ref(false); const bf = reactive({ months: 3, override: null, reason: '' })
function openBuf() { bf.months = f.value.buffer.bufferMonths; bf.override = f.value.buffer.override; bf.reason = f.value.buffer.overrideReason || ''; showBuf.value = true }
async function saveBuf() {
  const r = await act(() => api.updateBufferSettings({ bufferMonths: bf.months, override: bf.override === '' ? null : bf.override, reason: bf.reason }), 'Operating buffer updated')
  if (r) showBuf.value = false
}
const TYPE_LABEL = { FIXED: 'Fixed', VARIABLE: 'Variable', ONE_OFF: 'One-off' }
const typeTone = { FIXED: 'blue', VARIABLE: 'amber', ONE_OFF: 'grey' }
const bars = (h) => h.map((m) => ({ label: monthLabel(m.month + '-01'), parts: [{ key: 'r', label: 'Fixed recurring', value: m.recurring, color: '#3b5bdb' }, { key: 'v', label: 'Variable (suppliers, ads)', value: m.variable, color: '#91a7ff' }, { key: 'o', label: 'One-off', value: m.oneOff, color: '#dbe4ff' }] }))
</script>

<template>
  <div class="page-head"><div><h1>Cash forecast</h1></div><button class="btn" :disabled="refreshing" @click="recalc">{{ refreshing ? 'Recalculating...' : 'Recalculate forecast' }}</button></div>
  <PageState :loading="loading" :error="error" :ready="!!f">
    <div v-if="f" class="stack">
      <div class="grid g3">
        <div class="card kpi accent"><div class="label">Operating buffer <Badge v-if="f.buffer.override != null" tone="amber" label="Director override" /></div><div class="value">{{ money(f.buffer.effective) }}</div>
          <div class="sub">{{ f.buffer.override != null ? `Calculated ${money(f.buffer.calculated)} · ${f.buffer.overrideReason}` : `${f.buffer.bufferMonths} months × ${money(f.buffer.avgMonthlyOutflow)} avg monthly outflow` }}</div>
          <button v-if="isDirector" class="btn sm" style="margin-top:10px" @click="openBuf">Adjust buffer</button><div v-else class="sub" style="margin-top:8px">Only a Director can override.</div></div>
        <div class="card kpi"><div class="label">Avg monthly outflow</div><div class="value">{{ money(f.forecast.avgMonthlyOutflow) }}</div><div class="sub">avg inflow {{ money(f.forecast.avgMonthlyInflow) }} · {{ monthLabel(f.forecast.historyWindow.from) }}–{{ monthLabel(f.forecast.historyWindow.to) }}</div></div>
        <div class="card kpi" :class="f.forecast.lowestPoint30d.balance < f.buffer.effective ? 'bad' : ''"><div class="label">Lowest projected cash</div><div class="value">{{ money(f.forecast.lowestPoint30d.balance) }}</div><div class="sub">{{ date(f.forecast.lowestPoint30d.date) }}</div></div>
      </div>

      <div class="grid g-main">
        <div class="card"><div class="card-h"><h2>{{ f.forecast.horizonLabel }} cash projection</h2></div><LineChart :points="f.forecast.projection" :buffer="f.buffer.effective" :height="250" /><p class="hint" style="margin-top:12px">{{ f.forecast.assumptions.method }}</p></div>
        <div class="card"><h2>Monthly outflows - last 3 months</h2><StackedBars :groups="bars(f.forecast.history)" /></div>
      </div>

      <div class="grid g-main">
        <div class="card flush"><div style="padding:20px 24px 0"><h2>Detected recurring &amp; one-off expenses</h2><p class="muted small">Fixed = same amount every month.</p></div>
          <div class="table-wrap"><table><thead><tr><th>Payee</th><th>Category</th><th>Pattern</th><th class="num">Expected / month</th></tr></thead>
            <tbody><tr v-for="g in f.forecast.recurringItems" :key="g.counterparty"><td><b>{{ g.counterparty }}</b><br /><span class="muted small">{{ g.type === 'FIXED' ? `usually day ${g.dayOfMonth}` : g.type === 'ONE_OFF' ? `${g.monthsPresent} of 3 months - spread over 3` : 'varies each month' }}</span></td><td>{{ g.category }}</td><td><Badge :tone="typeTone[g.type]" :label="TYPE_LABEL[g.type]" /></td><td class="num">{{ money(g.expectedMonthly) }}</td></tr></tbody></table></div></div>

        <div class="stack">
          <div id="commitment-form" class="card"><h2>Add a known commitment</h2>
            <form @submit.prevent="add">
              <div class="field"><label>Description</label><input v-model="form.description" required placeholder="e.g. GST payment (quarter ended 31 Dec)" /></div>
              <div class="grid g2"><div class="field"><label>Amount (S$)</label><input v-model.number="form.amount" type="number" min="1" step="0.01" required /></div>
                <div class="field"><label>Due date</label><input v-model="form.dueDate" type="date" required /></div></div>
              <div class="grid g2"><div class="field"><label>Category</label><select v-model="form.category"><option v-for="c in CATS" :key="c">{{ c }}</option></select></div>
                <div class="field"><label>Direction</label><select v-model="form.direction"><option value="OUTFLOW">Payment (outflow)</option><option value="INFLOW">Receipt (inflow)</option></select></div></div>
              <div v-if="form.direction === 'OUTFLOW'" class="field"><label>Payee tBank account (optional)</label><input v-model="form.payeeAccountId" maxlength="30" placeholder="Empty = Bean Supply 0000006786" /></div>
              <button class="btn primary" :disabled="saving">Add commitment</button>
              <p class="hint" style="margin-top:8px">Payments due within 90 days reduce the surplus.</p>
            </form></div>
        </div>
      </div>

      <div class="card flush"><div style="padding:20px 24px 0"><h2>Known commitments</h2></div>
        <div v-if="!f.commitments.length" class="empty">No commitments yet. Pending commitments are S$0, so nothing is held back from the surplus.</div>
        <div v-else class="table-wrap"><table><thead><tr><th>Description</th><th>Due</th><th>Type</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead>
          <tbody><tr v-for="c in f.commitments" :key="c.id"><td><b>{{ c.description }}</b><br /><span class="muted small">{{ c.category }} · added by {{ c.createdBy }}</span></td><td>{{ date(c.dueDate) }}</td><td>{{ c.direction === 'OUTFLOW' ? 'Payment' : 'Receipt' }}</td>
            <td class="num" :style="{ color: c.direction === 'INFLOW' ? 'var(--green)' : '' }">{{ c.direction === 'INFLOW' ? '+' : '' }}{{ money(c.amount, true) }}</td><td><Badge :value="c.status" /></td>
            <td class="right"><button v-if="c.direction === 'OUTFLOW' && c.oneOff" class="btn sm primary" @click="openPay(c)">Pay</button><button v-else-if="c.status === 'PENDING'" class="btn sm" @click="setStatus(c, 'PAID')">Mark paid</button> <button class="btn sm danger" @click="remove(c)">Remove</button></td></tr></tbody></table></div></div>
    </div>
  </PageState>

  <Modal v-if="showBuf" title="Adjust operating buffer" @close="showBuf = false">
    <div class="field"><label>Months of cover (calculated = months × avg monthly outflow)</label><input v-model.number="bf.months" type="number" min="0.5" max="12" step="0.5" /></div>
    <div class="field"><label>Absolute override (S$) - leave blank to use the calculated buffer</label><input v-model.number="bf.override" type="number" min="0" step="1000" placeholder="e.g. 220000" /></div>
    <div class="field"><label>Reason (required for an override)</label><textarea v-model="bf.reason" placeholder="e.g. Renovation planned in Q1"></textarea></div>
    <template #actions><button class="btn" @click="showBuf = false">Cancel</button><button class="btn primary" @click="saveBuf">Save buffer</button></template>
  </Modal>

  <Modal v-if="pay.open" title="Pay commitment" @close="pay.open = false">
    <p v-if="!pay.preview" class="hint">Checking the balance and the buffer...</p>
    <template v-else>
      <dl class="kv">
        <dt>Commitment</dt><dd>{{ pay.c.description }}</dd>
        <dt>Amount</dt><dd>{{ money(pay.c.amount, true) }}</dd>
        <template v-if="pay.preview.ok">
          <dt>Pay to (tBank account)</dt><dd>{{ pay.preview.payee }}</dd>
          <dt>Operating account now</dt><dd>{{ money(pay.preview.balanceBefore, true) }}</dd>
          <dt>Cash after payment</dt><dd>{{ money(pay.preview.cashAfter) }}</dd>
          <dt>Operating buffer</dt><dd>{{ money(pay.preview.buffer) }}</dd>
        </template>
      </dl>
      <div v-if="!pay.preview.ok" class="banner red" style="margin-top:12px"><div><b>Cannot pay</b>{{ pay.preview.message }}</div></div>
      <div v-else-if="pay.preview.belowBuffer" class="banner amber" style="margin-top:12px"><div><b>Cash will fall below the buffer</b>Short by {{ money(pay.preview.shortfall) }}. Use Check liquidity on Alerts afterwards for a redemption plan.</div></div>
      <p v-if="pay.preview.ok" class="hint" style="margin-top:12px">This moves money in SMU tBank from the operating account and closes the commitment.</p>
    </template>
    <template #actions><button class="btn" @click="pay.open = false">Cancel</button><button class="btn primary" :disabled="pay.busy || !pay.preview || !pay.preview.ok" @click="confirmPay">{{ pay.busy && pay.preview ? 'Paying...' : `Pay ${money(pay.c.amount, true)}` }}</button></template>
  </Modal>
</template>
