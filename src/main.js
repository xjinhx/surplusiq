import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './styles/base.css'

const routes = [
  { path: '/', component: () => import('./views/DashboardView.vue') },
  { path: '/forecast', component: () => import('./views/ForecastView.vue') },
  { path: '/products', component: () => import('./views/ProductsView.vue') },
  { path: '/recommendations', component: () => import('./views/RecommendationsView.vue') },
  { path: '/propose', component: () => import('./views/ProposeView.vue') },
  { path: '/approvals', component: () => import('./views/ApprovalsView.vue') },
  { path: '/holdings', component: () => import('./views/HoldingsView.vue') },
  { path: '/alerts', component: () => import('./views/AlertsView.vue') },
  { path: '/audit', component: () => import('./views/AuditView.vue') },
]
const router = createRouter({ history: createWebHashHistory(), routes, scrollBehavior: () => ({ top: 0 }) })

createApp(App).use(router).mount('#app')
