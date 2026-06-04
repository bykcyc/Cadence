import { protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
import { join, normalize, sep } from 'node:path'
import { getRecordsDir } from './settings'

export const MEDIA_SCHEME = 'tmedia'

/** Must run before app is ready. */
export function registerMediaSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { secure: true, supportFetchAPI: true, stream: true } }
  ])
}

/** Serves recorded audio to the renderer as tmedia://m/<meetingId>/<file>. */
export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const parts = decodeURIComponent(url.pathname).split('/').filter(Boolean)
      const [meetingId, ...rest] = parts
      const file = rest.join('/')
      if (!meetingId || !file) return new Response('Bad request', { status: 400 })

      const base = normalize(getRecordsDir())
      const target = normalize(join(base, meetingId, file))
      // Prevent path traversal outside the records directory.
      if (target !== base && !target.startsWith(base + sep)) {
        return new Response('Forbidden', { status: 403 })
      }
      return net.fetch(pathToFileURL(target).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
