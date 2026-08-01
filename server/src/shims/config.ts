// This file is copied by scripts/sync-core.mjs to src/gen/main/core/config.ts,
// replacing the Electron-coupled app/src/main/core/config.ts. The relative path
// below is valid AT THAT COPIED LOCATION (gen/main/core → src), which is why
// src/shims/ is excluded from tsconfig — only the copy is compiled.
// Same exported shape as the original, so every core module's `./config`
// import keeps working unmodified.
export { getConfig, setConfig } from '../../../config'
