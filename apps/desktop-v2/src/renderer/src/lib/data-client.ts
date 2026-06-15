import type {
  AttributeGroupInput,
  AttributeOptionInput,
  CategoryAttributeLinkInput,
  CategoryInput,
  LocalAttributeGroup,
  LocalAttributeOption,
  LocalCategory,
  LocalCategoryAttributeGroup,
  LocalUnit,
  SkeletonCheckDTO,
  SkeletonHealthDTO,
  UnitInput,
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
    list: () => Promise<LocalCategory[]>
    create: (input: CategoryInput) => Promise<LocalCategory>
    update: (id: string, input: CategoryInput) => Promise<LocalCategory>
    remove: (id: string) => Promise<void>
  }
  attributes: {
    listGroups: () => Promise<LocalAttributeGroup[]>
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
    list: () => Promise<LocalUnit[]>
    create: (input: UnitInput) => Promise<LocalUnit>
    update: (id: string, input: UnitInput) => Promise<LocalUnit>
    remove: (id: string) => Promise<void>
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
      list: () => window.api.categories.list(),
      create: (input) => window.api.categories.create(input),
      update: (id, input) => window.api.categories.update(id, input),
      remove: (id) => window.api.categories.remove(id),
    },
    attributes: {
      listGroups: () => window.api.attributes.listGroups(),
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
      list: () => window.api.units.list(),
      create: (input) => window.api.units.create(input),
      update: (id, input) => window.api.units.update(id, input),
      remove: (id) => window.api.units.remove(id),
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
    categories: { list: notWired, create: notWired, update: notWired, remove: notWired },
    attributes: {
      listGroups: notWired,
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
    uploads: { file: notWired },
  }
}

export const dataClient: DataClient = isElectron ? electronAdapter() : cloudAdapter()
