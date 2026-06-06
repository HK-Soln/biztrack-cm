'use client'

import { ipc } from './ipc.bridge'

// Cache the availability check so every get/set/delete doesn't make two IPC
// round-trips. The result is stable for the lifetime of the renderer process.
let availabilityCache: boolean | null = null

async function isIpcStoreAvailable(): Promise<boolean> {
  if (availabilityCache !== null) return availabilityCache
  try {
    availabilityCache = await ipc.secureStore.isAvailable()
  } catch {
    availabilityCache = false
  }
  return availabilityCache
}

export const secureStore = {
  isAvailable: async () => isIpcStoreAvailable(),
  get: async (key: string) => {
    if (await isIpcStoreAvailable()) return ipc.secureStore.get(key)
    return null
  },
  set: async (key: string, value: string) => {
    if (await isIpcStoreAvailable()) return ipc.secureStore.set(key, value)
    return false
  },
  delete: async (key: string) => {
    if (await isIpcStoreAvailable()) return ipc.secureStore.delete(key)
    return false
  },
  clear: async () => {
    if (await isIpcStoreAvailable()) return ipc.secureStore.clear()
    return false
  },
}
