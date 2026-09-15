/* global process, fetch, WebSocket, setTimeout, clearTimeout, console */
import { spawn } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/'
const outputDirectory = path.resolve(process.argv[3] ?? path.join(os.tmpdir(), 'pi-desktop-renderer-qa'))
const debugPort = 9555
const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next standard installation path.
    }
  }
  throw new Error('Microsoft Edge was not found in a standard installation path.')
}

async function findPage() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      const targets = await response.json()
      const page = targets.find((target) => target.type === 'page' && target.url.startsWith(targetUrl))
        ?? targets.find((target) => target.type === 'page')
      if (page?.webSocketDebuggerUrl) return page
    } catch {
      // Edge is still creating its first renderer.
    }
    await wait(250)
  }
  throw new Error('Timed out waiting for the Edge renderer.')
}

function connect(webSocketUrl, onEvent) {
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
      if (!message.id) {
        onEvent(message)
        return
      }
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
    })
    socket.addEventListener('error', () => reject(new Error('DevTools WebSocket failed.')))
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

let browser
let client
let userDataDirectory
const consoleIssues = []
const screenshots = []

try {
  const edge = await firstExistingPath(edgeCandidates)
  userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'pi-desktop-edge-qa-'))
  await mkdir(outputDirectory, { recursive: true })
  browser = spawn(edge, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDirectory}`,
    '--disable-extensions',
    '--disable-gpu',
    '--allow-file-access-from-files',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1627,967',
    targetUrl,
  ], { stdio: 'ignore' })

  const handleProtocolEvent = (message) => {
    if (message.method === 'Runtime.exceptionThrown') {
      consoleIssues.push(`exception: ${message.params?.exceptionDetails?.text ?? 'Unknown runtime exception'}`)
    }
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params?.type)) {
      const values = message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ')
      consoleIssues.push(`${message.params.type}: ${values}`)
    }
    if (message.method === 'Log.entryAdded' && ['error', 'warning'].includes(message.params?.entry?.level)) {
      consoleIssues.push(`${message.params.entry.level}: ${message.params.entry.text}${message.params.entry.url ? ` (${message.params.entry.url})` : ''}`)
    }
  }
  let connectionError
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const page = await findPage()
      client = await connect(page.webSocketDebuggerUrl, handleProtocolEvent)
      connectionError = undefined
      break
    } catch (error) {
      connectionError = error
      await wait(250)
    }
  }
  if (!client) throw connectionError ?? new Error('Unable to connect to the Edge renderer.')

  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Log.enable')
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1627,
    height: 967,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 1627,
    screenHeight: 967,
  })

  const evaluate = async (expression) => {
    const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result?.value
  }

  const clickSelector = async (selector) => {
    const point = await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)})
      if (!node) return null
      const rect = node.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })()`)
    assert(point, `Unable to click missing selector: ${selector}`)
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  }

  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await evaluate(expression)) return
      await wait(100)
    }
    const debugState = await evaluate(`({
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      bodyText: document.body?.innerText?.slice(0, 500),
      bodyHtml: document.body?.innerHTML?.slice(0, 500),
    })`)
    throw new Error(`Timed out waiting for ${label}. State: ${JSON.stringify(debugState)} Issues: ${consoleIssues.join(' | ')}`)
  }

  const capture = async (name) => {
    await wait(200)
    const image = await client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    })
    const outputPath = path.join(outputDirectory, name)
    await writeFile(outputPath, Buffer.from(image.data, 'base64'))
    screenshots.push(outputPath)
  }

  await waitFor("Boolean(document.querySelector('.app-shell')) && !document.querySelector('.splash-screen')", 'the application shell')
  await waitFor("Boolean(document.querySelector('.message-content-shell .markdown-content'))", 'the lazy-loaded conversation renderer')
  await evaluate('document.fonts.ready')
  const identity = await evaluate(`({
    url: location.href,
    title: document.title,
    bodyText: document.body.innerText.slice(0, 300),
    frameworkOverlay: Boolean(document.querySelector('vite-error-overlay, #webpack-dev-server-client-overlay')),
    compaction: document.querySelector('.compaction-status')?.textContent?.trim(),
    bodyFontSize: getComputedStyle(document.body).fontSize,
    messageFontSize: getComputedStyle(document.querySelector('.message-content-shell .markdown-content')).fontSize,
  })`)
  assert(identity.title === 'PiLens', `Unexpected page title: ${identity.title}`)
  assert(identity.url.startsWith(targetUrl), `Unexpected page URL: ${identity.url}`)
  assert(identity.bodyText.includes('PiLens') && identity.bodyText.length > 80, 'The first meaningful screen is blank.')
  assert(!identity.frameworkOverlay, 'A framework error overlay is visible.')
  assert(identity.compaction?.includes('已压缩 1 次'), 'Compaction history is not visible in the inspector.')
  assert(Number.parseFloat(identity.messageFontSize) >= 16, `Conversation text is too small: ${identity.messageFontSize}`)
  const responseFooter = await evaluate(`(() => {
    const footer = [...document.querySelectorAll('.message-footer')].at(-1)
    if (!footer) return null
    const footerRect = footer.getBoundingClientRect()
    const timelineRect = document.querySelector('.timeline-scroll')?.getBoundingClientRect()
    const items = [...footer.querySelectorAll(':scope > .message-meta-item')]
    const iconCenterDeltas = items.flatMap((item) => {
      const itemRect = item.getBoundingClientRect()
      const itemCenter = itemRect.top + itemRect.height / 2
      return [...item.querySelectorAll('svg, img')].map((icon) => {
        const iconRect = icon.getBoundingClientRect()
        return Math.abs((iconRect.top + iconRect.height / 2) - itemCenter)
      })
    })
    const action = footer.querySelector('.message-action')
    const actionRect = action?.getBoundingClientRect()
    return {
      labels: items.map((item) => item.textContent.trim()),
      maxIconCenterDelta: iconCenterDeltas.length ? Math.max(...iconCenterDeltas) : 999,
      actionCenterDelta: actionRect ? Math.abs((actionRect.top + actionRect.height / 2) - (footerRect.top + footerRect.height / 2)) : 999,
      providerLogoLoaded: Boolean(footer.querySelector('.message-provider-logo img')?.complete),
      duplicateChangeSummary: Boolean(document.querySelector('.timeline-change-summary')),
      visibleAboveComposer: Boolean(timelineRect && footerRect.bottom <= timelineRect.bottom + 1),
      fontSize: getComputedStyle(footer).fontSize,
    }
  })()`)
  assert(responseFooter && !responseFooter.duplicateChangeSummary, 'The duplicate change summary is still rendered above the composer.')
  assert(responseFooter.visibleAboveComposer, `The assistant footer is hidden behind the composer: ${JSON.stringify(responseFooter)}`)
  assert(
    ['Claude Sonnet 4.5', 'high', 'build', '45.1s'].every((label) => responseFooter.labels.includes(label)),
    `Assistant response metadata is incomplete: ${JSON.stringify(responseFooter)}`,
  )
  assert(responseFooter.providerLogoLoaded, 'The assistant response provider logo did not load.')
  assert(responseFooter.maxIconCenterDelta <= 1 && responseFooter.actionCenterDelta <= 1, `Assistant footer icons are misaligned: ${JSON.stringify(responseFooter)}`)
  assert(Number.parseFloat(responseFooter.fontSize) >= 13, `Assistant footer text is too small: ${responseFooter.fontSize}`)
  await capture('desktop-main-1627x967.png')

  await evaluate("document.querySelector('.model-trigger').click()")
  await waitFor("Boolean(document.querySelector('.model-picker-popover'))", 'the model picker')
  const modelPicker = await evaluate(`(() => {
    const popover = document.querySelector('.model-picker-popover')
    const rect = popover.getBoundingClientRect()
    return {
      providerGroups: [...popover.querySelectorAll('.model-group:not(.recent-models) .model-group-heading strong')].map((node) => node.textContent.trim()),
      models: [...popover.querySelectorAll('.model-option-main')].map((node) => node.textContent.trim()),
      logoCount: popover.querySelectorAll('.provider-logo img').length,
      fallbackIconCount: popover.querySelectorAll('.provider-logo > svg').length,
      withinViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
    }
  })()`)
  assert(modelPicker.providerGroups.length === 1 && modelPicker.providerGroups[0] === 'Anthropic', `Model picker exposed disconnected providers: ${modelPicker.providerGroups.join(', ')}`)
  assert(modelPicker.models.length >= 3, 'The connected provider models were not rendered.')
  assert(modelPicker.logoCount > 0 && modelPicker.fallbackIconCount === 0, 'Provider logos fell back to placeholder glyphs.')
  assert(modelPicker.withinViewport, 'The desktop model picker extends beyond the viewport.')
  await capture('desktop-model-picker-1627x967.png')
  await evaluate("document.querySelector('.model-trigger').click()")

  await evaluate("document.querySelector('.activity-button[aria-label=\"Git 变更\"]').click()")
  await waitFor("Boolean(document.querySelector('.changes-panel'))", 'the Git changes panel')
  const changeState = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.change-row')]
    const source = rows.find((row) => row.querySelector('strong')?.textContent === '260.py')
    const binary = rows.find((row) => row.querySelector('strong')?.textContent === 'base.apk')
    return {
      overview: document.querySelector('.change-overview-card')?.innerText,
      sourceText: source?.innerText,
      sourceMeta: source?.querySelector('.change-file-copy small')?.textContent,
      binaryText: binary?.innerText,
      binaryBadge: binary?.querySelector('.change-kind-badge.binary')?.textContent,
      escapedPathVisible: document.querySelector('.changes-panel')?.innerText.includes('\\350\\212'),
    }
  })()`)
  assert(changeState.overview.includes('+185') && changeState.overview.includes('−33') && changeState.overview.includes('1 BIN'), `Change totals are incorrect: ${JSON.stringify(changeState)}`)
  assert(changeState.sourceText.includes('+3') && changeState.sourceMeta.includes('花生日记') && !changeState.escapedPathVisible, `The UTF-8 source path or line count is incorrect: ${JSON.stringify(changeState)}`)
  assert(changeState.binaryBadge === 'BIN' && !changeState.binaryText.includes('+0') && !changeState.binaryText.includes('−0'), `The binary change is still rendered as a zero-line text diff: ${JSON.stringify(changeState)}`)
  await evaluate("[...document.querySelectorAll('.change-row')].find((row) => row.querySelector('strong')?.textContent === '260.py').click()")
  await waitFor("document.querySelector('.change-item[data-expanded] .diff-preview')?.innerText.includes('+from huasheng')", 'the untracked source diff')
  await capture('desktop-changes-source-1627x967.png')
  await evaluate("[...document.querySelectorAll('.change-row')].find((row) => row.querySelector('strong')?.textContent === 'base.apk').click()")
  await waitFor("Boolean(document.querySelector('.change-item[data-expanded] .binary-diff-note'))", 'the binary change explanation')
  const binaryDetail = await evaluate("document.querySelector('.change-item[data-expanded] .binary-diff-note')?.innerText")
  assert(binaryDetail.includes('二进制文件') && binaryDetail.includes('MB') && binaryDetail.includes('不提供行级 Diff'), `The binary explanation is incomplete: ${binaryDetail}`)
  await capture('desktop-changes-binary-1627x967.png')

  await evaluate("document.querySelector('.activity-button[aria-label=\"配置\"]').click()")
  await waitFor("Boolean(document.querySelector('.settings-dialog'))", 'settings')
  await evaluate("[...document.querySelectorAll('.settings-nav button')].find((button) => button.title === '对话').click()")
  await waitFor("document.querySelector('.settings-header')?.innerText.includes('调整消息发送')", 'chat settings')
  const chatSettings = await evaluate(`({
    sectionCount: document.querySelectorAll('.settings-content > .settings-section').length,
    headings: [...document.querySelectorAll('.settings-content h3')].map((node) => node.textContent.trim()),
  })`)
  assert(chatSettings.sectionCount === 6, `Expected six chat preference sections, found ${chatSettings.sectionCount}.`)
  assert(chatSettings.headings.includes('会话自动命名'), 'Automatic session naming preferences are missing.')
  assert(chatSettings.headings.includes('完成提示音'), 'Completion sound preferences are missing.')
  await capture('desktop-settings-chat-1627x967.png')

  await evaluate("[...document.querySelectorAll('.settings-nav button')].find((button) => button.title === '外观').click()")
  await waitFor("document.querySelector('.settings-header')?.innerText.includes('调整阅读舒适度')", 'appearance settings')
  const darkThemeBackground = await evaluate("getComputedStyle(document.querySelector('.settings-dialog')).backgroundColor")
  await evaluate("document.querySelector('[data-theme-preview=\"light\"]').click()")
  await waitFor("document.documentElement.dataset.theme === 'light'", 'the light theme')
  const lightTheme = await evaluate(`({
    dataset: document.documentElement.dataset.theme,
    dialogBackground: getComputedStyle(document.querySelector('.settings-dialog')).backgroundColor,
    dialogColor: getComputedStyle(document.querySelector('.settings-dialog')).color,
    selected: document.querySelector('[data-theme-preview="light"]').hasAttribute('data-active'),
  })`)
  assert(lightTheme.dataset === 'light' && lightTheme.selected, 'The light theme preference did not become active.')
  assert(lightTheme.dialogBackground !== darkThemeBackground, 'The light theme did not change the application surface colors.')
  await capture('desktop-settings-light-theme-1627x967.png')
  await evaluate("document.querySelector('[data-theme-preview=\"dark\"]').click()")
  await waitFor("document.documentElement.dataset.theme === 'dark'", 'the dark theme to be restored')

  await evaluate("[...document.querySelectorAll('.settings-nav button')].find((button) => button.title === 'Skills 与 Plugins').click()")
  await waitFor("document.querySelectorAll('.resource-card-icon.skill').length === 2", 'the Skills catalog')
  const skills = await evaluate(`({
    tabs: [...document.querySelectorAll('.resource-tabs [role="tab"]')].map((node) => node.textContent.trim()),
    count: [...document.querySelectorAll('.resource-card-icon.skill')].length,
    canInvoke: Boolean([...document.querySelectorAll('.resource-card-actions button')].find((button) => button.textContent.includes('调用'))),
    switches: document.querySelectorAll('.resource-switch[role="switch"]').length,
  })`)
  assert(skills.tabs.length === 3 && skills.tabs.some((label) => label.includes('资源包')), 'The Skills, Plugins, and package tabs are incomplete.')
  assert(skills.count === 2 && skills.canInvoke && skills.switches === 2, 'The Skills catalog or its lifecycle controls are incomplete.')
  await evaluate("document.querySelector('.resource-switch').click()")
  await waitFor("document.querySelector('.resource-switch')?.getAttribute('aria-checked') === 'false'", 'a Skill to be disabled')
  await evaluate("document.querySelector('.resource-switch').click()")
  await waitFor("document.querySelector('.resource-switch')?.getAttribute('aria-checked') === 'true'", 'the Skill to be enabled again')

  await evaluate("[...document.querySelectorAll('.resource-tabs [role=\"tab\"]')].find((button) => button.textContent.includes('Plugins')).click()")
  await waitFor("document.querySelectorAll('.resource-card-icon.plugin').length === 1", 'the Plugins catalog')
  const plugins = await evaluate(`({
    count: document.querySelectorAll('.resource-card-icon.plugin').length,
    capabilities: document.querySelectorAll('.resource-capabilities code').length,
    switches: document.querySelectorAll('.resource-switch[role="switch"]').length,
  })`)
  assert(plugins.count === 1 && plugins.capabilities >= 2 && plugins.switches === 1, 'Plugin metadata or lifecycle controls are incomplete.')
  await capture('desktop-settings-resources-1627x967.png')

  await evaluate("[...document.querySelectorAll('.resource-tabs [role=\"tab\"]')].find((button) => button.textContent.includes('资源包')).click()")
  await waitFor("Boolean(document.querySelector('.package-row'))", 'the package catalog')
  const packages = await evaluate(`({
    count: document.querySelectorAll('.package-row').length,
    canUpdate: Boolean(document.querySelector('.package-row [aria-label^="更新"]')),
    canRemove: Boolean([...document.querySelectorAll('.package-row button')].find((button) => button.textContent.includes('卸载'))),
  })`)
  assert(packages.count === 1 && packages.canUpdate && packages.canRemove, 'Package update or uninstall controls are missing.')
  await evaluate("[...document.querySelectorAll('.package-manager-section .settings-save')].find((button) => button.textContent.includes('安装资源包')).click()")
  await waitFor("Boolean(document.querySelector('.package-installer .resource-trust-check'))", 'the trusted package installer')
  const packageInstaller = await evaluate(`({
    sourceField: Boolean(document.querySelector('.package-installer input:not([type="checkbox"])')),
    scopeField: Boolean(document.querySelector('.package-installer select')),
    securityWarning: document.querySelector('.package-installer')?.innerText.includes('任意本机代码'),
    installDisabled: [...document.querySelectorAll('.package-installer button')].find((button) => button.textContent.includes('安装并加载'))?.disabled,
  })`)
  assert(packageInstaller.sourceField && packageInstaller.scopeField && packageInstaller.securityWarning && packageInstaller.installDisabled, 'The package trust gate is incomplete.')
  await capture('desktop-settings-packages-1627x967.png')

  await evaluate("[...document.querySelectorAll('.settings-nav button')].find((button) => button.title === 'Provider 与模型').click()")
  await waitFor("Boolean(document.querySelector('.provider-settings-layout'))", 'provider settings')
  await evaluate("[...document.querySelectorAll('.provider-list > button')].find((button) => button.textContent.includes('OpenAI')).click()")
  await waitFor("document.querySelector('.provider-heading h2')?.textContent === 'OpenAI'", 'OpenAI provider settings')
  await evaluate("[...document.querySelectorAll('.provider-auth-methods button')].find((button) => button.textContent.includes('使用 OpenAI 登录')).click()")
  await waitFor("Boolean(document.querySelector('.auth-dialog'))", 'the OAuth flow dialog')
  const oauthFlow = await evaluate(`({
    title: document.querySelector('.auth-dialog h2')?.textContent ?? document.querySelector('.auth-dialog [role="heading"]')?.textContent,
    hasSecurityNote: document.querySelector('.auth-dialog')?.innerText.includes('不会读取或显示访问令牌'),
    hasBrowserStatus: document.querySelector('.auth-dialog')?.innerText.includes('浏览器已打开'),
    hasProgress: document.querySelector('.auth-dialog')?.innerText.includes('等待浏览器完成授权'),
    hasLogo: Boolean(document.querySelector('.auth-dialog .provider-large-logo img')),
  })`)
  assert(oauthFlow.hasSecurityNote && oauthFlow.hasBrowserStatus && oauthFlow.hasProgress && oauthFlow.hasLogo, 'The OAuth progress experience is incomplete.')
  await capture('desktop-oauth-flow-1627x967.png')
  await waitFor("!document.querySelector('.auth-dialog')", 'the simulated OAuth flow to complete')
  await waitFor("document.querySelector('.provider-status')?.textContent.includes('OAuth')", 'the connected OAuth provider state')
  await evaluate("document.querySelector('.custom-provider-button').click()")
  await waitFor("Boolean(document.querySelector('.custom-model-editor'))", 'the custom model editor')
  const customModelFields = await evaluate("document.querySelectorAll('.custom-model-editor input, .custom-model-editor select').length")
  assert(customModelFields >= 7, `Custom model editor is incomplete: only ${customModelFields} inputs.`)
  await capture('desktop-custom-models-1627x967.png')
  await evaluate("document.querySelector('.settings-dialog button[aria-label=\"关闭设置\"]').click()")
  await waitFor("!document.querySelector('.settings-dialog')", 'settings to close')

  await evaluate("document.querySelector('[aria-label=\"从历史消息继续\"]').click()")
  await waitFor("Boolean(document.querySelector('.session-branch-dialog'))", 'the branch dialog')
  const branchActions = await evaluate("[...document.querySelectorAll('.session-branch-footer button')].map((button) => button.textContent.trim())")
  assert(branchActions.some((label) => label.includes('当前会话分支')) && branchActions.some((label) => label.includes('Fork 独立会话')), 'Branch or Fork action is missing.')
  await capture('desktop-branch-1627x967.png')
  await evaluate("document.querySelector('.session-branch-dialog button[aria-label=\"关闭\"]').click()")
  await waitFor("!document.querySelector('.session-branch-dialog')", 'the branch dialog to close')

  await clickSelector('.project-trigger')
  await waitFor("Boolean(document.querySelector('.project-menu'))", 'the worktree menu')
  const worktrees = await evaluate(`({
    menuText: document.querySelector('.project-menu')?.innerText,
    entries: document.querySelectorAll('.project-menu-item').length,
    current: Boolean(document.querySelector('.project-menu-item[data-current]')),
  })`)
  assert(/git worktree/iu.test(worktrees.menuText) && worktrees.entries >= 2 && worktrees.current, `The worktree switcher is incomplete: ${JSON.stringify(worktrees)}`)
  await capture('desktop-worktrees-1627x967.png')
  await clickSelector('.project-trigger')
  await waitFor("!document.querySelector('.project-menu')", 'the worktree menu to close')
  await evaluate("document.querySelector('.activity-button[aria-label=\"项目文件\"]').click()")
  await waitFor("Boolean(document.querySelector('.files-panel .file-tree'))", 'the project file tree')
  const fileTree = await evaluate(`({
    roots: document.querySelectorAll('.files-panel .file-tree > .tree-node').length,
    rows: document.querySelectorAll('.files-panel .tree-row').length,
    heading: document.querySelector('.files-panel .inspector-section-header')?.innerText,
  })`)
  assert(fileTree.roots > 0 && fileTree.rows > 0 && fileTree.heading.includes('项目文件'), 'The project file browser did not render.')
  await capture('desktop-project-files-1627x967.png')

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 390,
    screenHeight: 844,
  })
  await wait(450)
  const mobileShell = await evaluate(`({
    viewportWidth: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    sidebarVisible: document.querySelector('.sidebar-slot')?.hasAttribute('data-visible'),
    inspectorVisible: document.querySelector('.inspector-slot')?.hasAttribute('data-visible'),
    composerWidth: document.querySelector('.composer')?.getBoundingClientRect().width,
  })`)
  assert(mobileShell.viewportWidth === 390 && mobileShell.documentWidth <= 390, `Mobile layout overflows horizontally: ${JSON.stringify(mobileShell)}`)
  assert(!mobileShell.sidebarVisible && !mobileShell.inspectorVisible, 'Mobile layout did not collapse side panels.')
  assert(mobileShell.composerWidth >= 350, 'The mobile composer is too narrow.')
  await capture('mobile-main-390x844.png')
  await evaluate("document.querySelector('.model-trigger').click()")
  await waitFor("Boolean(document.querySelector('.model-picker-popover'))", 'the mobile model picker')
  const mobilePicker = await evaluate(`(() => {
    const rect = document.querySelector('.model-picker-popover').getBoundingClientRect()
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width }
  })()`)
  assert(mobilePicker.left >= 0 && mobilePicker.right <= 390 && mobilePicker.top >= 0 && mobilePicker.bottom <= 844, `Mobile model picker is clipped: ${JSON.stringify(mobilePicker)}`)
  await capture('mobile-model-picker-390x844.png')

  await wait(250)
  assert(consoleIssues.length === 0, `Renderer console issues:\n${consoleIssues.join('\n')}`)
  console.log(JSON.stringify({
    passed: true,
    targetUrl,
    viewports: ['1627x967', '390x844'],
    identity,
    modelPicker,
    interactions: ['model picker', 'UTF-8 Git changes', 'binary Git changes', 'chat settings', 'theme switch', 'skills/plugins/packages', 'OAuth progress', 'custom models', 'branch/fork', 'worktrees', 'project files', 'mobile model picker'],
    screenshots,
    consoleIssues,
  }, null, 2))
} finally {
  client?.close()
  if (browser && !browser.killed) browser.kill()
  if (userDataDirectory?.startsWith(path.join(os.tmpdir(), 'pi-desktop-edge-qa-'))) {
    await rm(userDataDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}
