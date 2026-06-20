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
    list: (query) => ipcRenderer.invoke(IPC.categoriesList, query),
    listAll: () => ipcRenderer.invoke(IPC.categoriesListAll),
    listSelectable: (query) => ipcRenderer.invoke(IPC.categoriesSelectable, query),
    listParentOptions: (query) => ipcRenderer.invoke(IPC.categoriesParentOptions, query),
    create: (input) => ipcRenderer.invoke(IPC.categoriesCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC.categoriesUpdate, id, input),
    remove: (id) => ipcRenderer.invoke(IPC.categoriesDelete, id),
  },
  attributes: {
    listGroups: (query) => ipcRenderer.invoke(IPC.attributesListGroups, query),
    listAllGroups: () => ipcRenderer.invoke(IPC.attributesListAllGroups),
    createGroup: (input) => ipcRenderer.invoke(IPC.attributesCreateGroup, input),
    updateGroup: (id, input) => ipcRenderer.invoke(IPC.attributesUpdateGroup, id, input),
    deleteGroup: (id) => ipcRenderer.invoke(IPC.attributesDeleteGroup, id),
    addOption: (groupId, input) => ipcRenderer.invoke(IPC.attributesAddOption, groupId, input),
    updateOption: (optionId, input) => ipcRenderer.invoke(IPC.attributesUpdateOption, optionId, input),
    deleteOption: (optionId) => ipcRenderer.invoke(IPC.attributesDeleteOption, optionId),
    listCategoryLinks: (categoryId) => ipcRenderer.invoke(IPC.attributesListCategoryLinks, categoryId),
    setCategoryLinks: (categoryId, links) => ipcRenderer.invoke(IPC.attributesSetCategoryLinks, categoryId, links),
  },
  units: {
    list: (query) => ipcRenderer.invoke(IPC.unitsList, query),
    create: (input) => ipcRenderer.invoke(IPC.unitsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC.unitsUpdate, id, input),
    remove: (id) => ipcRenderer.invoke(IPC.unitsDelete, id),
  },
  brands: {
    list: (query) => ipcRenderer.invoke(IPC.brandsList, query),
    get: (id) => ipcRenderer.invoke(IPC.brandsGet, id),
    create: (input) => ipcRenderer.invoke(IPC.brandsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC.brandsUpdate, id, input),
    remove: (id) => ipcRenderer.invoke(IPC.brandsDelete, id),
    addModel: (brandId, input) => ipcRenderer.invoke(IPC.brandsAddModel, brandId, input),
    updateModel: (modelId, input) => ipcRenderer.invoke(IPC.brandsUpdateModel, modelId, input),
    removeModel: (modelId) => ipcRenderer.invoke(IPC.brandsDeleteModel, modelId),
  },
  products: {
    list: (query) => ipcRenderer.invoke(IPC.productsList, query),
    stats: () => ipcRenderer.invoke(IPC.productsStats),
    get: (id) => ipcRenderer.invoke(IPC.productsGet, id),
    create: (input) => ipcRenderer.invoke(IPC.productsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC.productsUpdate, id, input),
    remove: (id) => ipcRenderer.invoke(IPC.productsDelete, id),
    listImages: (productId) => ipcRenderer.invoke(IPC.productsListImages, productId),
    setImages: (productId, images) => ipcRenderer.invoke(IPC.productsSetImages, productId, images),
    listVariants: (productId) => ipcRenderer.invoke(IPC.productsListVariants, productId),
    setVariants: (productId, variants) => ipcRenderer.invoke(IPC.productsSetVariants, productId, variants),
    addVariant: (productId, input) => ipcRenderer.invoke(IPC.productsAddVariant, productId, input),
    updateVariant: (productId, variantId, input) => ipcRenderer.invoke(IPC.productsUpdateVariant, productId, variantId, input),
    removeVariant: (productId, variantId, reason) => ipcRenderer.invoke(IPC.productsRemoveVariant, productId, variantId, reason),
    listSerialUnits: (productId) => ipcRenderer.invoke(IPC.productsListSerialUnits, productId),
    setSerialUnits: (productId, units) => ipcRenderer.invoke(IPC.productsSetSerialUnits, productId, units),
    addSerialUnits: (productId, units, notes) => ipcRenderer.invoke(IPC.productsAddSerialUnits, productId, units, notes),
    retireSerialUnit: (productId, unitId, reason) => ipcRenderer.invoke(IPC.productsRetireSerialUnit, productId, unitId, reason),
    updateSerialNumber: (productId, unitId, serialNumber) =>
      ipcRenderer.invoke(IPC.productsUpdateSerialNumber, productId, unitId, serialNumber),
    listMovements: (productId) => ipcRenderer.invoke(IPC.productsListMovements, productId),
  },
  inventory: {
    list: (query) => ipcRenderer.invoke(IPC.inventoryList, query),
    stats: () => ipcRenderer.invoke(IPC.inventoryStats),
    reorderSuggestions: () => ipcRenderer.invoke(IPC.inventoryReorderSuggestions),
    restock: (input) => ipcRenderer.invoke(IPC.inventoryRestock, input),
    adjust: (productId, input) => ipcRenderer.invoke(IPC.inventoryAdjust, productId, input),
    setThreshold: (productId, input) => ipcRenderer.invoke(IPC.inventorySetThreshold, productId, input),
    listMovements: (productId, query) => ipcRenderer.invoke(IPC.inventoryListMovements, productId, query),
  },
  contacts: {
    list: (query) => ipcRenderer.invoke(IPC.contactsList, query),
    summary: () => ipcRenderer.invoke(IPC.contactsSummary),
    listAllSuppliers: () => ipcRenderer.invoke(IPC.contactsListAllSuppliers),
    listAllCustomers: () => ipcRenderer.invoke(IPC.contactsListAllCustomers),
    get: (id) => ipcRenderer.invoke(IPC.contactsGet, id),
    create: (input) => ipcRenderer.invoke(IPC.contactsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC.contactsUpdate, id, input),
    remove: (id) => ipcRenderer.invoke(IPC.contactsDelete, id),
  },
  debts: {
    listByContact: (contactId, query) => ipcRenderer.invoke(IPC.debtsListByContact, contactId, query),
    statement: (contactId, direction) => ipcRenderer.invoke(IPC.debtsStatement, contactId, direction),
    recordPayment: (debtId, input) => ipcRenderer.invoke(IPC.debtsRecordPayment, debtId, input),
  },
  rfqs: {
    list: (query) => ipcRenderer.invoke(IPC.rfqList, query),
    get: (id) => ipcRenderer.invoke(IPC.rfqGet, id),
    create: (input) => ipcRenderer.invoke(IPC.rfqCreate, input),
    recordQuote: (rfqId, input) => ipcRenderer.invoke(IPC.rfqRecordQuote, rfqId, input),
    buildDocument: (rfqId, supplierId) => ipcRenderer.invoke(IPC.rfqBuildDocument, rfqId, supplierId),
    send: (rfqId, supplierId, channel) => ipcRenderer.invoke(IPC.rfqSend, rfqId, supplierId, channel),
  },
  purchaseOrders: {
    list: (query) => ipcRenderer.invoke(IPC.poList, query),
    get: (id) => ipcRenderer.invoke(IPC.poGet, id),
    create: (input) => ipcRenderer.invoke(IPC.poCreate, input),
    createFromRfq: (rfqId, input) => ipcRenderer.invoke(IPC.poCreateFromRfq, rfqId, input),
    buildDocument: (poId) => ipcRenderer.invoke(IPC.poBuildDocument, poId),
    send: (poId, channel) => ipcRenderer.invoke(IPC.poSend, poId, channel),
    cancel: (poId) => ipcRenderer.invoke(IPC.poCancel, poId),
  },
  documents: {
    send: (input) => ipcRenderer.invoke(IPC.documentsSend, input),
    downloadPdf: (input) => ipcRenderer.invoke(IPC.documentsDownload, input),
  },
  audit: {
    list: (query) => ipcRenderer.invoke(IPC.auditList, query),
  },
  uploads: {
    file: (input) => ipcRenderer.invoke(IPC.uploadsFile, input),
  },
  charges: {
    listActive: () => ipcRenderer.invoke(IPC.chargesListActive),
  },
}

contextBridge.exposeInMainWorld('api', api)
