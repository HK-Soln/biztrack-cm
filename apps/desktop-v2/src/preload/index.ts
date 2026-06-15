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
    selectBusiness: (businessId) => ipcRenderer.invoke(IPC.authSelectBusiness, businessId),
    listBusinesses: () => ipcRenderer.invoke(IPC.authListBusinesses),
    offlineLogin: (password) => ipcRenderer.invoke(IPC.authOfflineLogin, password),
    logout: () => ipcRenderer.invoke(IPC.authLogout),
  },
}

contextBridge.exposeInMainWorld('api', api)
