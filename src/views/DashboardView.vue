<script setup>
import { computed, ref } from 'vue'
import { api } from '../api/index.js'
import { useLoad } from '../composables/useApp.js'
import PageState from '../components/PageState.vue'
import LineChart from '../components/LineChart.vue'
import { money, date, dateTime, pct } from '../utils/format.js'

const { data: d, loading, error } = useLoad(() => api.getDashboard())
const view = ref('avail')
const shown = computed(() => (!d.value ? 0 : view.value === 'avail' ? d.value.waterfall.investableSurplus : d.value.waterfall.totalCash))
// "188 100" + small ".00", like a statement
const parts = computed(() => { const [i, f] = Number(shown.value).toFixed(2).split('.'); return { int: i.replace(/\B(?=(\d{3})+(?!\d))/g, ' '), dec: f } })
const money2 = (n) => Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d)\.)/g, ' ').replace(/(\d)(?=(\d{3})+\.)/g, '$1 ')
const total = computed(() => (d.value ? d.value.allocation.reduce((a, s) => a + s.value, 0) || 1 : 1))
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
          <div class="tiles"><span v-for="b in banks" :key="b.name" class="tile" :title="`${b.name}: ${money(b.total)}`">{{ b.initials }}</span></div>
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
        <div class="t-head"><h2>Bank accounts</h2><span class="sub">{{ d.cash.accounts.length }} account{{ d.cash.accounts.length === 1 ? '' : 's' }} · {{ banks.length }} bank{{ banks.length === 1 ? '' : 's' }}</span></div>
        <div class="table-wrap"><table class="bordered">
          <thead><tr><th>Bank</th><th>Account</th><th>Use</th><th class="num">Balance</th></tr></thead>
          <tbody><tr v-for="a in d.cash.accounts" :key="a.id"><td><span class="brandtile">{{ (a.bankName || 'SMU Bank').slice(0, 1) }}</span>{{ a.bankName || 'SMU Bank' }}</td><td>{{ a.id }}</td><td>{{ a.role === 'OPERATING' ? 'Operating' : 'Settlement' }}</td><td class="num">{{ money2(a.balance) }}<span class="unit">{{ a.currency }}</span></td></tr></tbody></table></div>
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
          <table><tbody><tr v-for="e in d.recentActivity" :key="e.id"><td class="small">{{ e.summary }}<br /><span class="muted">{{ dateTime(e.ts) }} · {{ e.actor.name }}</span></td></tr></tbody></table></div>
      </div>
    </div>
  </PageState>
</template>
