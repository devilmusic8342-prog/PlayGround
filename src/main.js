import './style.css'

const $ = (selector, parent = document) => parent.querySelector(selector)
const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector))

const STORAGE_KEY = 'nimbus:endpoint'
const DEFAULT_TARGET = 'http://YOUR_VPS_IP:6080'
const PLACEHOLDER_HOST = 'YOUR_VPS_IP'

const elements = {
  form: $('#connectForm'),
  endpoint: $('#endpoint'),
  endpointBox: $('#endpointBox'),
  reconnect: $('#reconnectButton'),
  phoneStage: $('#phoneStage'),
  deviceScreen: $('#deviceScreen'),
  streamFrame: $('#streamFrame'),
  streamLoading: $('#streamLoading'),
  loadingHost: $('#loadingHost'),
  statusBadge: $('#statusBadge'),
  statusLabel: $('#statusLabel'),
  statusSub: $('#statusSub'),
  pingValue: $('#pingValue'),
  previewConnect: $('#previewConnect'),
  sleepOverlay: $('#sleepOverlay'),
  powerButton: $('#powerButton'),
  rotateButton: $('#rotateButton'),
  resolution: $('#resolutionText'),
  volumeHud: $('#volumeHud'),
  volumeFill: $('#volumeFill'),
  volumeValue: $('#volumeValue'),
  toast: $('#toast'),
  toastTitle: $('#toastTitle'),
  toastMessage: $('#toastMessage'),
  toastIconUse: $('#toastIcon use'),
  demoDate: $('.demo-date'),
  demoClock: $('.demo-clock'),
  demoTime: $('.demo-time'),
  demoScreen: $('#demoScreen'),
  sleepTime: $('#sleepTime'),
  sleepDate: $('.sleep-date'),
}

const state = {
  endpoint: null,
  status: 'disconnected',
  ping: null,
  live: false,
  connecting: false,
  asleep: false,
  landscape: false,
  volume: 60,
  error: '',
  attempt: 0,
  loadTimer: null,
  pingTimer: null,
  toastTimer: null,
  volumeTimer: null,
  clockTimer: null,
}

elements.streamFrame.dataset.defaultTarget = DEFAULT_TARGET

/* -------------------------------------------------------------------------- */
/* Clock + boot                                                               */
/* -------------------------------------------------------------------------- */

function clockText(date) {
  const hours = date.getHours() % 12 || 12
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function dateText(date) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
}

function tickClock() {
  const now = new Date()
  const time = clockText(now)
  const date = dateText(now)

  if (elements.demoClock) elements.demoClock.textContent = time
  if (elements.demoTime) elements.demoTime.textContent = time
  if (elements.sleepTime) elements.sleepTime.textContent = time
  if (elements.demoDate) elements.demoDate.textContent = date
  if (elements.sleepDate) elements.sleepDate.textContent = date
}

function boot() {
  tickClock()
  state.clockTimer = window.setInterval(tickClock, 30_000)

  let initialEndpoint = ''
  try {
    initialEndpoint = window.localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    // Storage can be unavailable in hardened contexts; the input still works.
  }

  const queryEndpoint = new URLSearchParams(window.location.search).get('endpoint')
  if (queryEndpoint) initialEndpoint = queryEndpoint

  if (initialEndpoint) {
    elements.endpoint.value = initialEndpoint
    window.setTimeout(() => connect({ quiet: true }), 900)
  }

  updateStatus()
}

/* -------------------------------------------------------------------------- */
/* Endpoint helpers                                                           */
/* -------------------------------------------------------------------------- */

function normalizeEndpoint(rawValue) {
  let value = String(rawValue || '').trim()
  if (!value) return { error: 'Enter your VPS IP and noVNC port.' }
  if (value.includes(PLACEHOLDER_HOST)) {
    return { error: 'Replace YOUR_VPS_IP with your server address.' }
  }

  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) value = `http://${value}`

  let url
  try {
    url = new URL(value)
  } catch {
    return { error: 'That endpoint is not a valid URL.' }
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { error: 'Use an http:// or https:// endpoint.' }
  }

  if (!url.hostname) return { error: 'Add the server host or IP address.' }

  return { url }
}

function buildStreamUrl(endpoint, nonce = Date.now()) {
  const url = new URL(endpoint.href)
  if (!url.searchParams.has('autoconnect')) url.searchParams.set('autoconnect', 'true')
  if (!url.searchParams.has('resize')) url.searchParams.set('resize', 'scale')
  if (!url.searchParams.has('reconnect')) url.searchParams.set('reconnect', 'true')
  url.searchParams.set('_nimbus', String(nonce))
  return url.href
}

function buildProbeUrl(endpoint, nonce = Date.now()) {
  const url = new URL(endpoint.href)
  url.searchParams.set('_nimbus_ping', String(nonce))
  return url.href
}

function saveEndpoint(endpoint) {
  try {
    window.localStorage.setItem(STORAGE_KEY, endpoint.href)
  } catch {
    // Non-blocking: persistence is a convenience, not a requirement.
  }
}

/* -------------------------------------------------------------------------- */
/* Connection lifecycle                                                       */
/* -------------------------------------------------------------------------- */

function probeEndpoint(endpoint, timeout = 6_500) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController()
    const started = performance.now()
    const timer = window.setTimeout(() => controller.abort(), timeout)

    fetch(buildProbeUrl(endpoint), {
      mode: 'no-cors',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    })
      .then(() => {
        window.clearTimeout(timer)
        resolve(Math.max(1, Math.round(performance.now() - started)))
      })
      .catch((error) => {
        window.clearTimeout(timer)
        reject(error)
      })
  })
}

function waitForFrame(url, timeout = 15_000) {
  return new Promise((resolve, reject) => {
    const frame = elements.streamFrame
    let settled = false

    const cleanup = () => {
      window.clearTimeout(timer)
      frame.removeEventListener('load', onLoad)
    }

    const onLoad = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('The stream page did not finish loading.'))
    }, timeout)

    frame.addEventListener('load', onLoad)
    frame.src = url
  })
}

async function connect({ quiet = false } = {}) {
  if (state.connecting) return

  const normalized = normalizeEndpoint(elements.endpoint.value)

  if (normalized.error) {
    state.error = normalized.error
    if (!state.live) {
      state.status = 'disconnected'
      elements.endpointBox.classList.add('is-invalid')
      elements.endpointBox.classList.remove('is-live')
    }
    updateStatus()
    if (!quiet) {
      showToast('Check your endpoint', normalized.error, 'error')
      elements.endpoint.focus()
      elements.endpoint.select()
    }
    return
  }

  if (!navigator.onLine) {
    state.status = 'disconnected'
    state.error = 'This device is offline.'
    updateStatus()
    if (!quiet) showToast('You are offline', 'Reconnect to the internet and try again.', 'error')
    return
  }

  const attempt = ++state.attempt
  const endpoint = normalized.url

  state.endpoint = endpoint
  state.status = 'connecting'
  state.connecting = true
  state.live = false
  state.ping = null
  state.error = ''

  elements.endpoint.value = endpoint.href
  elements.endpointBox.classList.remove('is-live', 'is-invalid')
  elements.deviceScreen.classList.remove('is-live', 'is-asleep')
  elements.deviceScreen.classList.add('is-connecting')
  elements.demoScreen.inert = true
  elements.sleepOverlay.tabIndex = -1
  elements.sleepOverlay.setAttribute('aria-hidden', 'true')
  elements.powerButton.setAttribute('aria-pressed', 'false')
  elements.loadingHost.textContent = endpoint.host
  elements.reconnect.disabled = true
  elements.reconnect.classList.add('is-loading')
  state.asleep = false
  stopPingLoop()
  updateStatus()

  saveEndpoint(endpoint)

  try {
    const latency = await probeEndpoint(endpoint)
    if (attempt !== state.attempt) return

    await waitForFrame(buildStreamUrl(endpoint, Date.now()))
    if (attempt !== state.attempt) return

    state.status = 'connected'
    state.live = true
    state.connecting = false
    state.ping = latency
    state.error = ''

    elements.deviceScreen.classList.remove('is-connecting')
    elements.deviceScreen.classList.add('is-live')
    elements.endpointBox.classList.add('is-live')
    elements.reconnect.disabled = false
    elements.reconnect.classList.remove('is-loading')
    updateStatus()
    startPingLoop()

    if (!quiet) {
      showToast('Stream connected', `${endpoint.host} · ${latency} ms round trip`, 'success')
    }
  } catch (error) {
    if (attempt !== state.attempt) return
    failConnection(error, quiet)
  }
}

function failConnection(error, quiet = false) {
  state.status = 'disconnected'
  state.live = false
  state.connecting = false
  state.ping = null
  state.error =
    error?.name === 'AbortError'
      ? 'The endpoint timed out.'
      : 'Could not reach the stream endpoint.'

  elements.deviceScreen.classList.remove('is-live', 'is-connecting')
  elements.demoScreen.inert = false
  elements.endpointBox.classList.remove('is-live')
  elements.endpointBox.classList.add('is-invalid')
  elements.reconnect.disabled = false
  elements.reconnect.classList.remove('is-loading')
  elements.streamFrame.src = 'about:blank'
  stopPingLoop()
  updateStatus()

  if (!quiet) {
    showToast('Connection failed', state.error, 'error')
  }
}

function startPingLoop() {
  stopPingLoop()
  state.pingTimer = window.setInterval(checkPing, 10_000)
}

function stopPingLoop() {
  if (state.pingTimer) window.clearInterval(state.pingTimer)
  state.pingTimer = null
}

async function checkPing() {
  if (state.status !== 'connected' || !state.endpoint) return
  if (document.visibilityState !== 'visible') return

  try {
    const latency = await probeEndpoint(state.endpoint, 4_500)
    if (state.status !== 'connected') return
    state.ping = latency
    updateStatus()
  } catch {
    if (state.status !== 'connected') return
    state.status = 'disconnected'
    state.live = false
    state.ping = null
    state.error = 'The stream stopped responding.'

    elements.deviceScreen.classList.remove('is-live')
    elements.demoScreen.inert = false
    elements.endpointBox.classList.remove('is-live')
    elements.reconnect.classList.remove('is-loading')
    elements.streamFrame.src = 'about:blank'
    stopPingLoop()
    updateStatus()
    showToast('Stream disconnected', 'Press Reconnect to restore the device.', 'error')
  }
}

/* -------------------------------------------------------------------------- */
/* UI state                                                                   */
/* -------------------------------------------------------------------------- */

function updateStatus() {
  const { status, ping, endpoint, error } = state
  elements.statusBadge.dataset.state = status

  if (status === 'connected') {
    elements.statusLabel.textContent = 'Connected'
    elements.statusSub.textContent = 'Live noVNC stream'
    elements.pingValue.textContent = ping == null ? '—' : String(ping)
  } else if (status === 'connecting') {
    elements.statusLabel.textContent = 'Connecting'
    elements.statusSub.textContent = 'Negotiating stream'
    elements.pingValue.textContent = '—'
  } else {
    elements.statusLabel.textContent = 'Disconnected'
    elements.statusSub.textContent =
      error || (endpoint ? 'Stream is currently offline' : 'Awaiting endpoint')
    elements.pingValue.textContent = '—'
  }
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

function showToast(title, message, type = 'success') {
  window.clearTimeout(state.toastTimer)

  elements.toastTitle.textContent = title
  elements.toastMessage.textContent = message
  elements.toast.classList.toggle('is-error', type === 'error')

  const icon =
    type === 'error' ? '#i-alert' : type === 'info' ? '#i-globe' : '#i-check'
  elements.toastIconUse.setAttribute('href', icon)
  elements.toast.classList.add('is-visible')

  state.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove('is-visible')
  }, 3_200)
}

/* -------------------------------------------------------------------------- */
/* Physical controls                                                          */
/* -------------------------------------------------------------------------- */

function toggleSleep(force) {
  state.asleep = typeof force === 'boolean' ? force : !state.asleep
  elements.deviceScreen.classList.toggle('is-asleep', state.asleep)
  elements.powerButton.setAttribute('aria-pressed', String(state.asleep))

  if (state.asleep) {
    elements.sleepOverlay.tabIndex = 0
    elements.sleepOverlay.setAttribute('aria-hidden', 'false')
    elements.sleepOverlay.focus({ preventScroll: true })
  } else {
    elements.sleepOverlay.blur()
    elements.sleepOverlay.tabIndex = -1
    elements.sleepOverlay.setAttribute('aria-hidden', 'true')
    tickClock()
  }
}

function setVolume(direction) {
  state.volume = Math.max(0, Math.min(100, state.volume + direction * 10))
  elements.volumeFill.style.height = `${state.volume}%`
  elements.volumeValue.textContent = String(state.volume)
  elements.deviceScreen.classList.add('is-volume')

  window.clearTimeout(state.volumeTimer)
  state.volumeTimer = window.setTimeout(() => {
    elements.deviceScreen.classList.remove('is-volume')
  }, 1_500)
}

function toggleOrientation() {
  state.landscape = !state.landscape
  elements.phoneStage.classList.toggle('is-landscape', state.landscape)
  elements.rotateButton.setAttribute('aria-pressed', String(state.landscape))
  elements.resolution.textContent = state.landscape ? '2400 × 1080' : '1080 × 2400'

  const hint = elements.rotateButton.querySelector('.key-hint')
  if (hint) hint.textContent = state.landscape ? 'Landscape view' : 'Portrait view'

  showToast(
    state.landscape ? 'Landscape orientation' : 'Portrait orientation',
    `${state.landscape ? '2400 × 1080' : '1080 × 2400'} · display rotated`,
    'info',
  )
}

function sendNavigationKey(label) {
  if (!state.live) {
    showToast('Preview mode', 'Connect your cloud device to send navigation keys.', 'info')
    return
  }

  if (state.asleep) toggleSleep(false)

  elements.streamFrame.focus({ preventScroll: true })
  showToast(`${label} pressed`, 'Input delivered to the live noVNC session.', 'success')
}

$$('[data-command]').forEach((button) => {
  button.addEventListener('click', () => {
    const command = button.dataset.command
    if (command === 'power') toggleSleep()
    if (command === 'volume-up') setVolume(1)
    if (command === 'volume-down') setVolume(-1)
    if (command === 'rotate') toggleOrientation()
    if (command === 'home') sendNavigationKey('Home')
    if (command === 'back') sendNavigationKey('Back')
    if (command === 'recents') sendNavigationKey('Recents')
  })
})

elements.sleepOverlay.addEventListener('click', () => toggleSleep(false))
elements.sleepOverlay.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggleSleep(false)
  }
})

/* -------------------------------------------------------------------------- */
/* Forms, shortcuts and network events                                        */
/* -------------------------------------------------------------------------- */

elements.form.addEventListener('submit', (event) => {
  event.preventDefault()
  connect()
})

elements.endpoint.addEventListener('input', () => {
  elements.endpointBox.classList.remove('is-invalid')
  if (!state.live && !state.connecting) {
    state.error = ''
    updateStatus()
  }
})

elements.previewConnect.addEventListener('click', () => {
  elements.endpoint.focus()
  elements.endpoint.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (elements.endpoint.value) elements.endpoint.select()
  showToast('Add your stream endpoint', 'Enter IP:port or a full noVNC URL, then press Reconnect.', 'info')
})

window.addEventListener('keydown', (event) => {
  const target = event.target
  const isTyping =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable

  if (event.key === 'Escape' && isTyping) {
    target.blur()
    return
  }

  if (event.key.toLowerCase() === 'r' && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) {
    elements.form.requestSubmit()
  }
})

window.addEventListener('offline', () => {
  if (state.status !== 'connected') return
  state.status = 'disconnected'
  state.live = false
  state.ping = null
  state.error = 'Your network connection was lost.'
  elements.deviceScreen.classList.remove('is-live')
  elements.demoScreen.inert = false
  elements.endpointBox.classList.remove('is-live')
  elements.streamFrame.src = 'about:blank'
  stopPingLoop()
  updateStatus()
  showToast('Network offline', 'The cloud phone stream was paused.', 'error')
})

window.addEventListener('online', () => {
  if (!state.endpoint) return
  showToast('Back online', 'Re-establishing the cloud phone stream.', 'info')
  connect({ quiet: true })
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.status === 'connected') {
    checkPing()
  }
})

boot()
