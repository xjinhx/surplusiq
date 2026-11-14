import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './styles/base.css'

const routes = [
  { path: '/companies', component: () => import('./views/CompaniesView.vue') },
  { path: '/', component: () => import('./views/DashboardView.vue') },
  { path: '/forecast', component: () => import('./views/ForecastView.vue') },
  { path: '/propose', component: () => import('./views/ProposeView.vue') },
  { path: '/approvals', component: () => import('./views/ApprovalsView.vue') },
  { path: '/holdings', component: () => import('./views/HoldingsView.vue') },
  { path: '/invest', component: () => import('./views/TabsPage.vue'), redirect: '/invest/recommended',
    meta: { tabs: [{ to: '/invest/recommended', label: 'Recommended' }, { to: '/invest/catalogue', label: 'Product catalogue' }] },
    children: [
      { path: 'recommended', component: () => import('./views/RecommendationsView.vue') },
      { path: 'catalogue', component: () => import('./views/ProductsView.vue') },
    ] },
  { path: '/activity', component: () => import('./views/TabsPage.vue'), redirect: '/activity/alerts',
    meta: { tabs: [{ to: '/activity/alerts', label: 'Alerts' }, { to: '/activity/audit', label: 'Audit history' }] },
    children: [
      { path: 'alerts', component: () => import('./views/AlertsView.vue') },
      { path: 'audit', component: () => import('./views/AuditView.vue') },
    ] },
  // Old addresses still work and keep their query strings.
  { path: '/recommendations', redirect: (to) => ({ path: '/invest/recommended', query: to.query }) },
  { path: '/products', redirect: (to) => ({ path: '/invest/catalogue', query: to.query }) },
  { path: '/alerts', redirect: (to) => ({ path: '/activity/alerts', query: to.query }) },
  { path: '/audit', redirect: (to) => ({ path: '/activity/audit', query: to.query }) },
]
const router = createRouter({ history: createWebHashHistory(), routes, scrollBehavior: () => ({ top: 0 }) })

// Land on the company list once per browser session, then straight into the chosen company.
router.beforeEach((to) => {
  let picked = false
  try { picked = sessionStorage.getItem('siq.picked') === '1' } catch { picked = true }
  if (!picked && to.path !== '/companies') return '/companies'
})

createApp(App).use(router).mount('#app')
