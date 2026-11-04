<script setup>
import { ref, computed } from 'vue'
import { api } from '../api/index.js'
import { useLoad } from '../composables/useApp.js'
import PageState from '../components/PageState.vue'
import Badge from '../components/Badge.vue'
import { money, pct, titleCase } from '../utils/format.js'

const { data: products, loading, error } = useLoad(() => api.getProducts())
const filter = ref('ALL')
const types = [['ALL', 'All'], ['MONEY_MARKET_FUND', 'Money market'], ['FIXED_DEPOSIT', 'Fixed deposits'], ['T_BILL', 'T-bills'], ['BOND_FUND', 'Bond funds']]
const shown = computed(() => (products.value || []).filter((p) => filter.value === 'ALL' || p.type === filter.value))
</script>

<template>
  <div class="page-head"><div><h1>Product catalogue</h1><p>Instruments SurplusIQ may recommend. Rates are <b>illustrative</b>, not live market prices, and returns are never guaranteed.</p></div>
    <div class="seg"><button v-for="[k, l] in types" :key="k" :class="{ on: filter === k }" @click="filter = k">{{ l }}</button></div></div>
  <PageState :loading="loading" :error="error" :ready="!!products">
    <div v-if="products" class="card flush"><div class="table-wrap"><table>
      <thead><tr><th>Product</th><th class="num">Indicative rate</th><th class="num">Tenor</th><th class="num">Min. investment</th><th>Liquidity</th><th>Risk</th><th>Status</th><th></th></tr></thead>
      <tbody><tr v-for="p in shown" :key="p.id" :style="{ opacity: p.approved ? 1 : .55 }">
        <td><b>{{ p.name }}</b><br /><span class="muted small">{{ titleCase(p.type) }} · {{ p.issuer }}</span><br /><span class="small">{{ p.description }}</span></td>
        <td class="num"><b>{{ pct(p.rate) }}</b><br /><span class="muted small">{{ p.rateBasis }}</span></td>
        <td class="num">{{ p.tenorMonths ? `${p.tenorMonths} months` : 'Open-ended' }}</td>
        <td class="num">{{ money(p.minInvestment) }}</td>
        <td class="small" style="max-width:220px">{{ p.liquidityTerms }}</td>
        <td><Badge :value="p.riskClass" /><br /><span v-if="!p.eligibleForPreference" class="small muted">Above risk preference</span></td>
        <td><Badge :tone="p.approved ? 'green' : 'grey'" :label="p.approved ? 'Approved' : 'Not approved'" /><br /><span v-if="p.heldValue" class="small muted">{{ money(p.heldValue) }} held</span></td>
        <td class="right"><router-link v-if="p.approved && p.eligibleForPreference" class="btn sm primary" :to="{ path: '/propose', query: { productId: p.id } }">Propose</router-link></td></tr></tbody></table></div></div>
    <p class="hint" style="margin-top:12px">Products come from the InvestmentProduct service in OutSystems. Rates are illustrative, not market prices.</p>
  </PageState>
</template>
