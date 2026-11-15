<script setup>
import { computed, ref, reactive } from 'vue'
import { api } from '../api/index.js'
import { useLoad, act } from '../composables/useApp.js'
import Modal from '../components/Modal.vue'
import PageState from '../components/PageState.vue'
import LineChart from '../components/LineChart.vue'
import Badge from '../components/Badge.vue'
import { money, date, dateTime, pct, eventTone, eventLabel, ROLE_LABEL } from '../utils/format.js'

const { data: d, loading, error } = useLoad(() => api.getDashboard())
const { data: conns } = useLoad(() => api.getBankConnections())
const connOf = (accountId) => (conns.value || []).find((c) => c.accountId === accountId)
const blank = () => ({ bankName: '', bic: '', bankId: null, tenantId: null, customerId: '', accountId: '', isPrimary: false })
const showLink = ref(false); const lf = reactive(blank()); const linking = ref(false)
async function linkAccount() {
  linking.value = true
  const r = await act(() => api.addBankConnection({ ...lf }), 'Bank account linked')
  linking.value = false
  if (r) { showLink.value = false; Object.assign(lf, blank()) }
}
const unlink = (c) => c && act(() => api.setBankConnectionActive({ raw: c._raw, active: false }), 'Bank account unlinked')
const view = ref('avail')
// Repeated identical entries (for example several liquidity checks) collapse into one row with a count.
const activity = computed(() => {
  const out = []
  for (const e of d.value?.recentActivity || []) {
    const last = out[out.length - 1]
    if (last && last.summary === e.summary && last.event === e.event && last.actor.id === e.actor.id) last.count++
    else out.push({ ...e, count: 1 })
  }
  return out.slice(0, 5)
})
const shown = computed(() => (!d.value ? 0 : view.value === 'avail' ? d.value.waterfall.investableSurplus : d.value.waterfall.totalCash))
// "188 100" + small ".00", like a statement
const parts = computed(() => { const [i, f] = Number(shown.value).toFixed(2).split('.'); return { int: i.replace(/\B(?=(\d{3})+(?!\d))/g, ' '), dec: f } })
const money2 = (n) => Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d)\.)/g, ' ').replace(/(\d)(?=(\d{3})+\.)/g, '$1 ')
const total = computed(() => (d.value ? d.value.allocation.reduce((a, s) => a + s.value, 0) || 1 : 1))
// Bank logos in public/logos, keyed by the first word of the bank name. Banks without a logo show their initials.
const LOGOS = { dbs: 'dbs.png', ocbc: 'ocbc.webp', uob: 'uob.png', jpmc: 'jpmc.webp', citi: 'citi.png' }
const logoOf = (name) => { const f = LOGOS[String(name || '').split(' ')[0].toLowerCase()]; return f ? `/logos/${f}` : null }
// One tile per bank (SMU Bank until the cash service returns BankName per account).
const banks = computed(() => {
  const m = new Map()
  for (const a of d.value ? d.value.cash.accounts : []) { const n = a.bankName || 'SMU Bank'; m.set(n, (m.get(n) || 0) + a.balance) }
  return [...m].map(([name, total]) => ({ name, total, initials: name.split(' ')[0].slice(0, 4).toUpperCase() }))
})
</script>

<template>
  <PageState :loading="loading" :error="error" :ready="!!d">
    <div v-if="d" class="stack">
      <div v-for="a in d.alerts.filter((x) => x.severity !== 'INFO')" :key="a.id" class="banner" :class="a.severity === 'CRITICAL' ? 'red' : 'amber'">
        <div class="grow"><b>{{ a.title }}</b>{{ a.message }}</div><router-link class="btn sm" to="/alerts">Review and fix</router-link>
      </div>

      <div class="grid" style="grid-template-columns: minmax(0, 1fr) minmax(0, 2.1fr)">
        <div class="card">
          <div class="seg light"><button :class="{ on: view === 'avail' }" @click="view = 'avail'">Available</button><button :class="{ on: view === 'total' }" @click="view = 'total'">Total cash</button></div>
          <div class="amt-big">{{ parts.int }}<span class="dec">.{{ parts.dec }}</span></div>
          <div class="caption">{{ view === 'avail' ? 'Cash free to invest, in' : 'Current cash in' }} <span class="chip">SGD</span></div>
          <p class="small muted" style="margin-top:12px">Buffer {{ money(d.waterfall.operatingBuffer) }}<template v-if="d.waterfall.pendingCommitments"> · commitments {{ money(d.waterfall.pendingCommitments) }}</template></p>
          <div class="tiles"><span v-for="b in banks" :key="b.name" class="tile" :class="{ logo: logoOf(b.name) }" :title="`${b.name}: ${money(b.total)}`"><img v-if="logoOf(b.name)" :src="logoOf(b.name)" :alt="b.name" />
            <template v-else>{{ b.initials }}</template></span></div>
        </div>
        <div class="card">
          <div class="card-h"><h2>Cash projection</h2><span class="small muted">Lowest {{ money(d.lowestPoint30d.balance) }} · {{ date(d.lowestPoint30d.date) }}</span></div>
          <LineChart :points="d.forecast30" :buffer="d.waterfall.operatingBuffer" :height="250" />
        </div>
      </div>

      <div class="card flush">
        <div class="t-head"><h2>Where the money sits</h2><span class="sub">Cash and investments in SGD</span></div>
        <div class="table-wrap"><table class="bordered">
          <thead><tr><th>Allocation</th><th>Share</th><th class="num">Amount</th></tr></thead>
          <tbody><tr v-for="s in d.allocation" :key="s.key"><td><b>{{ s.label }}</b></td>
            <td><div class="share-cell"><span class="inbar" :style="{ width: Math.max(3, (s.value / total) * 140) + 'px', margin: 0 }"></span><span class="p">{{ ((s.value / total) * 100).toFixed(2) }}%</span></div></td>
            <td class="num">{{ money2(s.value) }}<span class="unit">SGD</span></td></tr></tbody></table></div>
      </div>

      <div class="card flush">
        <div class="t-head"><h2>Bank accounts</h2><span class="sub">{{ d.cash.accounts.length }} account{{ d.cash.accounts.length === 1 ? '' : 's' }} · {{ banks.length }} bank{{ banks.length === 1 ? '' : 's' }}</span><button class="btn sm primary" style="margin-left:auto" @click="showLink = true">Link bank account</button></div>
        <div class="table-wrap"><table class="bordered">
          <thead><tr><th>Bank</th><th>Account</th><th>Use</th><th class="num">Balance</th><th></th></tr></thead>
          <tbody><tr v-for="a in d.cash.accounts" :key="a.id"><td><span class="brandtile" :class="{ logo: logoOf(a.bankName) }"><img v-if="logoOf(a.bankName)" :src="logoOf(a.bankName)" :alt="a.bankName" /><template v-else>{{ (a.bankName || 'SMU Bank').slice(0, 1) }}</template></span>{{ a.bankName || 'SMU Bank' }}</td><td>{{ a.id }}</td><td>{{ a.role === 'OPERATING' ? 'Operating' : 'Settlement' }}</td><td class="num">{{ money2(a.balance) }}<span class="unit">{{ a.currency }}</span></td><td class="right"><button v-if="connOf(a.id) && !connOf(a.id).isPrimary" class="btn sm" @click="unlink(connOf(a.id))">Unlink</button></td></tr></tbody></table></div>
      </div>

      <div class="card stats" style="padding:0">
        <div class="kpi"><div class="label">Treasury assets</div><div class="value">{{ money(d.cash.totalTreasuryAssets) }}</div><div class="sub">cash plus investments</div></div>
        <div class="kpi"><div class="label">Cash utilisation</div><div class="value">{{ pct(d.utilisationPct, 0) }}</div><div class="sub">of assets earning a return</div></div>
        <div class="kpi"><div class="label">Projected returns</div><div class="value">{{ money(d.holdingsSummary.projectedReturn) }}</div><div class="sub">indicative, not guaranteed</div></div>
        <div class="kpi"><div class="label">Pending approvals</div><div class="value">{{ d.pendingApprovals.count }}</div><div class="sub">{{ money(d.pendingApprovals.totalAmount) }} awaiting a Director</div></div>
      </div>

      <div class="grid g2">
        <div class="card flush"><div class="t-head"><h2>Upcoming maturities</h2></div>
          <div v-if="!d.upcomingMaturities.length" class="empty">No term holdings yet.</div>
          <table v-else class="bordered"><tbody><tr v-for="m in d.upcomingMaturities" :key="m.holdingId"><td><b>{{ m.productName }}</b><br /><span class="muted small">{{ date(m.maturityDate) }} · in {{ m.daysToMaturity }} days</span></td><td class="num">{{ money(m.principal) }}<br /><span class="small" style="color:var(--pos)">+{{ money(m.projectedReturn) }}</span></td></tr></tbody></table></div>
        <div class="card flush"><div class="t-head"><h2>Recent activity</h2><router-link class="small" to="/audit" style="margin-left:auto">Audit history</router-link></div>
          <table><tbody><tr v-for="e in activity" :key="e.id"><td class="small"><Badge :tone="eventTone(e.event)" :label="eventLabel(e.event)" /> <b v-if="e.count > 1">x{{ e.count }}</b><br />{{ e.summary }}<br /><span class="muted">{{ dateTime(e.ts) }} · {{ e.actor.name }}<template v-if="e.actor.role !== 'SYSTEM'">, {{ ROLE_LABEL[e.actor.role] }}</template></span></td></tr></tbody></table></div>
      </div>
    </div>
  </PageState>
  <Modal v-if="showLink" title="Link bank account" @close="showLink = false">
    <form @submit.prevent="linkAccount">
      <div class="field"><label>Bank name</label><input v-model="lf.bankName" required maxlength="50" placeholder="e.g. DBS Bank" /></div>
      <div class="grid g2"><div class="field"><label>BIC</label><input v-model="lf.bic" required maxlength="11" placeholder="e.g. DBSBSGSG" /></div>
        <div class="field"><label>Bank ID</label><input v-model.number="lf.bankId" type="number" min="1" required /></div></div>
      <div class="grid g2"><div class="field"><label>tBank customer ID</label><input v-model="lf.customerId" required maxlength="20" inputmode="numeric" /></div>
        <div class="field"><label>Tenant ID</label><input v-model.number="lf.tenantId" type="number" min="1" required /></div></div>
      <div class="field"><label>Account number</label><input v-model="lf.accountId" required maxlength="20" inputmode="numeric" /></div>
      <label class="small" style="display:flex;gap:8px;align-items:center"><input v-model="lf.isPrimary" type="checkbox" /> Make this the primary account</label>
      <div class="actions"><button type="button" class="btn" @click="showLink = false">Cancel</button><button class="btn primary" :disabled="linking">Link account</button></div>
    </form>
  </Modal>
</template>
