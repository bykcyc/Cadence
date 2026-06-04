// Dependency-free PNG icon generator (tray states + app icon).
// Run with: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const resources = join(here, '..', 'resources')
mkdirSync(resources, { recursive: true })

function crc32(buf) {
  let c = ~0 >>> 0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (~c) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

function blank(size) {
  return Buffer.alloc(size * size * 4)
}

function px(rgba, size, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= size || y >= size || a <= 0) return
  const i = (y * size + x) * 4
  const sa = a / 255
  const da = rgba[i + 3] / 255
  const oa = sa + da * (1 - sa)
  if (oa <= 0) return
  rgba[i] = Math.round((r * sa + rgba[i] * da * (1 - sa)) / oa)
  rgba[i + 1] = Math.round((g * sa + rgba[i + 1] * da * (1 - sa)) / oa)
  rgba[i + 2] = Math.round((b * sa + rgba[i + 2] * da * (1 - sa)) / oa)
  rgba[i + 3] = Math.round(oa * 255)
}

// Filled, anti-aliased disc
function disc(rgba, size, cx, cy, radius, color) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      const cov = Math.max(0, Math.min(1, radius - d + 0.5))
      if (cov > 0) px(rgba, size, x, y, [color[0], color[1], color[2], Math.round(color[3] * cov)])
    }
  }
}

// Rounded-rectangle fill (anti-aliased) for the app icon background
function roundedRect(rgba, size, x0, y0, x1, y1, r, color) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px0 = x + 0.5
      const py0 = y + 0.5
      const dx = Math.max(x0 + r - px0, 0, px0 - (x1 - r))
      const dy = Math.max(y0 + r - py0, 0, py0 - (y1 - r))
      const dist = Math.hypot(dx, dy)
      const cov = Math.max(0, Math.min(1, r - dist + 0.5))
      const inside = px0 >= x0 && px0 <= x1 && py0 >= y0 && py0 <= y1
      if (inside && cov > 0) px(rgba, size, x, y, [color[0], color[1], color[2], Math.round(color[3] * cov)])
    }
  }
}

// Simple microphone glyph (capsule + stand) centered in `size`
function microphone(rgba, size, color) {
  const cx = size / 2
  const bodyW = size * 0.26
  const bodyTop = size * 0.2
  const bodyBottom = size * 0.56
  const rcap = bodyW / 2
  // capsule body
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pxc = x + 0.5
      const pyc = y + 0.5
      let cov = 0
      if (pyc >= bodyTop + rcap && pyc <= bodyBottom - rcap) {
        cov = Math.max(0, Math.min(1, rcap - Math.abs(pxc - cx) + 0.5))
      } else {
        const ccy = pyc < bodyTop + rcap ? bodyTop + rcap : bodyBottom - rcap
        const d = Math.hypot(pxc - cx, pyc - ccy)
        cov = Math.max(0, Math.min(1, rcap - d + 0.5))
      }
      if (cov > 0) px(rgba, size, x, y, [color[0], color[1], color[2], Math.round(color[3] * cov)])
    }
  }
  // arc/stand (a U shape) – approximate with a thick partial ring
  const arcR = size * 0.2
  const arcCy = bodyBottom - rcap
  const thick = size * 0.045
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pxc = x + 0.5
      const pyc = y + 0.5
      if (pyc < arcCy) continue
      const d = Math.hypot(pxc - cx, pyc - arcCy)
      const cov = Math.max(0, Math.min(1, thick - Math.abs(d - arcR) + 0.5))
      if (cov > 0) px(rgba, size, x, y, [color[0], color[1], color[2], Math.round(color[3] * cov)])
    }
  }
  // base stem + foot
  const stemTop = arcCy + arcR
  const footY = size * 0.82
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pxc = x + 0.5
      const pyc = y + 0.5
      // stem
      let cov = 0
      if (pyc >= stemTop && pyc <= footY) cov = Math.max(0, Math.min(1, thick - Math.abs(pxc - cx) + 0.5))
      // foot
      if (Math.abs(pyc - footY) <= thick) cov = Math.max(cov, Math.max(0, Math.min(1, size * 0.13 - Math.abs(pxc - cx) + 0.5)))
      if (cov > 0) px(rgba, size, x, y, [color[0], color[1], color[2], Math.round(color[3] * cov)])
    }
  }
}

function writePng(name, size, build) {
  const rgba = blank(size)
  build(rgba, size)
  writeFileSync(join(resources, name), encodePng(size, size, rgba))
  console.log('wrote', name, `${size}x${size}`)
}

const GREY = [120, 124, 132, 255]
const RED = [233, 65, 65, 255]
const WHITE = [255, 255, 255, 255]
const ACCENT = [88, 101, 242, 255]

// Tray icons (32px; Windows scales to 16). Microphone glyph for clear meaning.
writePng('tray-idle.png', 32, (rgba, s) => microphone(rgba, s, GREY))
writePng('tray-recording.png', 32, (rgba, s) => microphone(rgba, s, RED))

// App icon 256: rounded accent square + white mic + small red dot
writePng('icon.png', 256, (rgba, s) => {
  roundedRect(rgba, s, s * 0.08, s * 0.08, s * 0.92, s * 0.92, s * 0.22, ACCENT)
  microphone(rgba, s, WHITE)
  disc(rgba, s, s * 0.72, s * 0.28, s * 0.07, RED)
})

console.log('icons generated in', resources)
