import type {
  AttributeGroupInput,
  AttributeGroupListQuery,
  AttributeOptionInput,
  BrandInput,
  BrandListQuery,
  CategoryAttributeLinkInput,
  CategoryInput,
  CategoryListQuery,
  LocalAttributeGroup,
  LocalAttributeOption,
  LocalBrand,
  LocalCategory,
  LocalCategoryAttributeGroup,
  LocalModel,
  AuditListQuery,
  LocalAuditLog,
  LocalProduct,
  LocalProductImage,
  LocalSerialUnit,
  LocalStockMovement,
  LocalUnit,
  LocalVariant,
  ModelInput,
  PaginatedResult,
  ProductImageInput,
  ProductInput,
  ProductListQuery,
  ProductStats,
  SerialUnitInput,
  VariantInput,
  SkeletonCheckDTO,
  SkeletonHealthDTO,
  UnitInput,
  UnitListQuery,
  UploadFileInput,
  UploadedFile,
} from '@shared/ipc'

// The renderer's single data dependency. In Electron it resolves to the IPC bridge
// (offline-first, local SQLite via main). In a plain browser / the future cloud
// build it resolves to an HTTP adapter calling apps/api — same interface, so
// components never change.
export interface DataClient {
  skeleton: {
    getCheck: () => Promise<SkeletonCheckDTO | null>
    getHealth: () => Promise<SkeletonHealthDTO>
  }
  categories: {
    list: (query?: CategoryListQuery) => Promise<PaginatedResult<LocalCategory>>
    listAll: () => Promise<LocalCategory[]>
    create: (input: CategoryInput) => Promise<LocalCategory>
    update: (id: string, input: CategoryInput) => Promise<LocalCategory>
    remove: (id: string) => Promise<void>
  }
  attributes: {
    listGroups: (query?: AttributeGroupListQuery) => Promise<PaginatedResult<LocalAttributeGroup>>
    listAllGroups: () => Promise<LocalAttributeGroup[]>
    createGroup: (input: AttributeGroupInput) => Promise<LocalAttributeGroup>
    updateGroup: (id: string, input: AttributeGroupInput) => Promise<LocalAttributeGroup>
    deleteGroup: (id: string) => Promise<void>
    addOption: (groupId: string, input: AttributeOptionInput) => Promise<LocalAttributeOption>
    updateOption: (optionId: string, input: AttributeOptionInput) => Promise<LocalAttributeOption>
    deleteOption: (optionId: string) => Promise<void>
    listCategoryLinks: (categoryId: string) => Promise<LocalCategoryAttributeGroup[]>
    setCategoryLinks: (categoryId: string, links: CategoryAttributeLinkInput[]) => Promise<void>
  }
  units: {
    list: (query?: UnitListQuery) => Promise<PaginatedResult<LocalUnit>>
    create: (input: UnitInput) => Promise<LocalUnit>
    update: (id: string, input: UnitInput) => Promise<LocalUnit>
    remove: (id: string) => Promise<void>
  }
  brands: {
    list: (query?: BrandListQuery) => Promise<PaginatedResult<LocalBrand>>
    get: (id: string) => Promise<LocalBrand | null>
    create: (input: BrandInput) => Promise<LocalBrand>
    update: (id: string, input: BrandInput) => Promise<LocalBrand>
    remove: (id: string) => Promise<void>
    addModel: (brandId: string, input: ModelInput) => Promise<LocalModel>
    updateModel: (modelId: string, input: ModelInput) => Promise<LocalModel>
    removeModel: (modelId: string) => Promise<void>
  }
  products: {
    list: (query?: ProductListQuery) => Promise<PaginatedResult<LocalProduct>>
    stats: () => Promise<ProductStats>
    get: (id: string) => Promise<LocalProduct | null>
    create: (input: ProductInput) => Promise<LocalProduct>
    update: (id: string, input: ProductInput) => Promise<LocalProduct>
    remove: (id: string) => Promise<void>
    listImages: (productId: string) => Promise<LocalProductImage[]>
    setImages: (productId: string, images: ProductImageInput[]) => Promise<void>
    listVariants: (productId: string) => Promise<LocalVariant[]>
    setVariants: (productId: string, variants: VariantInput[]) => Promise<void>
    listSerialUnits: (productId: string) => Promise<LocalSerialUnit[]>
    setSerialUnits: (productId: string, units: SerialUnitInput[]) => Promise<void>
    listMovements: (productId: string) => Promise<LocalStockMovement[]>
  }
  audit: {
    list: (query?: AuditListQuery) => Promise<PaginatedResult<LocalAuditLog>>
  }
  uploads: {
    file: (input: UploadFileInput) => Promise<UploadedFile>
  }
}

/** True when running inside the Electron renderer (preload bridge present). */
export const isElectron = typeof window !== 'undefined' && Boolean(window.api)

function electronAdapter(): DataClient {
  return {
    skeleton: {
      getCheck: () => window.api.skeleton.getCheck(),
      getHealth: () => window.api.skeleton.getHealth(),
    },
    categories: {
      list: (query) => window.api.categories.list(query),
      listAll: () => window.api.categories.listAll(),
      create: (input) => window.api.categories.create(input),
      update: (id, input) => window.api.categories.update(id, input),
      remove: (id) => window.api.categories.remove(id),
    },
    attributes: {
      listGroups: (query) => window.api.attributes.listGroups(query),
      listAllGroups: () => window.api.attributes.listAllGroups(),
      createGroup: (input) => window.api.attributes.createGroup(input),
      updateGroup: (id, input) => window.api.attributes.updateGroup(id, input),
      deleteGroup: (id) => window.api.attributes.deleteGroup(id),
      addOption: (groupId, input) => window.api.attributes.addOption(groupId, input),
      updateOption: (optionId, input) => window.api.attributes.updateOption(optionId, input),
      deleteOption: (optionId) => window.api.attributes.deleteOption(optionId),
      listCategoryLinks: (categoryId) => window.api.attributes.listCategoryLinks(categoryId),
      setCategoryLinks: (categoryId, links) => window.api.attributes.setCategoryLinks(categoryId, links),
    },
    units: {
      list: (query) => window.api.units.list(query),
      create: (input) => window.api.units.create(input),
      update: (id, input) => window.api.units.update(id, input),
      remove: (id) => window.api.units.remove(id),
    },
    brands: {
      list: (query) => window.api.brands.list(query),
      get: (id) => window.api.brands.get(id),
      create: (input) => window.api.brands.create(input),
      update: (id, input) => window.api.brands.update(id, input),
      remove: (id) => window.api.brands.remove(id),
      addModel: (brandId, input) => window.api.brands.addModel(brandId, input),
      updateModel: (modelId, input) => window.api.brands.updateModel(modelId, input),
      removeModel: (modelId) => window.api.brands.removeModel(modelId),
    },
    products: {
      list: (query) => window.api.products.list(query),
      stats: () => window.api.products.stats(),
      get: (id) => window.api.products.get(id),
      create: (input) => window.api.products.create(input),
      update: (id, input) => window.api.products.update(id, input),
      remove: (id) => window.api.products.remove(id),
      listImages: (productId) => window.api.products.listImages(productId),
      setImages: (productId, images) => window.api.products.setImages(productId, images),
      listVariants: (productId) => window.api.products.listVariants(productId),
      setVariants: (productId, variants) => window.api.products.setVariants(productId, variants),
      listSerialUnits: (productId) => window.api.products.listSerialUnits(productId),
      setSerialUnits: (productId, units) => window.api.products.setSerialUnits(productId, units),
      listMovements: (productId) => window.api.products.listMovements(productId),
    },
    audit: {
      list: (query) => window.api.audit.list(query),
    },
    uploads: {
      file: (input) => window.api.uploads.file(input),
    },
  }
}

// Placeholder until the cloud build lands. The cloud/browser build is ONLINE-ONLY:
// it never touches the filesystem or SQLite — it calls apps/api directly over HTTP
// (access token in memory, refresh token in an httpOnly cookie). Until that adapter
// exists, fail with a clear message instead of a cryptic "window.api is undefined".
function cloudAdapter(): DataClient {
  const notWired = async (): Promise<never> => {
    throw new Error(
      'Online (cloud) mode is not wired up yet. Launch the desktop app with `pnpm dev:desktop-v2` to use the offline build.',
    )
  }
  return {
    skeleton: { getCheck: notWired, getHealth: notWired },
    categories: { list: notWired, listAll: notWired, create: notWired, update: notWired, remove: notWired },
    attributes: {
      listGroups: notWired,
      listAllGroups: notWired,
      createGroup: notWired,
      updateGroup: notWired,
      deleteGroup: notWired,
      addOption: notWired,
      updateOption: notWired,
      deleteOption: notWired,
      listCategoryLinks: notWired,
      setCategoryLinks: notWired,
    },
    units: { list: notWired, create: notWired, update: notWired, remove: notWired },
    brands: {
      list: notWired,
      get: notWired,
      create: notWired,
      update: notWired,
      remove: notWired,
      addModel: notWired,
      updateModel: notWired,
      removeModel: notWired,
    },
    products: {
      list: notWired,
      stats: notWired,
      get: notWired,
      create: notWired,
      update: notWired,
      remove: notWired,
      listImages: notWired,
      setImages: notWired,
      listVariants: notWired,
      setVariants: notWired,
      listSerialUnits: notWired,
      setSerialUnits: notWired,
      listMovements: notWired,
    },
    audit: { list: notWired },
    uploads: { file: notWired },
  }
}

export const dataClient: DataClient = isElectron ? electronAdapter() : cloudAdapter()
