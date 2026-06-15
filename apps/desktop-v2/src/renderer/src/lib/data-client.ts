import type { CategoryInput, LocalCategory, SkeletonCheckDTO, SkeletonHealthDTO } from '@shared/ipc'

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
  }
}

export const dataClient: DataClient = isElectron ? electronAdapter() : cloudAdapter()
