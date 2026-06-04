import { app, session } from 'electron'

/** Apply a Content-Security-Policy in packaged builds. Skipped in dev so Vite's
 *  HMR client keeps working. blob: is allowed for the AudioWorklet module. */
export function applyContentSecurityPolicy(): void {
  if (!app.isPackaged) return
  const csp = [
    "default-src 'self'",
    "img-src 'self' data: blob: tmedia:",
    "media-src 'self' blob: tmedia:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' blob:",
    "worker-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self' tmedia:"
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })
}
