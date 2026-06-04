import { app } from 'electron'
import { join } from 'node:path'

/** Absolute path to a bundled resource (icons), working in dev and packaged builds.
 *  Icons are shipped via electron-builder `extraResources` into the resources dir. */
export function resourcePath(name: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, name)
    : join(app.getAppPath(), 'resources', name)
}
