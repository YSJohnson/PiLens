/* global process, setTimeout, clearTimeout, fetch, WebSocket, console */
import { spawn } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const executable = path.join(projectRoot, 'release', 'win-unpacked', 'PiLens.exe')
const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/'
const outputPath = path.resolve(projectRoot, process.argv[3] ?? 'docs/qa/pilens-v2-1600x950.png')
const width = Number.parseInt(process.argv[4] ?? '1600', 10)
const height = Number.parseInt(process.argv[5] ?? '950', 10)
const view = process.argv[6] ?? 'default'
const debugPort = 9444
const child = spawn(executable, [`--remote-debugging-port=${debugPort}`], {
  cwd: projectRoot,
  stdio: ['ignore', 'inherit', 'inherit'],
})

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function findPage() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      const targets = await response.json()
      const page = targets.find((target) => target.type === 'page')
      if (page?.webSocketDebuggerUrl) return page
    } catch {
      // The packaged main process is still creating its first window.
    }
    await wait(250)
  }
  throw new Error('Timed out waiting for the packaged renderer.')
}

function connect(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl)
    const pending = new Map()
    let requestId = 0

    const timeout = setTimeout(() => reject(new Error('Timed out connecting to DevTools.')), 5_000)
    socket.addEventListener('open', () => {
      clearTimeout(timeout)
      resolve({
        close: () => socket.close(),
        send(method, params = {}) {
          requestId += 1
          return new Promise((resolveRequest, rejectRequest) => {
            pending.set(requestId, { resolve: resolveRequest, reject: rejectRequest })
            socket.send(JSON.stringify({ id: requestId, method, params }))
          })
        },
      })
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id) return
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
    })
    socket.addEventListener('error', () => reject(new Error('DevTools WebSocket failed.')))
  })
}

let client
try {
  const page = await findPage()
  client = await connect(page.webSocketDebuggerUrl)
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  })
  await client.send('Page.navigate', { url: targetUrl })
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const readiness = await client.send('Runtime.evaluate', {
      expression: "Boolean(document.querySelector('.app-shell')) && !document.querySelector('.splash-screen')",
      returnByValue: true,
    })
    if (readiness.result?.value === true) break
    if (attempt === 39) throw new Error('Timed out waiting for the main application shell.')
    await wait(250)
  }
  await client.send('Runtime.evaluate', {
    expression: 'document.fonts.ready',
    awaitPromise: true,
  })
  if (view === 'model-picker') {
    await client.send('Runtime.evaluate', {
      expression: "document.querySelector('.model-trigger')?.click()",
    })
  }
  await wait(350)

  const capture = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  })
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, Buffer.from(capture.data, 'base64'))
  console.log(JSON.stringify({ outputPath, width, height, view }))
} finally {
  client?.close()
  if (!child.killed) child.kill()
}
