/* global process, setTimeout, clearTimeout, fetch, WebSocket, console */
import { spawn } from 'node:child_process'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const outputDirectory = process.argv[2] ?? 'release'
const executable = path.join(projectRoot, outputDirectory, 'win-unpacked', 'PiLens.exe')
const debugPort = 9333
const child = spawn(executable, [`--remote-debugging-port=${debugPort}`, '--enable-logging=stderr'], {
  cwd: projectRoot,
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
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
  await client.send('Runtime.enable')
  await wait(1_000)
  const evaluation = await client.send('Runtime.evaluate', {
    expression: `(async () => {
      const bridgePresent = typeof window.piDesktop?.bootstrap === 'function'
      const bootstrap = bridgePresent ? await window.piDesktop.bootstrap() : null
      const resourceApiPresent = [
        'getResources',
        'reloadResources',
        'setResourceEnabled',
        'installResourcePackage',
        'removeResourcePackage',
        'updateResourcePackage',
        'createResourceTemplate',
      ].every((name) => typeof window.piDesktop?.[name] === 'function')
      const authApiPresent = ['loginProvider', 'answerAuthPrompt', 'cancelProviderLogin', 'disconnectProvider']
        .every((name) => typeof window.piDesktop?.[name] === 'function')
      const resources = resourceApiPresent ? await window.piDesktop.getResources() : null
      const changes = bootstrap?.snapshot?.changes ?? []
      const assistantMessages = (bootstrap?.snapshot?.messages ?? []).filter((message) => message.role === 'assistant')
      return {
        title: document.title,
        readyState: document.readyState,
        bridgePresent,
        resourceApiPresent,
        authApiPresent,
        demoMode: bootstrap?.demoMode,
        platform: bootstrap?.platform,
        providerCount: bootstrap?.providers?.length ?? 0,
        modelCount: bootstrap?.models?.length ?? 0,
        skillCount: resources?.skills?.length ?? -1,
        pluginCount: resources?.plugins?.length ?? -1,
        packageCount: resources?.packages?.length ?? -1,
        resourceIssueCount: resources?.issues?.length ?? -1,
        changeCount: changes.length,
        binaryChangeCount: changes.filter((change) => change.binary).length,
        escapedChangePathCount: changes.filter((change) => /\\\\[0-7]{3}/u.test(change.path)).length,
        invalidZeroLineTextCount: changes.filter((change) => !change.binary && !change.large && (change.size ?? 0) > 0 && !change.additions && !change.deletions).length,
        changeSample: changes.slice(0, 6).map(({ path, additions, deletions, binary, large }) => ({ path, additions, deletions, binary: Boolean(binary), large: Boolean(large) })),
        assistantMetadataSample: assistantMessages.slice(-3).map(({ provider, model, thinkingLevel, durationMs }) => ({
          provider,
          model,
          thinkingLevel,
          durationMs,
        })),
        duplicateChangeSummaryPresent: Boolean(document.querySelector('.timeline-change-summary')),
        welcomeVisible: Boolean(document.querySelector('.welcome-screen')),
        splashVisible: Boolean(document.querySelector('.splash-screen')),
        bodyText: document.body.innerText.slice(0, 240),
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  })

  if (evaluation.exceptionDetails) {
    throw new Error(evaluation.exceptionDetails.text || 'Renderer evaluation failed.')
  }

  const result = evaluation.result?.value
  if (
    result?.title !== 'PiLens'
    || result?.readyState !== 'complete'
    || result?.bridgePresent !== true
    || result?.resourceApiPresent !== true
    || result?.authApiPresent !== true
    || result?.demoMode !== false
    || result?.platform !== 'win32'
    || result?.providerCount < 1
    || result?.modelCount < 1
    || result?.skillCount < 0
    || result?.pluginCount < 0
    || result?.packageCount < 0
    || result?.resourceIssueCount < 0
    || result?.escapedChangePathCount !== 0
    || result?.invalidZeroLineTextCount !== 0
    || result?.duplicateChangeSummaryPresent !== false
  ) {
    throw new Error(`Unexpected packaged runtime state: ${JSON.stringify(result)}`)
  }

  console.log(JSON.stringify(result, null, 2))
  await client.send('Runtime.evaluate', { expression: 'setTimeout(() => window.piDesktop.closeWindow(), 100); true' })
  await wait(600)
} finally {
  client?.close()
  if (!child.killed) child.kill()
}
