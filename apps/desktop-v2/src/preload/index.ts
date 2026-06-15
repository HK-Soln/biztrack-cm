import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type BridgeApi } from '../shared/ipc'

// The ONLY surface the renderer can touch. No db, no tokens — just typed,
// high-level domain calls that resolve in the main-process services (the BFF).
const api: BridgeApi = {
  skeleton: {
    getCheck: () => ipcRenderer.invoke(IPC.skeletonCheck),
    getHealth: () => ipcRenderer.invoke(IPC.skeletonHealth),
  },
  theme: {
    set: (theme) => ipcRenderer.send(IPC.themeSet, theme),
  },
  window: {
    setTitleBarOverlay: (colors) => ipcRenderer.send(IPC.titlebarSetOverlay, colors),
  },
  auth: {
    getSession: () => ipcRenderer.invoke(IPC.authGetSession),
    login: (identifier, password) => ipcRenderer.invoke(IPC.authLogin, identifier, password),
    requestLogin: (identifier, channel) => ipcRenderer.invoke(IPC.authRequestLogin, identifier, channel),
    loginOtp: (identifier, code) => ipcRenderer.invoke(IPC.authLoginOtp, identifier, code),
    verifyPhone: (phone, code) => ipcRenderer.invoke(IPC.authVerifyPhone, phone, code),
    verifyEmail: (email, code) => ipcRenderer.invoke(IPC.authVerifyEmail, email, code),
    resendOtp: (identifier, type, channel) => ipcRenderer.invoke(IPC.authResendOtp, identifier, type, channel),
    register: (payload) => ipcRenderer.invoke(IPC.authRegister, payload),
    setupBusiness: (payload) => ipcRenderer.invoke(IPC.authSetupBusiness, payload),
    listPlans: () => ipcRenderer.invoke(IPC.authListPlans),
    selectPlan: (plan, billingCycle) => ipcRenderer.invoke(IPC.authSelectPlan, plan, billingCycle),
    selectBusiness: (businessId) => ipcRenderer.invoke(IPC.authSelectBusiness, businessId),
    listBusinesses: () => ipcRenderer.invoke(IPC.authListBusinesses),
    offlineLogin: (password) => ipcRenderer.invoke(IPC.authOfflineLogin, password),
    logout: () => ipcRenderer.invoke(IPC.authLogout),
  },
  sync: {
    trigger: () => ipcRenderer.invoke(IPC.syncTrigger),
    retry: () => ipcRenderer.invoke(IPC.syncRetry),
    getStatus: () => ipcRenderer.invoke(IPC.syncGetStatus),
    onStatus: (cb) => {
      const listener = (_e: unknown, status: Parameters<typeof cb>[0]) => cb(status)
      ipcRenderer.on(IPC.syncStatusEvent, listener)
      return () => ipcRenderer.removeListener(IPC.syncStatusEvent, listener)
    },
  },
  categories: {
    list: () => ipcRenderer.invoke(IPC.categoriesList),
    create: (input) => ipcRenderer.invoke(IPC.categoriesCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC.categoriesUpdate, id, input),
    remove: (id) => ipcRenderer.invoke(IPC.categoriesDelete, id),
  },
  uploads: {
    file: (input) => ipcRenderer.invoke(IPC.uploadsFile, input),
  },
}

contextBridge.exposeInMainWorld('api', api)
