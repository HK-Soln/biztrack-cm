import type { SkeletonCheckDTO, SkeletonHealthDTO } from '@shared/ipc'

// The renderer's single data dependency. Today it resolves to the Electron IPC
// bridge (offline-first, local SQLite via main). A future cloud build swaps in an
// HTTP adapter that calls apps/api — same interface, so components never change.
export interface DataClient {
  skeleton: {
    getCheck: () => Promise<SkeletonCheckDTO | null>
    getHealth: () => Promise<SkeletonHealthDTO>
  }
}

function electronAdapter(): DataClient {
  return {
    skeleton: {
      getCheck: () => window.api.skeleton.getCheck(),
      getHealth: () => window.api.skeleton.getHealth(),
    },
  }
}

// cloudAdapter() (HTTP -> apps/api) arrives with the cloud build.

export const dataClient: DataClient = electronAdapter()
