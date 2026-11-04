<script setup>
import { ref, computed } from 'vue'
import { api } from '../api/index.js'
import { useLoad } from '../composables/useApp.js'
import PageState from '../components/PageState.vue'
import Badge from '../components/Badge.vue'
import { money, pct, date, titleCase } from '../utils/format.js'

const { data: d, loading, error } = useLoad(() => api.getHoldings({}))
const showClosed = ref(false)
const active = computed(() => (d.value?.holdings || []).filter((h) => h.status === 'ACTIVE'))
const closed = computed(() => (d.value?.holdings || []).filter((h) => h.status !== 'ACTIVE'))
</script>

<template>
  <div class="page-head"><div><h1>Holdings &amp; returns</h1></div></div>
  <PageState :loading="loading" :error="error" :ready="!!d">
    <div v-if="d" class="stack">
      <div class="grid g4">
        <div class="card kpi accent"><div class="label">Invested principal</div><div class="value">{{ money(d.summary.principal) }}</div><div class="sub">{{ d.summary.count }} active holding{{ d.summary.count === 1 ? '' : 's' }}</div></div>
        <div class="card kpi"><div class="label">Accrued interest</div><div class="value">{{ money(d.summary.accruedInterest, true) }}</div><div class="sub">earned so far (simple interest)</div></div>
        <div class="card kpi good"><div class="label">Projected return</div><div class="value">+{{ money(d.summary.projectedReturn) }}</div><div class="sub">blended {{ pct(d.summary.blendedRate) }} · not guaranteed</div></div>
        <div class="card kpi"><div class="label">Liquid within 2 days</div><div class="value">{{ money(d.summary.liquidWithin2Days) }}</div><div class="sub">realised returns {{ money(d.summary.realisedReturn, true) }}</div></div>
      </div>

      <div class="card flush"><div style="padding:20px 24px 0"><h2>Active holdings</h2></div>
        <div v-if="!active.length" class="empty">No holdings yet. Start from <router-link to="/recommendations">Allocation Recommendations</router-link>.</div>
        <div v-else class="table-wrap"><table><thead><tr><th>Holding</th><th class="num">Principal</th><th class="num">Rate</th><th>Start and maturity</th><th class="num">Accrued</th><th class="num">Projected return</th><th>Liquidity</th><th></th></tr></thead>
          <tbody><tr v-for="h in active" :key="h.id"><td><b>{{ h.productName }}</b> <Badge v-if="h.simulated" tone="sim" label="Simulated" /><br /><span class="muted small">{{ h.id }} · from {{ h.proposalId }}</span></td>
            <td class="num"><b>{{ money(h.principal) }}</b></td><td class="num">{{ pct(h.rate) }}</td>
            <td>{{ date(h.startDate) }}<br /><span class="muted small">{{ h.maturityDate ? `matures ${date(h.maturityDate)} (${h.daysToMaturity}d)` : 'Open-ended' }}</span></td>
            <td class="num">{{ money(h.accruedInterest, true) }}</td><td class="num" style="color:var(--green)">+{{ money(h.projectedReturn, true) }}<br /><span class="muted small">{{ h.projectedReturnBasis }}</span></td>
            <td class="small" style="max-width:200px">{{ h.liquidityTerms }}<br /><Badge v-if="h.earlyBreakForfeitsInterest" tone="amber" label="Early exit forfeits interest" /></td>
            <td class="right"><router-link class="btn sm" :to="{ path: '/propose', query: { type: 'REDEEM', holdingId: h.id } }">Redeem</router-link></td></tr></tbody></table></div></div>

      <div v-if="closed.length" class="card flush"><div class="row spread" style="padding:20px 24px"><h2 style="margin:0">Closed holdings ({{ closed.length }})</h2><button class="btn sm" @click="showClosed = !showClosed">{{ showClosed ? 'Hide' : 'Show' }}</button></div>
        <div v-if="showClosed" class="table-wrap"><table><thead><tr><th>Holding</th><th class="num">Original principal</th><th class="num">Realised return</th><th>Closed</th></tr></thead>
          <tbody><tr v-for="h in closed" :key="h.id"><td><b>{{ h.productName }}</b> <Badge v-if="h.simulated" tone="sim" label="Simulated" /><br /><span class="muted small">{{ h.id }}</span></td><td class="num">{{ money(h.originalPrincipal) }}</td><td class="num">{{ money(h.realisedReturn, true) }}</td><td>{{ h.closedAt && date(h.closedAt.slice(0, 10)) }}</td></tr></tbody></table></div></div>
      <p class="hint">Projected return = principal × rate × tenor. Not guaranteed.</p>
    </div>
  </PageState>
</template>
