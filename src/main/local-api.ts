import { createServer, type IncomingMessage, type Server } from 'node:http'
import { IPC } from '@shared/ipc'
import { listMeetings, getMeeting, setProcessed } from './meetings'
import { getSettings } from './settings'
import { broadcast } from './broadcast'

let server: Server | null = null

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => {
      try {
        resolve(data ? (JSON.parse(data) as Record<string, unknown>) : {})
      } catch {
        resolve({})
      }
    })
  })
}

/**
 * Local HTTP API (127.0.0.1) for external task-bots — see API.md.
 *   GET  /health
 *   GET  /meetings[?processed=true|false]
 *   GET  /meetings/:id
 *   POST /meetings/:id/processed   body: { processed?: boolean, by?: string }
 */
export function startLocalApi(): void {
  const settings = getSettings()
  if (!settings.localApiEnabled) return
  stopLocalApi()

  server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    const send = (status: number, body: unknown): void => {
      res.writeHead(status)
      res.end(JSON.stringify(body))
    }

    void (async () => {
      try {
        if (req.method === 'OPTIONS') {
          res.writeHead(204)
          res.end()
          return
        }
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')

        if (url.pathname === '/health') return send(200, { status: 'ok' })

        if (url.pathname === '/meetings' && req.method === 'GET') {
          const p = url.searchParams.get('processed')
          let meetings = await listMeetings()
          if (p === 'true') meetings = meetings.filter((m) => m.processed)
          else if (p === 'false') meetings = meetings.filter((m) => !m.processed)
          return send(200, meetings)
        }

        const getMatch = url.pathname.match(/^\/meetings\/([^/]+)$/)
        if (getMatch && req.method === 'GET') {
          const m = await getMeeting(decodeURIComponent(getMatch[1]))
          return m ? send(200, m) : send(404, { error: 'not found' })
        }

        const procMatch = url.pathname.match(/^\/meetings\/([^/]+)\/processed$/)
        if (procMatch && req.method === 'POST') {
          const body = await readJsonBody(req)
          const processed = body.processed !== false
          const by = typeof body.by === 'string' ? body.by : 'external'
          const m = await setProcessed(decodeURIComponent(procMatch[1]), processed, by)
          if (!m) return send(404, { error: 'not found' })
          broadcast(IPC.meetingsChangedEvent)
          return send(200, m)
        }

        send(404, { error: 'not found' })
      } catch (e) {
        send(500, { error: e instanceof Error ? e.message : String(e) })
      }
    })()
  })

  server.on('error', (err) => console.error('[local-api]', err.message))
  server.listen(settings.localApiPort, '127.0.0.1', () => {
    console.log('[local-api] listening on 127.0.0.1:' + settings.localApiPort)
  })
}

export function stopLocalApi(): void {
  if (server) {
    server.close()
    server = null
  }
}

export function restartLocalApi(): void {
  stopLocalApi()
  startLocalApi()
}
