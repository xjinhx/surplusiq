<script setup>
import { ref } from 'vue'
import { api } from '../api/index.js'
import { act, toast, refreshAll } from '../composables/useApp.js'
import { setUser } from '../api/session.js'
import { money } from '../utils/format.js'
const open = ref(false); const amount = ref(60000)
const pay = () => act(() => api.simulateSupplierPayment({ amount: Number(amount.value), supplier: 'Alpine Equipment Supplies' }), `Added a ${money(amount.value)} supplier payment`)
async function reset() {
  if (!confirm('Remove the DEMO commitments you added? Proposals, holdings and audit rows already written to the database stay (the services have no delete method).')) return
  await api.resetDemo(); setUser('u-priya'); refreshAll(); toast('Demo commitments removed')
  location.hash = '#/'
}
</script>
<template>
  <div class="demo">
    <div v-if="open" class="pop stack gap-s">
      <b>Demo controls</b>
      <p class="muted small">Not part of the product. Switch user from the top bar to play Finance Staff or Director.</p>
      <div class="field"><label>Unexpected supplier payment (S$), added as a one-off commitment due in 7 days</label><input v-model.number="amount" type="number" min="1000" step="1000" /></div>
      <button class="btn" @click="pay">Add supplier payment</button>
      <button class="btn danger" @click="reset">Remove demo commitments</button>
    </div>
    <button class="pill" @click="open = !open">Demo controls</button>
  </div>
</template>
