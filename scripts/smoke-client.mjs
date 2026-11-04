// Smoke test for the browser half of dsh-docker-panel.
// Runs the real client.js in Node with tiny React/DOM/context stand-ins.
// It verifies the module contract, style/locale registration, slot
// registrations and that the entry/window components render without throwing.
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const failures = []
const checks = []
function check(name, condition, detail = '') {
  checks.push(name)
  if (!condition) failures.push(detail ? `${name} — ${detail}` : name)
}

// --- Browser stand-ins -----------------------------------------------------
let definition = null
globalThis.window = {
  __ModuleLoader__: {
    load(value) {
      definition = value
    },
  },
}

const stylesCreated = []
globalThis.document = {
  visibilityState: 'visible',
  querySelectorAll() {
    return []
  },
  createElement() {
    const el = {
      dataset: {},
      textContent: '',
      remove() {},
    }
    stylesCreated.push(el)
    return el
  },
  head: { appendChild() {} },
  body: { style: {} },
  addEventListener() {},
  removeEventListener() {},
}

// --- React stand-in (the real module comes from the DSH module table) ------
const elements = []
const mockReact = {
  createElement(type, props, ...children) {
    const element = { type, props: props || {}, children }
    elements.push(element)
    return element
  },
  useEffect() {},
  useRef(value) {
    return { current: value }
  },
  useSyncExternalStore(_subscribe, getSnapshot) {
    return getSnapshot()
  },
}

await import(pathToFileURL(resolve(root, 'client.js')).href)
check('module loader called once', definition !== null)
check('module id', definition?.id === 'dsh-docker-panel', String(definition?.id))

const plugin = definition.factory(() => mockReact)
check('factory returns plugin', Boolean(plugin))
check('plugin name', plugin.name === 'dsh-docker-panel', String(plugin.name))
check('inject slots/locale', Array.isArray(plugin.inject) && plugin.inject.includes('slots') && plugin.inject.includes('locale'), JSON.stringify(plugin.inject))

// --- Cordis-ish context ----------------------------------------------------
const effects = []
const registrations = []
const dictionaries = {}
const ctx = {
  effect(fn, label) {
    const dispose = fn()
    effects.push({ label, dispose })
    return () => {
      try {
        dispose?.()
      } catch {}
    }
  },
  locale: {
    register(namespace, dicts) {
      dictionaries[namespace] = dicts
      return () => delete dictionaries[namespace]
    },
    bind(namespace) {
      return (key, params) => {
        let text = dictionaries[namespace]?.zh?.[key] ?? key
        for (const [name, value] of Object.entries(params || {})) {
          text = text.split(`{${name}}`).join(String(value))
        }
        return text
      }
    },
  },
  slots: {
    inject(slotName, loader) {
      registrations.push({ slotName, registration: loader() })
    },
    register(options, component) {
      return { options, component }
    },
  },
}

plugin.apply(ctx)

check('three effects registered', effects.length === 3, String(effects.length))
check('style element injected', stylesCreated.length === 1, String(stylesCreated.length))
check('styles tagged', stylesCreated[0]?.dataset?.pluginCss === 'dsh-docker-panel/styles', JSON.stringify(stylesCreated[0]?.dataset))
check('css text present', String(stylesCreated[0]?.textContent || '').length > 2000, String(stylesCreated[0]?.textContent?.length))

const zh = dictionaries['dsh-docker']
check('locale zh registered', Boolean(zh?.zh))
check('locale en registered', Boolean(zh?.en))
const zhKeys = Object.keys(zh.zh).sort()
const enKeys = Object.keys(zh.en).sort()
check('zh/en key sets match', JSON.stringify(zhKeys) === JSON.stringify(enKeys), `${zhKeys.length} vs ${enKeys.length}`)
check('entry label translated', zh.zh['entry.label'] === 'Docker', zh.zh['entry.label'])

check('two slots injected', registrations.length === 2, String(registrations.length))
const bySlot = Object.fromEntries(registrations.map((item) => [item.slotName, item.registration]))
check('footer action slot registered', Boolean(bySlot['sidebar.footer.action']))
check('overlay slot registered', Boolean(bySlot['shell.overlay']))
check('footer entry id', bySlot['sidebar.footer.action']?.options?.id === 'dsh-docker-panel-entry', String(bySlot['sidebar.footer.action']?.options?.id))
check('overlay entry id', bySlot['shell.overlay']?.options?.id === 'dsh-docker-panel-window', String(bySlot['shell.overlay']?.options?.id))
check('entry component is function', typeof bySlot['sidebar.footer.action']?.component === 'function')
check('overlay component is function', typeof bySlot['shell.overlay']?.component === 'function')

// --- Render the components (no DOM is touched during render) --------------
const t = ctx.locale.bind('dsh-docker')
const entryRegistration = bySlot['sidebar.footer.action']
const injected = entryRegistration.options.inject()
const store = injected.store
check('injected store has subscribe/getSnapshot', typeof store.subscribe === 'function' && typeof store.getSnapshot === 'function')
check('initial snapshot closed', store.getSnapshot().open === false)

const entryClosed = entryRegistration.component({ ...injected, wide: true })
check('entry renders button', entryClosed?.type === 'button', String(entryClosed?.type))
check('entry has aria-haspopup', entryClosed?.props?.['aria-haspopup'] === 'dialog')
check('entry hidden on rail', entryRegistration.component({ ...injected, wide: false }) === null)

const windowComponent = bySlot['shell.overlay'].component
check('window renders null while closed', windowComponent({ ...injected }) === null)

// --- Deep render: invoke function components so card/list logic runs --------
function renderTree(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return null
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map((child) => renderTree(child)).filter((child) => child !== null)
  if (typeof node.type === 'function') {
    const props = { ...node.props }
    if (node.children.length > 0) props.children = node.children
    return renderTree(node.type(props))
  }
  return { tag: node.type, props: node.props, children: node.children.map((child) => renderTree(child)).filter((child) => child !== null) }
}

function collectText(node, out = []) {
  if (node === null || node === undefined) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out)
    return out
  }
  for (const child of node.children || []) collectText(child, out)
  return out
}

const fixture = {
  ok: true,
  containers: [
    { id: 'a', name: 'libretv', title: 'LibreTV', image: 'bestzwei/libretv:2.21.1', state: 'running', running: true, status: 'Up 1 minute', hostPort: 8080, url: 'http://localhost:8080/' },
    { id: 'b', name: 'sillytavern', title: 'SillyTavern', image: 'ghcr.io/sillytavern/sillytavern:latest', state: 'exited', running: false, status: 'Exited (0)', hostPort: 8000, url: 'http://localhost:8000/' },
  ],
}
globalThis.fetch = async () => ({ ok: true, json: async () => fixture })
store.open()
await new Promise((resolve) => setTimeout(resolve, 10))
const opened = store.getSnapshot()
check('store opens', opened.open === true && opened.phase === 'open', JSON.stringify({ open: opened.open, phase: opened.phase }))
check('store loads containers', opened.containers.length === 2, String(opened.containers.length))
const windowOpen = windowComponent({ ...injected })
check('window renders backdrop', windowOpen?.props?.className?.includes('ddp-backdrop'), String(windowOpen?.props?.className))
const rendered = renderTree(windowOpen)
const text = collectText(rendered).join(' ')
check('window renders titles', text.includes('LibreTV') && text.includes('SillyTavern'), text)
check('window renders open action', text.includes('打开') && text.includes('启动并打开'), text)
check('window renders urls', text.includes('localhost:8080') && text.includes('localhost:8000'), text)
store.requestClose()
check('store enters closing', store.getSnapshot().phase === 'closing')
store.dispose()

// Error state: a fresh apply gets a fresh store; the daemon-down error must render.
plugin.apply(ctx)
const errorRegistration = registrations.filter((item) => item.slotName === 'shell.overlay').at(-1)
const errorEntryRegistration = registrations.filter((item) => item.slotName === 'sidebar.footer.action').at(-1)
const errorInjected = { t: ctx.locale.bind('dsh-docker'), store: errorEntryRegistration.registration.options.inject().store }
const errorStore = errorInjected.store
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: false, error: { code: 'docker_daemon_down', message: 'daemon down' } }) })
errorStore.open()
await new Promise((resolve) => setTimeout(resolve, 10))
const errorTree = renderTree(errorRegistration.registration.component({ ...errorInjected }))
const errorText = collectText(errorTree).join(' ')
check('window renders daemon-down error', errorText.includes('Docker 守护进程没有运行'), errorText)
check('window renders start-desktop action', errorText.includes('启动 Docker Desktop'), errorText)
errorStore.dispose()

// --- Report ----------------------------------------------------------------
if (failures.length > 0) {
  console.error(`smoke-client: ${failures.length} failed of ${checks.length}`)
  for (const failure of failures) console.error('  FAIL ' + failure)
  process.exitCode = 1
} else {
  console.log(`smoke-client: ${checks.length} checks passed`)
}
