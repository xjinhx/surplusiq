import { BASE, MODULES } from './config.js'

export class ApiError extends Error {
  constructor(message, code = 'API_ERROR', details) { super(message); this.code = code; this.details = details }
}

// Several screens ask for the same GET in the same tick (dashboard, nav badges). A 2s cache removes the duplicates;
// any write clears it so the next read is fresh.
const cache = new Map()
const TTL = 2000
export const bust = () => cache.clear()

async function request(verb, mod, method, params, body) {
  const [module, api] = MODULES[mod]
  const qs = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString()
  const url = `${BASE}/${module}/rest/${api}/${method}${qs ? '?' + qs : ''}`
  const init = { method: verb, headers: { Accept: 'application/json' } }
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body) }
  let res
  try { res = await fetch(url, init) } catch (e) { throw new ApiError(`Network error calling ${method}: ${e.message}`, 'NETWORK') }
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* not JSON (e.g. IIS 411 page) */ }
  if (!res.ok) {
    const msg = json && json.Errors && json.Errors.length ? json.Errors.join('; ') : `${method} failed (HTTP ${res.status})`
    throw new ApiError(msg, `HTTP_${res.status}`, json)
  }
  return json
}

export async function get(mod, method, params) {
  const key = `${mod}/${method}?${JSON.stringify(params || {})}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.t < TTL) return hit.p
  const p = request('GET', mod, method, params)
  cache.set(key, { t: Date.now(), p })
  p.catch(() => cache.delete(key))
  return p
}
export const post = (mod, method, params, body) => { bust(); return request('POST', mod, method, params, body) }
export const put = async (mod, method, body) => {
  bust()
  const r = await request('PUT', mod, method, null, body)
  if (r && r.Success === false) throw new ApiError(r.Message || `${method} failed`, 'UPDATE_FAILED')
  return r
}
