import { reactive } from 'vue'

const KEY = 'siq.user'
let initial = 'u-priya'
try { initial = localStorage.getItem(KEY) || initial } catch { /* private mode */ }

// Who is "logged in". In OutSystems this comes from the platform session + UserRole entity.
export const session = reactive({ userId: initial })

export function setUser(id) {
  session.userId = id
  try { localStorage.setItem(KEY, id) } catch { /* ignore */ }
}
