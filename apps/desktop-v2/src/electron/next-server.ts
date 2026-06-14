import { createServer, type Server } from 'http'
import next from 'next'

export interface NextServerHandle {
  url: string
  close: () => Promise<void>
}

/**
 * Boots the Next.js server IN-PROCESS inside Electron main (production). Running in
 * the same process as Electron means the BFF shares safeStorage + the SQLite
 * connection directly — tokens never cross a process boundary.
 *
 * `dir` must contain the `.next` production build. `dbPath` is exported as
 * DESKTOP_DB_PATH so the BFF DataSource opens the right local database.
 *
 * Dev mode does NOT use this — `next dev` runs as a separate process and main loads
 * DESKTOP_RENDERER_URL (HMR preserved).
 */
export async function startNextServer(dir: string, dbPath: string): Promise<NextServerHandle> {
  process.env.DESKTOP_DB_PATH = dbPath

  const app = next({ dev: false, dir })
  await app.prepare()
  const handle = app.getRequestHandler()

  return await new Promise<NextServerHandle>((resolve, reject) => {
    const server: Server = createServer((req, res) => {
      handle(req, res).catch((error) => {
        // eslint-disable-next-line no-console
        console.error('[next-server] request failed', error)
        res.statusCode = 500
        res.end('Internal Server Error')
      })
    })

    const onError = (error: Error) => {
      server.off('error', onError)
      reject(error)
    }
    server.on('error', onError)

    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Next server failed to bind to a local port.'))
        return
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((error) => (error ? rejectClose(error) : resolveClose()))
          }),
      })
    })
  })
}
