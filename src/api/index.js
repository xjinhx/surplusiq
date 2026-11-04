// Single entry point used by every screen: `import { api } from '../api/index.js'`.
// All methods call the real SIQ_* OutSystems services (see src/api/liveApi.js and docs/LIVE_API.md).
export { liveApi as api } from './liveApi.js'
