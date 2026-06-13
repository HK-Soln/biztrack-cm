import type { Currency } from './business.types'
import type { ListQuery, IsoDateString } from './http.types'

export enum UnitOfMeasureType {
  QUANTITY = 'QUANTITY',
  WEIGHT = 'WEIGHT',
  VOLUME = 'VOLUME',
  LENGTH = 'LENGTH',
  CUSTOM = 'CUSTOM',
}

export enum ProductType {
  SIMPLE = 'SIMPLE', // physical good, integer qty, inventory tracked (may be untracked — see below)
  SERVICE = 'SERVICE', // no physical stock, no inventory row
  VARIABLE_QUANTITY = 'VARIABLE_QUANTITY', // sold by weight/volume/length, decimal qty
  COMPOSITE = 'COMPOSITE', // bundle of other products, no own stock
}

export interface ProductTypeFlags {
  isService: boolean
  trackInventory: boolean
}

/**
 * Derive the legacy `isService` / `trackInventory` flags from a `productType`.
 *
 * SERVICE and COMPOSITE never carry stock; VARIABLE_QUANTITY always does.
 * SIMPLE may be tracked OR untracked — "physical but untracked" is an existing,
 * supported configuration — so the caller's explicit `trackInventory` is honored
 * for SIMPLE only (defaulting to true).
 */
export function deriveProductTypeFlags(
  productType: ProductType,
  explicitTrackInventory?: boolean | null,
): ProductTypeFlags {
  switch (productType) {
    case ProductType.SERVICE:
      return { isService: true, trackInventory: false }
    case ProductType.COMPOSITE:
      return { isService: false, trackInventory: false }
    case ProductType.VARIABLE_QUANTITY:
      return { isService: false, trackInventory: true }
    case ProductType.SIMPLE:
    default:
      return { isService: false, trackInventory: explicitTrackInventory ?? true }
  }
}

/** Best-effort classification for legacy clients that only send `isService`. */
export function inferProductType(isService?: boolean | null): ProductType {
  return isService ? ProductType.SERVICE : ProductType.SIMPLE
}

export interface ProductUserSummary {
  id: string
  name: string
}

export enum AttributeDisplayType {
  CHIPS = 'CHIPS', // text chips
  SWATCHES = 'SWATCHES', // colour circles (options carry colorHex)
  DROPDOWN = 'DROPDOWN', // long lists (>8 options)
}

export interface AttributeOption {
  id: string
  groupId: string
  businessId: string
  value: string
  colorHex?: string | null
  sortOrder: number
  isActive: boolean
  createdAt?: IsoDateString
}

export interface AttributeGroup {
  id: string
  businessId: string
  name: string
  displayType: AttributeDisplayType
  sortOrder: number
  isActive: boolean
  options?: AttributeOption[]
  createdAt?: IsoDateString
  updatedAt?: IsoDateString
}

/** Link of an attribute group to a (leaf) category, with presentation order. */
export interface CategoryAttributeGroup {
  id: string
  categoryId: string
  attributeGroupId: string
  isRequired: boolean
  sortOrder: number
  group?: AttributeGroup
}

export interface CreateAttributeGroupRequest {
  name: string
  displayType: AttributeDisplayType
  sortOrder?: number
}

export interface UpdateAttributeGroupRequest {
  name?: string
  displayType?: AttributeDisplayType
  sortOrder?: number
  isActive?: boolean
}

export interface CreateAttributeOptionRequest {
  value: string
  colorHex?: string
  sortOrder?: number
}

export interface UpdateAttributeOptionRequest {
  value?: string
  colorHex?: string | null
  sortOrder?: number
  isActive?: boolean
}

export interface LinkCategoryAttributeGroupRequest {
  attributeGroupId: string
  isRequired?: boolean
  sortOrder?: number
}

export interface UpdateCategoryAttributeGroupRequest {
  isRequired?: boolean
  sortOrder?: number
}

/** Attribute group as embedded in the category tree (leaf nodes). */
export interface CategoryAttributeGroupNode {
  id: string // category_attribute_groups link id
  attributeGroupId: string
  name: string
  displayType: AttributeDisplayType
  isRequired: boolean
  sortOrder: number
  options: Array<{ id: string; value: string; colorHex?: string | null }>
}

// ---- Variants (Phase 3C) --------------------------------------------------

/** One attribute dimension of a variant (e.g. Color=Black). Normalized link. */
export interface ProductVariantOption {
  id: string
  variantId: string
  attributeGroupId: string
  attributeOptionId: string
  businessId: string
  // Enriched for display (optional — populated by detail/tree responses).
  groupName?: string
  optionValue?: string
  colorHex?: string | null
}

/** A concrete sellable configuration of a product (e.g. "Black 128GB"). */
export interface ProductVariant {
  id: string
  businessId: string
  productId: string
  name: string
  displayNameOverride?: string | null
  priceOverride?: number | null
  costPriceOverride?: number | null
  sku?: string | null
  barcode?: string | null
  isActive: boolean
  sortOrder: number
  options?: ProductVariantOption[]
  // Enriched stock (optional — populated by sell-screen / detail responses).
  currentStock?: number | null
  lowStockThreshold?: number | null
  createdAt?: IsoDateString
  updatedAt?: IsoDateString
}

/** Selection of options from one attribute group, driving variant generation. */
export interface ProductAttributeSelection {
  attributeGroupId: string
  selectedOptionIds: string[]
}

/** Per-combination override applied after the matrix is generated. */
export interface VariantOverride {
  optionIds: string[]
  excluded?: boolean
  nameOverride?: string
  priceOverride?: number
  costPriceOverride?: number
  openingStock?: number
}

export interface PreviewVariantsRequest {
  attributeSelections: ProductAttributeSelection[]
  variantOverrides?: VariantOverride[]
}

export interface PreviewVariantAttribute {
  groupId: string
  groupName: string
  optionId: string
  optionValue: string
  colorHex?: string | null
}

/** One row of the previewed/saved variant matrix. */
export interface PreviewVariant {
  name: string
  optionIds: string[]
  attributes: PreviewVariantAttribute[]
  excluded: boolean
  priceOverride?: number | null
  costPriceOverride?: number | null
  openingStock?: number | null
}

export interface PreviewVariantsResponse {
  totalCombinations: number
  variants: PreviewVariant[]
}

// ---- Composite / bundle products (Phase 3F) -------------------------------

export interface ProductBundleComponent {
  id: string
  businessId: string
  bundleProductId: string
  componentProductId: string
  quantity: number
  sortOrder: number
  // Enriched for display.
  componentName?: string
}

export interface CreateBundleComponentRequest {
  componentProductId: string
  quantity: number
  sortOrder?: number
}

export interface BundleAvailabilityComponent {
  productId: string
  productName: string
  requiredPerBundle: number
  inStock: number
}

export interface BundleAvailability {
  productId: string
  canMake: number
  limitedBy: string | null
  components: BundleAvailabilityComponent[]
}

export interface ProductCategory {
  id: string
  businessId: string
  name: string
  slug?: string
  color?: string | null
  icon?: string | null
  imageUrl?: string | null
  sortOrder?: number
  parentId?: string | null
  depth?: number
  isLeaf?: boolean
  isActive?: boolean
  createdAt: IsoDateString
  updatedAt: IsoDateString
}

/** A category node in the nested tree returned by GET /products/categories/tree. */
export interface CategoryTreeNode {
  id: string
  name: string
  slug?: string
  depth: number
  parentId?: string | null
  sortOrder: number
  isLeaf: boolean
  isActive: boolean
  productCount: number
  imageUrl?: string | null
  // Attribute groups linked to this category (only populated on leaf categories).
  attributeGroups?: CategoryAttributeGroupNode[]
  children: CategoryTreeNode[]
}

export interface CategoryTreeResponse {
  tree: CategoryTreeNode[]
}

export interface UnitOfMeasure {
  id: string
  name: string
  abbreviation?: string
  businessId?: string | null
  type: UnitOfMeasureType | null
  isDefault: boolean
  isActive?: boolean
  createdAt?: IsoDateString
  updatedAt?: IsoDateString
  deletedAt?: IsoDateString | null
}

export interface ProductImage {
  id: string
  productId: string
  url: string
  altText?: string | null
  sortOrder: number
  createdAt?: IsoDateString
}

export interface Product {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  sellingPrice: number
  costPrice?: number | null
  currency: Currency | string
  taxRate: number
  isActive: boolean
  // Optional on the shared shape for backward compatibility: older API responses
  // and the desktop's local SQLite rows may not carry it yet. The API response DTO
  // always populates it.
  productType?: ProductType
  isService: boolean
  trackInventory: boolean
  // True when the product is sold as distinct variants (each its own stock/price).
  hasVariants?: boolean
  // Populated on the detail response when hasVariants is true.
  variants?: ProductVariant[]
  // Populated on the detail response for COMPOSITE products.
  bundleComponents?: ProductBundleComponent[]
  category?: ProductCategory | null
  unitOfMeasure?: UnitOfMeasure
  createdAt?: IsoDateString
  updatedAt?: IsoDateString
  businessId: string
  slug: string
  description?: string | null
  barcodeType?: string | null
  isBarcodeGenerated: boolean
  categoryId?: string | null
  imageUrl?: string | null
  createdById?: string | null
  createdBy?: ProductUserSummary | null
  images: ProductImage[]
  currentStock?: number | null
  lowStockThreshold?: number | null
  reorderPoint?: number | null
  primaryImageUrl?: string | null
}

export interface ProductsQuery extends ListQuery {
  categoryId?: string
  isActive?: boolean
  isService?: boolean
  trackInventory?: boolean
}

export interface CreateProductRequest {
  name: string
  description?: string
  sku?: string
  barcode?: string
  sellingPrice: number
  costPrice?: number
  taxRate?: number
  openingStock?: number
  lowStockThreshold?: number
  unitOfMeasureId: string
  categoryId?: string
  imageUrl?: string
  productType?: ProductType
  isService?: boolean
  trackInventory?: boolean
  isActive?: boolean
  // Variants (Phase 3C). When attributeSelections is provided with ≥1 group that
  // has ≥1 selected option, the API generates the Cartesian product as variants.
  attributeSelections?: ProductAttributeSelection[]
  variantOverrides?: VariantOverride[]
  // Component lines for a COMPOSITE product (Phase 3F).
  bundleComponents?: CreateBundleComponentRequest[]
}

export interface UpdateProductRequest extends Partial<CreateProductRequest> {}

export interface AssignBarcodeRequest {
  barcode: string
}

export interface CategoriesQuery extends ListQuery {}

export interface CreateCategoryRequest {
  name: string
  color?: string
  icon?: string
  imageUrl?: string
  sortOrder?: number
  parentId?: string | null
  isActive?: boolean
}

export interface UpdateCategoryRequest extends Partial<CreateCategoryRequest> {
  isActive?: boolean
}

export interface ProductImagesQuery extends ListQuery {}

export interface CreateProductImageRequest {
  url: string
  altText?: string
  sortOrder?: number
}

export interface UpdateProductImageRequest extends Partial<CreateProductImageRequest> {}

export interface UnitOfMeasuresQuery extends ListQuery {}

export interface CreateUnitOfMeasureRequest {
  name: string
  abbreviation: string
  type: UnitOfMeasureType | null
}

export interface UpdateUnitOfMeasureRequest extends Partial<CreateUnitOfMeasureRequest> {
  isActive?: boolean
}

export interface LowStockProduct {
  productId: string
  productName: string | null
  currentQuantity: number
  lowStockThreshold: number | null
  reorderPoint: number | null
  unitOfMeasure: string | null
  categoryName: string | null
}
