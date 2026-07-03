import type {
  LocalCategory,
  CategoryListQuery,
  CategorySelectableQuery,
  CategoryParentOptionsQuery,
  PaginatedResult,
  LocalBrand,
  LocalModel,
  BrandListQuery,
  LocalUnit,
  UnitListQuery,
  LocalExpenseCategory,
  LocalAttributeGroup,
  LocalAttributeOption,
  LocalCategoryAttributeGroup,
  AttributeGroupListQuery,
  CategoryInput,
  UnitInput,
  BrandInput,
  ModelInput,
  ExpenseCategoryInput,
  AttributeGroupInput,
  AttributeOptionInput,
  CategoryAttributeLinkInput,
} from '@shared/ipc'
import type { CategoryAttributeGroupNode } from '@biztrack/types'
import { cget, cgetAll, cpost, cpatch, cdelete } from './cloud-http'

/**
 * Cloud (browser) adapters for the catalog domains. Reads map the API response DTO to
 * the desktop `Local*` shape; writes (Phase B) POST/PATCH/DELETE the API endpoints,
 * stripping null/undefined (the API DTOs use non-null `string` + `forbidNonWhitelisted`).
 */


/** Drop null/undefined so a payload satisfies the API's non-null optional DTO fields. */
function clean<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) out[k] = v
  return out
}

function qs(query?: Record<string, unknown>): string {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

// ---- categories ----
interface ApiCategory {
  id: string
  businessId?: string | null
  name: string
  slug?: string | null
  description?: string | null
  color?: string | null
  icon?: string | null
  imageUrl?: string | null
  sortOrder?: number
  parentId?: string | null
  depth?: number
  isActive?: boolean
  showOnline?: boolean
}

function toLocalCategory(c: ApiCategory): LocalCategory {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug ?? null,
    description: c.description ?? null,
    color: c.color ?? null,
    icon: c.icon ?? null,
    imageUrl: c.imageUrl ?? null,
    sortOrder: c.sortOrder ?? 0,
    parentId: c.parentId ?? null,
    depth: c.depth ?? 0,
    isActive: c.isActive ?? true,
    showOnline: c.showOnline ?? false,
  }
}

export const cloudCategories = {
  list: async (query?: CategoryListQuery): Promise<PaginatedResult<LocalCategory>> => {
    const res = await cget<PaginatedResult<ApiCategory>>(`/products/categories${qs(query as Record<string, unknown>)}`)
    return { ...res, data: res.data.map(toLocalCategory) }
  },
  listAll: async (): Promise<LocalCategory[]> =>
    (await cgetAll<ApiCategory>('/products/categories')).map(toLocalCategory),
  listSelectable: async (query?: CategorySelectableQuery): Promise<LocalCategory[]> =>
    (await cget<ApiCategory[]>(`/products/categories/selectable${qs(query as Record<string, unknown>)}`)).map(toLocalCategory),
  listParentOptions: async (query?: CategoryParentOptionsQuery): Promise<LocalCategory[]> =>
    (await cget<ApiCategory[]>(`/products/categories/parent-options${qs(query as Record<string, unknown>)}`)).map(
      toLocalCategory,
    ),
  create: async (input: CategoryInput): Promise<LocalCategory> =>
    toLocalCategory(await cpost<ApiCategory>('/products/categories', categoryPayload(input))),
  update: async (id: string, input: CategoryInput): Promise<LocalCategory> =>
    toLocalCategory(
      await cpatch<ApiCategory>(`/products/categories/${id}`, clean({ ...categoryPayload(input), isActive: input.isActive })),
    ),
  remove: (id: string): Promise<void> => cdelete<void>(`/products/categories/${id}`),
}

function categoryPayload(input: CategoryInput): Record<string, unknown> {
  return clean({
    name: input.name,
    description: input.description,
    color: input.color,
    icon: input.icon,
    imageUrl: input.imageUrl,
    parentId: input.parentId,
    sortOrder: input.sortOrder,
    showOnline: input.showOnline,
  })
}

// ---- brands (+ models) ----
interface ApiModel {
  id: string
  brandId: string
  name: string
  isActive?: boolean
  sortOrder?: number
}
interface ApiBrand {
  id: string
  name: string
  slug?: string | null
  logoUrl?: string | null
  description?: string | null
  isActive?: boolean
  sortOrder?: number
  categoryIds?: string[]
  models?: ApiModel[]
}

function toLocalModel(m: ApiModel): LocalModel {
  return { id: m.id, brandId: m.brandId, name: m.name, isActive: m.isActive ?? true, sortOrder: m.sortOrder ?? 0 }
}
function toLocalBrand(b: ApiBrand): LocalBrand {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug ?? null,
    logoUrl: b.logoUrl ?? null,
    description: b.description ?? null,
    isActive: b.isActive ?? true,
    sortOrder: b.sortOrder ?? 0,
    categoryIds: b.categoryIds ?? [],
    models: (b.models ?? []).map(toLocalModel),
  }
}

export const cloudBrands = {
  list: async (query?: BrandListQuery): Promise<PaginatedResult<LocalBrand>> => {
    const res = await cget<PaginatedResult<ApiBrand>>(`/brands${qs(query as Record<string, unknown>)}`)
    return { ...res, data: res.data.map(toLocalBrand) }
  },
  get: async (id: string): Promise<LocalBrand | null> => {
    try {
      return toLocalBrand(await cget<ApiBrand>(`/brands/${id}`))
    } catch {
      return null
    }
  },
  create: async (input: BrandInput): Promise<LocalBrand> =>
    toLocalBrand(await cpost<ApiBrand>('/brands', brandPayload(input))),
  update: async (id: string, input: BrandInput): Promise<LocalBrand> =>
    toLocalBrand(await cpatch<ApiBrand>(`/brands/${id}`, clean({ ...brandPayload(input), isActive: input.isActive }))),
  remove: (id: string): Promise<void> => cdelete<void>(`/brands/${id}`),
  addModel: async (brandId: string, input: ModelInput): Promise<LocalModel> =>
    toLocalModel(await cpost<ApiModel>(`/brands/${brandId}/models`, clean({ name: input.name }))),
  // updateModel/removeModel get only a modelId, but the API route is nested under the
  // brand. The brand list carries its models, so resolve the owning brand first.
  updateModel: async (modelId: string, input: ModelInput): Promise<LocalModel> => {
    const brandId = await findBrandIdForModel(modelId)
    return toLocalModel(
      await cpatch<ApiModel>(`/brands/${brandId}/models/${modelId}`, clean({ name: input.name, isActive: input.isActive })),
    )
  },
  removeModel: async (modelId: string): Promise<void> => {
    const brandId = await findBrandIdForModel(modelId)
    await cdelete<void>(`/brands/${brandId}/models/${modelId}`)
  },
}

async function findBrandIdForModel(modelId: string): Promise<string> {
  const brands = await cgetAll<ApiBrand>('/brands')
  const brand = brands.find((b) => (b.models ?? []).some((m) => m.id === modelId))
  if (!brand) throw new Error('Model not found.')
  return brand.id
}

function brandPayload(input: BrandInput): Record<string, unknown> {
  return clean({
    name: input.name,
    logoUrl: input.logoUrl,
    description: input.description,
    sortOrder: input.sortOrder,
    categoryIds: input.categoryIds,
  })
}

// ---- units ----
interface ApiUnit {
  id: string
  name: string
  abbreviation?: string | null
  businessId?: string | null
  type: LocalUnit['type']
  isDefault: boolean
  isActive?: boolean
}

function toLocalUnit(u: ApiUnit): LocalUnit {
  return {
    id: u.id,
    name: u.name,
    abbreviation: u.abbreviation ?? null,
    type: u.type,
    isDefault: u.isDefault,
    isActive: u.isActive ?? true,
    isSystem: u.businessId == null, // system units have no business scope
  }
}

export const cloudUnits = {
  list: async (query?: UnitListQuery): Promise<PaginatedResult<LocalUnit>> => {
    const res = await cget<PaginatedResult<ApiUnit>>(`/unit-of-measures${qs(query as Record<string, unknown>)}`)
    return { ...res, data: res.data.map(toLocalUnit) }
  },
  create: async (input: UnitInput): Promise<LocalUnit> =>
    toLocalUnit(await cpost<ApiUnit>('/unit-of-measures', clean({ name: input.name, abbreviation: input.abbreviation, type: input.type }))),
  update: async (id: string, input: UnitInput): Promise<LocalUnit> =>
    toLocalUnit(
      await cpatch<ApiUnit>(
        `/unit-of-measures/${id}`,
        clean({ name: input.name, abbreviation: input.abbreviation, type: input.type, isActive: input.isActive }),
      ),
    ),
  remove: (id: string): Promise<void> => cdelete<void>(`/unit-of-measures/${id}`),
}

// ---- expense categories ----
interface ApiExpenseCategory {
  id: string
  name: string
  slug?: string | null
  color?: string | null
  icon?: string | null
  sortOrder?: number
  isSystem: boolean
  expenseCount?: number
}

function toLocalExpenseCategory(c: ApiExpenseCategory): LocalExpenseCategory {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug ?? null,
    color: c.color ?? null,
    icon: c.icon ?? null,
    isSystem: c.isSystem,
    sortOrder: c.sortOrder ?? 0,
    expenseCount: c.expenseCount,
  }
}

export const cloudExpenseCategories = {
  listAll: async (): Promise<LocalExpenseCategory[]> =>
    (await cget<ApiExpenseCategory[]>('/expense-categories')).map(toLocalExpenseCategory),
  create: async (input: ExpenseCategoryInput): Promise<LocalExpenseCategory> =>
    toLocalExpenseCategory(
      await cpost<ApiExpenseCategory>('/expense-categories', clean({ name: input.name, color: input.color, icon: input.icon })),
    ),
}

// ---- attributes (groups + options + category links) ----
interface ApiAttributeOption {
  id: string
  groupId: string
  value: string
  colorHex?: string | null
  sortOrder: number
  isActive: boolean
}
interface ApiAttributeGroup {
  id: string
  name: string
  displayType: LocalAttributeGroup['displayType']
  sortOrder: number
  isActive: boolean
  categoryCount?: number
  options?: ApiAttributeOption[]
}

function toLocalAttributeOption(o: ApiAttributeOption): LocalAttributeOption {
  return { id: o.id, groupId: o.groupId, value: o.value, colorHex: o.colorHex ?? null, sortOrder: o.sortOrder, isActive: o.isActive }
}
function toLocalAttributeGroup(g: ApiAttributeGroup): LocalAttributeGroup {
  return {
    id: g.id,
    name: g.name,
    displayType: g.displayType,
    sortOrder: g.sortOrder,
    isActive: g.isActive,
    categoryCount: g.categoryCount ?? 0,
    options: (g.options ?? []).map(toLocalAttributeOption),
  }
}
function toLocalCategoryLink(n: CategoryAttributeGroupNode, categoryId: string): LocalCategoryAttributeGroup {
  return {
    id: n.id,
    categoryId,
    attributeGroupId: n.attributeGroupId,
    isRequired: n.isRequired,
    sortOrder: n.sortOrder,
    name: n.name,
    displayType: n.displayType,
    options: n.options.map((o) => ({ id: o.id, value: o.value, colorHex: o.colorHex ?? null })),
  }
}

export const cloudAttributes = {
  // The API returns ALL groups as a flat array; wrap it as a single-page result.
  listGroups: async (_query?: AttributeGroupListQuery): Promise<PaginatedResult<LocalAttributeGroup>> => {
    const data = (await cget<ApiAttributeGroup[]>('/attribute-groups')).map(toLocalAttributeGroup)
    return { data, total: data.length, page: 1, limit: data.length || 1, totalPages: 1 }
  },
  listAllGroups: async (): Promise<LocalAttributeGroup[]> =>
    (await cget<ApiAttributeGroup[]>('/attribute-groups')).map(toLocalAttributeGroup),
  listCategoryLinks: async (categoryId: string): Promise<LocalCategoryAttributeGroup[]> =>
    (await cget<CategoryAttributeGroupNode[]>(`/products/categories/${categoryId}/attribute-groups`)).map((n) =>
      toLocalCategoryLink(n, categoryId),
    ),
  createGroup: async (input: AttributeGroupInput): Promise<LocalAttributeGroup> =>
    toLocalAttributeGroup(await cpost<ApiAttributeGroup>('/attribute-groups', clean({ ...input }))),
  updateGroup: async (id: string, input: AttributeGroupInput): Promise<LocalAttributeGroup> =>
    toLocalAttributeGroup(await cpatch<ApiAttributeGroup>(`/attribute-groups/${id}`, clean({ ...input }))),
  deleteGroup: (id: string): Promise<void> => cdelete<void>(`/attribute-groups/${id}`),
  addOption: async (groupId: string, input: AttributeOptionInput): Promise<LocalAttributeOption> =>
    toLocalAttributeOption(await cpost<ApiAttributeOption>(`/attribute-groups/${groupId}/options`, clean({ ...input }))),
  // Option edit/delete get only the optionId; the group list carries its options, so
  // resolve the owning group first (the API route is nested under it).
  updateOption: async (optionId: string, input: AttributeOptionInput): Promise<LocalAttributeOption> => {
    const groupId = await findGroupIdForOption(optionId)
    return toLocalAttributeOption(
      await cpatch<ApiAttributeOption>(`/attribute-groups/${groupId}/options/${optionId}`, clean({ ...input })),
    )
  },
  deleteOption: async (optionId: string): Promise<void> => {
    const groupId = await findGroupIdForOption(optionId)
    await cdelete<void>(`/attribute-groups/${groupId}/options/${optionId}`)
  },
  // No bulk "set" endpoint — reconcile the desired links against the current ones.
  setCategoryLinks: async (categoryId: string, links: CategoryAttributeLinkInput[]): Promise<void> => {
    const base = `/products/categories/${categoryId}/attribute-groups`
    const current = await cget<CategoryAttributeGroupNode[]>(base)
    const currentIds = new Set(current.map((c) => c.attributeGroupId))
    const desiredIds = new Set(links.map((l) => l.attributeGroupId))
    for (const l of links) {
      const body = clean({ attributeGroupId: l.attributeGroupId, isRequired: l.isRequired, sortOrder: l.sortOrder })
      if (currentIds.has(l.attributeGroupId)) await cpatch<unknown>(`${base}/${l.attributeGroupId}`, body)
      else await cpost<unknown>(base, body)
    }
    for (const c of current) {
      if (!desiredIds.has(c.attributeGroupId)) await cdelete<unknown>(`${base}/${c.attributeGroupId}`)
    }
  },
}

async function findGroupIdForOption(optionId: string): Promise<string> {
  const groups = await cget<ApiAttributeGroup[]>('/attribute-groups')
  const group = groups.find((g) => (g.options ?? []).some((o) => o.id === optionId))
  if (!group) throw new Error('Attribute option not found.')
  return group.id
}
