/**
 * Renders the demo film to public/media/cadence-demo.mp4 (+ poster).
 *
 * The film is a deterministic React composition (src/film/Film.tsx) driven by a
 * single time value, so this script steps through time, screenshots each frame
 * and encodes them. The encode is intra-heavy (a keyframe every few frames) so
 * the site can scrub it smoothly with the scroll wheel.
 *
 * Usage (not part of the normal build; install the two tools first, without saving them):
 *   npm i --no-save puppeteer-core ffmpeg-static
 *   npm run dev                      # in another terminal
 *   npm run film                     # BASE=http://localhost:5173 if your port differs
 *
 * Env:
 *   BASE         dev server URL (default http://localhost:5173)
 *   CHROME_PATH  Chrome or Edge executable
 *   FPS          frames per second (24)
 *   OUT          output folder (public/media)
 *   FRAMES       folder for the rendered frames. Frames already in it are kept, so
 *                an interrupted render resumes, and a finished one is only
 *                re-encoded (the quick way to try other sizes or quality).
 *                Delete the folder to render from scratch.
 *   SCALE        output size, e.g. 1600:900 (default) or 1280:720
 *   CRF          x264 quality, lower is better (default 22)
 *   GOP          keyframe interval in frames (default 3)
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import ffmpegPath from 'ffmpeg-static'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const FPS = Number(process.env.FPS ?? 24)
const OUT = process.env.OUT ?? 'public/media'
const SCALE = process.env.SCALE ?? '1600:900'
const CRF = process.env.CRF ?? '22'
const GOP = process.env.GOP ?? '3'
const DURATION = 76.5
const total = Math.round(DURATION * FPS)

const frames = process.env.FRAMES ?? fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-film-'))
const keep = Boolean(process.env.FRAMES)
const frameName = (i) => path.join(frames, `${String(i).padStart(5, '0')}.jpg`)
fs.mkdirSync(frames, { recursive: true })
fs.mkdirSync(OUT, { recursive: true })

const haveFrames = fs.existsSync(frameName(total - 1))

if (!haveFrames) {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  const executablePath = candidates.find((p) => fs.existsSync(p))
  if (!executablePath) throw new Error('No Chrome/Edge found. Set CHROME_PATH.')

  const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
  await page.goto(`${BASE}/__film?t=0`, { waitUntil: 'networkidle2' })
  await page.waitForFunction('typeof window.__setT === "function"')
  await page.evaluate(() => document.fonts.ready)
  await new Promise((r) => setTimeout(r, 600))

  console.log(`Rendering ${total} frames to ${frames}`)
  for (let i = 0; i < total; i++) {
    // Resume: frames are deterministic, so ones already on disk (from an interrupted run) are kept.
    if (keep && fs.existsSync(frameName(i)) && i < total - 1) continue
    await page.evaluate(
      (t) =>
        new Promise((resolve) => {
          window.__setT(t)
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        }),
      i / FPS,
    )
    await page.screenshot({ path: frameName(i), type: 'jpeg', quality: 92 })
    if (i % 120 === 0) console.log(`  ${i}/${total}`)
  }
  await browser.close()
} else {
  console.log(`Found ${total} frames in ${frames}, skipping the render`)
}

const mp4 = path.join(OUT, 'cadence-demo.mp4')
const enc = spawnSync(
  ffmpegPath,
  [
    '-y', '-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg'),
    '-vf', `scale=${SCALE}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF,
    '-g', GOP, '-keyint_min', GOP, '-sc_threshold', '0',
    '-movflags', '+faststart', '-an', mp4,
  ],
  { stdio: 'inherit' },
)
if (enc.status !== 0) throw new Error('ffmpeg failed')

// The poster is the title card, held at 2.6 s.
const poster = spawnSync(
  ffmpegPath,
  ['-y', '-i', frameName(Math.round(2.6 * FPS)), '-vf', `scale=${SCALE}:flags=lanczos`, '-frames:v', '1', '-update', '1', '-q:v', '3', path.join(OUT, 'cadence-poster.jpg')],
  { stdio: 'inherit' },
)
if (poster.status !== 0) throw new Error('poster failed')

if (!keep) fs.rmSync(frames, { recursive: true, force: true })
console.log('Done:', mp4, `(${(fs.statSync(mp4).size / 1048576).toFixed(1)} MB)`)
