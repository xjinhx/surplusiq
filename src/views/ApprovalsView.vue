<script setup>
import { reactive, ref, watch, computed } from 'vue'
import { api } from '../api/index.js'
import { useLoad, act, isDirector, currentUser } from '../composables/useApp.js'
import PageState from '../components/PageState.vue'
import Badge from '../components/Badge.vue'
import Checks from '../components/Checks.vue'
import Modal from '../components/Modal.vue'
import { money, dateTime, titleCase, pct } from '../utils/format.js'

const tab = ref('pending')
const { data: d, loading, error } = useLoad(async () => {
  const [pending, all, controls] = await Promise.all([api.getProposals({ status: 'PENDING_APPROVAL' }), api.getProposals({}), api.getTreasuryControls()])
  return { pending, history: all.filter((p) => p.status !== 'PENDING_APPROVAL'), controls }
})

const comment = reactive({}); const rejecting = ref(null); const rejectReason = ref('')
const approve = (p) => act(() => api.approveProposal({ id: p.id, decision: 'APPROVE', comment: comment[p.id] || '' }), (r) => r.status === 'EXECUTED' ? `${r.id} approved and executed (simulated)` : `${r.id}: ${r.execution?.message || r.status}`)
async function reject() {
  const r = await act(() => api.approveProposal({ id: rejecting.value.id, decision: 'REJECT', comment: rejectReason.value }), 'Proposal rejected')
  if (r) { rejecting.value = null; rejectReason.value = '' }
}
const withdraw = (p) => act(() => api.withdrawProposal({ id: p.id }), 'Proposal withdrawn')
const selfBlocked = (p) => p.maker.id === currentUser.value.id

const ctl = reactive({}); const dirty = computed(() => d.value && Object.keys(d.value.controls).some((k) => ctl[k] !== d.value.controls[k]))
watch(() => d.value, (x) => { if (x) Object.assign(ctl, x.controls) }, { immediate: true })
const saveCtl = () => act(() => api.updateTreasuryControls({ ...ctl }), 'Treasury controls updated')
</script>

<template>
  <div class="page-head"><div><h1>Approvals</h1><p>Maker-checker: finance staff propose, a different Director approves. Every decision is logged.</p></div></div>
  <PageState :loading="loading" :error="error" :ready="!!d">
    <div v-if="d">
      <div class="tabs"><button :class="{ on: tab === 'pending' }" @click="tab = 'pending'">Pending ({{ d.pending.length }})</button><button :class="{ on: tab === 'history' }" @click="tab = 'history'">History</button><button :class="{ on: tab === 'controls' }" @click="tab = 'controls'">Approval rules &amp; risk limits</button></div>

      <div v-if="tab === 'pending'" class="stack">
        <div v-if="!isDirector && d.pending.length" class="banner blue"><div><b>Awaiting a Director</b>You are signed in as Finance Staff. Switch to a Director (top right) to approve or reject.</div></div>
        <div v-if="!d.pending.length" class="card empty">Nothing waiting for approval.</div>
        <div v-for="p in d.pending" :key="p.id" class="card">
          <div class="row spread wrap"><div><h2 style="margin:0">{{ p.id }} · {{ p.type === 'INVEST' ? 'Invest in' : 'Redeem from' }} {{ p.productName }}</h2>
            <span class="muted small">Proposed by {{ p.maker.name }} · {{ dateTime(p.createdAt) }}{{ p.recommendationId ? ` · from ${p.recommendationId}` : '' }}</span></div>
            <div class="right"><div style="font-size:24px;font-weight:700">{{ money(p.amount) }}</div><Badge tone="amber" :label="p.approval.reason" /></div></div>
          <div class="grid g3" style="margin-top:14px">
            <div><h3>Validation at submission</h3><Checks :checks="p.checks" /></div>
            <div><h3>Liquidity impact</h3><dl class="kv"><dt>Cash before</dt><dd>{{ money(p.impact.cashBefore) }}</dd><dt>Cash after</dt><dd>{{ money(p.impact.cashAfter) }}</dd><dt>Operating buffer</dt><dd>{{ money(p.impact.buffer) }}</dd><dt>Headroom after</dt><dd :style="{ color: p.impact.headroomAfter < 0 ? 'var(--red)' : '' }">{{ money(p.impact.headroomAfter) }}</dd>
              <dt>{{ p.type === 'INVEST' ? 'Projected return' : 'Interest realised' }}</dt><dd>{{ p.type === 'INVEST' ? '+' + money(p.projectedReturn, true) : money(p.impact.realisedInterest, true) }}</dd></dl>
              <p class="hint" style="margin-top:6px">Indicative only - returns are not guaranteed. Execution will be simulated.</p></div>
            <div><h3>Why</h3><p class="small">{{ p.engineReason || p.notes || 'Manual proposal - no engine rationale attached.' }}</p><p v-if="p.engineReason && p.notes" class="small muted">Note: {{ p.notes }}</p></div>
          </div>
          <div class="divider"></div>
          <div v-if="isDirector" class="row wrap">
            <input v-model="comment[p.id]" style="max-width:340px" placeholder="Comment (optional)" />
            <button class="btn green" :disabled="selfBlocked(p)" @click="approve(p)">Approve &amp; execute</button><button class="btn danger" @click="rejecting = p">Reject</button>
            <span v-if="selfBlocked(p)" class="small" style="color:var(--amber)">You made this proposal - another Director must approve it.</span></div>
          <div v-else class="row spread"><span class="muted small">Waiting for a Director to decide.</span><button v-if="p.maker.id === currentUser.id" class="btn sm" @click="withdraw(p)">Withdraw</button></div>
        </div>
      </div>

      <div v-else-if="tab === 'history'" class="card flush"><div v-if="!d.history.length" class="empty">No decided proposals yet.</div>
        <div v-else class="table-wrap"><table><thead><tr><th>Proposal</th><th class="num">Amount</th><th>Route</th><th>Decision</th><th>Outcome</th></tr></thead>
          <tbody><tr v-for="p in d.history" :key="p.id"><td><b>{{ p.id }}</b> · {{ p.type === 'INVEST' ? 'Invest' : 'Redeem' }}<br /><span class="muted small">{{ p.productName }} · by {{ p.maker.name }}</span></td><td class="num">{{ money(p.amount) }}</td>
            <td><Badge :tone="p.approval.required ? 'amber' : 'green'" :label="p.approval.required ? 'Director' : 'Direct'" /></td>
            <td class="small"><template v-if="p.decision">{{ titleCase(p.decision.outcome) }} by {{ p.decision.by }}<br /><span class="muted">{{ dateTime(p.decision.at) }}{{ p.decision.comment ? ' · ' + p.decision.comment : '' }}</span></template><template v-else>-</template></td>
            <td><Badge :value="p.status" /> <Badge v-if="p.execution && p.execution.mode === 'SIMULATED'" tone="sim" label="Simulated" /><br /><span class="muted small">{{ p.execution && p.execution.message }}</span></td></tr></tbody></table></div></div>

      <div v-else class="card" style="max-width:820px"><h2>Approval rules &amp; risk limits <Badge v-if="!isDirector" tone="grey" label="Read-only - Director only" /></h2>
        <div class="grid g2">
          <div class="field"><label>Approval threshold (S$) - above this always needs a Director</label><input v-model.number="ctl.approvalThreshold" type="number" step="10000" :disabled="!isDirector" /></div>
          <div class="field"><label>Policy at or below the threshold</label><select v-model="ctl.belowThresholdPolicy" :disabled="!isDirector"><option value="DIRECT">Direct execution permitted</option><option value="DIRECTOR_ALL">Director reviews everything</option></select></div>
          <div class="field"><label>Risk preference</label><select v-model="ctl.riskPreference" :disabled="!isDirector"><option value="CONSERVATIVE">Conservative (low risk only)</option><option value="MODERATE">Balanced / moderate (allows medium risk)</option><option value="GROWTH">Growth (all risk levels)</option></select></div>
          <div class="field"><label>Investment horizon / max tenor (months)</label><select v-model.number="ctl.horizonMonths" :disabled="!isDirector"><option :value="3">3</option><option :value="6">6</option><option :value="12">12</option></select></div>
          <div class="field"><label>Minimum % kept liquid (money market fund)</label><input v-model.number="ctl.liquidPct" type="number" min="0" max="100" :disabled="!isDirector" /></div>
          <div class="field"><label>Pending-commitment window (days)</label><input v-model.number="ctl.commitmentWindowDays" type="number" min="0" :disabled="!isDirector" /></div>
          <div class="field"><label>Idle-cash prompt / invest trigger (S$)</label><input v-model.number="ctl.minIdleSurplus" type="number" step="1000" min="0" :disabled="!isDirector" /></div>
        </div>
        <button v-if="isDirector" class="btn primary" :disabled="!dirty" @click="saveCtl">Save controls</button>
      </div>
    </div>
  </PageState>

  <Modal v-if="rejecting" :title="`Reject ${rejecting.id}?`" @close="rejecting = null">
    <div class="field"><label>Reason (required, recorded in the audit trail)</label><textarea v-model="rejectReason" placeholder="e.g. Cash needed for renovation deposit"></textarea></div>
    <template #actions><button class="btn" @click="rejecting = null">Cancel</button><button class="btn danger" :disabled="!rejectReason.trim()" @click="reject">Reject proposal</button></template>
  </Modal>
</template>
