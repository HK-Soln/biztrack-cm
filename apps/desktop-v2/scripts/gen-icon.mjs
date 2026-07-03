// Generates the BizTrack CM app icon (assets/icon.png) from the brand mark:
// an Ink Blue rounded-tile with a bold white "B" and a green status pip — the same
// mark as the sidebar logo / favicon.svg. Pure Node (zlib), no native deps, so it
// runs anywhere. electron-builder derives the platform .ico/.icns from this PNG.
// (assets/ is committed; build/ is gitignored, so the source icon lives here.)
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = 1024 // final icon size
const SS = 2 // supersample factor (anti-aliasing)
const R = OUT * SS

// Brand colours (default "Ink Blue" palette).
const TOP = [30, 93, 168] // --brand-int #1E5DA8
const BOT = [20, 63, 110] // --brand-nav  #143F6E
const WHITE = [255, 255, 255]
const PIP = [47, 125, 79] // --success   #2F7D4F

const m = 0.055 * R // tile margin
const x0 = m
const y0 = m
const x1 = R - m
const y1 = R - m
const tileR = 0.2 * (x1 - x0)

// Inside test for a rounded rect with per-corner radii.
function insideRR(px, py, ax, ay, bx, by, rTL, rTR, rBR, rBL) {
  if (px < ax || px > bx || py < ay || py > by) return false
  if (px < ax + rTL && py < ay + rTL) { const dx = ax + rTL - px, dy = ay + rTL - py; return dx * dx + dy * dy <= rTL * rTL }
  if (px > bx - rTR && py < ay + rTR) { const dx = px - (bx - rTR), dy = ay + rTR - py; return dx * dx + dy * dy <= rTR * rTR }
  if (px > bx - rBR && py > by - rBR) { const dx = px - (bx - rBR), dy = py - (by - rBR); return dx * dx + dy * dy <= rBR * rBR }
  if (px < ax + rBL && py > by - rBL) { const dx = ax + rBL - px, dy = py - (by - rBL); return dx * dx + dy * dy <= rBL * rBL }
  return true
}

// Bold "B" built from a stem + two D-lobes (outer minus inner counter).
const SL = 0.335 * R, SR = 0.455 * R, T = 0.275 * R, B = 0.725 * R, M = 0.5 * R
const th = 0.105 * R
const XU = 0.63 * R, XLo = 0.66 * R
const sc = 0.02 * R // small stem corner
function inB(px, py) {
  if (insideRR(px, py, SL, T, SR, B, sc, 0, 0, sc)) return true
  // upper lobe
  const upH = (M - T) / 2
  if (insideRR(px, py, SL, T, XU, M, 0, upH, upH, 0)) {
    const hr = ((M - th * 0.5) - (T + th)) / 2
    if (!insideRR(px, py, SR, T + th, XU - th, M - th * 0.5, 0, hr, hr, 0)) return true
  }
  // lower lobe
  const loH = (B - M) / 2
  if (insideRR(px, py, SL, M, XLo, B, 0, loH, loH, 0)) {
    const hr = ((B - th) - (M + th * 0.5)) / 2
    if (!insideRR(px, py, SR, M + th * 0.5, XLo - th, B - th, 0, hr, hr, 0)) return true
  }
  return false
}

// Status pip (bottom-right), with a faint darker ring.
const PCX = 0.775 * R, PCY = 0.775 * R, PR = 0.1 * R, PRING = PR + 0.014 * R
function pip(px, py) {
  const dx = px - PCX, dy = py - PCY
  const d2 = dx * dx + dy * dy
  if (d2 <= PR * PR) return 'fill'
  if (d2 <= PRING * PRING) return 'ring'
  return null
}

function sample(px, py) {
  if (!insideRR(px, py, x0, y0, x1, y1, tileR, tileR, tileR, tileR)) return [0, 0, 0, 0]
  // base gradient
  const t = Math.min(1, Math.max(0, (py - y0) / (y1 - y0)))
  let r = TOP[0] + (BOT[0] - TOP[0]) * t
  let g = TOP[1] + (BOT[1] - TOP[1]) * t
  let b = TOP[2] + (BOT[2] - TOP[2]) * t
  if (inB(px, py)) return [WHITE[0], WHITE[1], WHITE[2], 255]
  const p = pip(px, py)
  if (p === 'fill') return [PIP[0], PIP[1], PIP[2], 255]
  if (p === 'ring') { r = BOT[0]; g = BOT[1]; b = BOT[2] }
  return [r, g, b, 255]
}

// Render at RxR, then box-downsample to OUT.
const out = Buffer.alloc(OUT * OUT * 4)
for (let oy = 0; oy < OUT; oy++) {
  for (let ox = 0; ox < OUT; ox++) {
    let ar = 0, ag = 0, ab = 0, aa = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const [r, g, b, a] = sample(ox * SS + sx + 0.5, oy * SS + sy + 0.5)
        // premultiply for correct edge blending
        ar += r * a; ag += g * a; ab += b * a; aa += a
      }
    }
    const n = SS * SS
    const alpha = aa / n
    const i = (oy * OUT + ox) * 4
    if (alpha <= 0) { out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0; continue }
    out[i] = Math.round(ar / aa)
    out[i + 1] = Math.round(ag / aa)
    out[i + 2] = Math.round(ab / aa)
    out[i + 3] = Math.round(alpha)
  }
}

// --- minimal PNG encoder (RGBA, 8-bit) ---
const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const body = Buffer.concat([t, data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(OUT, 0); ihdr.writeUInt32BE(OUT, 4)
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0 // 8-bit RGBA
// raw scanlines with filter byte 0
const raw = Buffer.alloc(OUT * (OUT * 4 + 1))
for (let y = 0; y < OUT; y++) {
  raw[y * (OUT * 4 + 1)] = 0
  out.copy(raw, y * (OUT * 4 + 1) + 1, y * OUT * 4, (y + 1) * OUT * 4)
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'icon.png'), png)
console.log(`wrote assets/icon.png (${OUT}x${OUT}, ${png.length} bytes)`)
