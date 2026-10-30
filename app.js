/* NovaDroid — Virtual Android Cloud Phone
 * noVNC renderer + device control shell.
 */

const DEFAULT_URL = "http://YOUR_VPS_IP:6080";
const STORAGE_KEY = "novadroid.endpoint";
const PING_INTERVAL = 12000;
const CONNECT_TIMEOUT = 18000;

const $ = (selector, root = document) => root.querySelector(selector);

const els = {
  serverForm: $("#serverForm"),
  serverUrl: $("#serverUrl"),
  reconnectBtn: $("#reconnectBtn"),
  reconnectIcon: $("#reconnectIcon"),
  reconnectLabel: $("#reconnectLabel"),
  headerDot: $("#headerDot"),
  headerPulse: $("#headerPulse"),
  headerState: $("#headerState"),

  stage: $("#deviceStage"),
  rotator: $("#deviceRotator"),
  phoneShell: $("#phoneShell"),
  phoneScreen: $("#phoneScreen"),
  viewport: $("#vncViewport"),

  statusCard: $("#statusCard"),
  statusText: $("#statusText"),
  statusHint: $("#statusHint"),
  statusHost: $("#statusHost"),
  pingText: $("#pingText"),
  qualityText: $("#qualityText"),
  latencyFill: $("#latencyFill"),
  signalBars: $("#signalBars"),

  offlineCard: $("#offlineCard"),
  offlineIconUse: $("#offlineIcon use"),
  offlineTitle: $("#offlineTitle"),
  offlineBody: $("#offlineBody"),
  offlineAction: $("#offlineAction"),
  offlineActionLabel: $("#offlineActionLabel"),

  connectingHost: $("#connectingHost"),
  cancelConnect: $("#cancelConnect"),
  rotateButton: $('[data-action="rotate"]'),
  rotateMeta: $("#rotateMeta"),

  clock: $("#homeClock"),
  statusClock: $("#statusClock"),
  date: $("#homeDate"),

  toast: $("#toast"),
  toastText: $("#toastText"),
  toastIconUse: $("#toastIcon use"),
};

const state = {
  rfb: null,
  status: "offline",
  endpoint: null,
  wsUrl: null,
  host: null,
  latency: null,
  landscape: false,
  manualStop: false,
  connectTimer: null,
  pingTimer: null,
  pingRun: null,
  retryTimer: null,
  retries: 0,
  toastTimer: null,
  generation: 0,
  RFB: null,
};

/* ─────────────────────────  URL parsing  ───────────────────────── */

function isPlaceholder(value) {
  return /YOUR_VPS_IP|YOUR_SERVER|YOUR_HOST|example\.com/i.test(value || "");
}

function normalizeEndpoint(raw) {
  let value = String(raw || "").trim();
  if (!value || /\s/.test(value)) return null;

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const hasPort = /:\d+(\/|$)/.test(value);
    value = `http://${value}${hasPort ? "" : ":6080"}`;
  }

  try {
    const url = new URL(value);
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function resolveStream(raw) {
  const endpoint = normalizeEndpoint(raw);
  if (!endpoint) {
    return { error: "Enter a valid server address or stream URL." };
  }
  if (isPlaceholder(endpoint)) {
    return { placeholder: true, endpoint, host: "YOUR_VPS_IP:6080" };
  }

  const url = new URL(endpoint);
  const secure = url.protocol === "https:" || url.protocol === "wss:";
  const wsProtocol = secure ? "wss:" : "ws:";
  let path = "/websockify";

  if (url.protocol === "ws:" || url.protocol === "wss:") {
    if (url.pathname && url.pathname !== "/") path = url.pathname;
  } else {
    const pathParam = url.searchParams.get("path");
    if (pathParam) {
      path = pathParam;
    } else if (url.pathname.includes("websockify")) {
      path = url.pathname;
    }
  }

  if (!path.startsWith("/")) path = `/${path}`;

  const host = `${url.hostname}${url.port ? `:${url.port}` : ""}`;
  const wsUrl = `${wsProtocol}//${url.host}${path}`;
  const mixedContent =
    window.location.protocol === "https:" && wsUrl.startsWith("ws://");

  return {
    endpoint,
    wsUrl,
    host,
    secure,
    mixedContent,
    error: mixedContent
      ? "This https page can’t open a ws:// stream. Use an https or wss:// endpoint."
      : null,
  };
}

function deriveInputHint(raw) {
  const stream = resolveStream(raw);
  if (stream.host) return stream.host;
  return "6080";
}

/* ─────────────────────────  status UI  ───────────────────────── */

const STATUS_COPY = {
  offline: {
    header: "Standby",
    headerColor: "#6b7280",
    hint: "Waiting for endpoint",
    quality: "Offline",
  },
  connecting: {
    header: "Linking",
    headerColor: "#fbbf24",
    hint: "Establishing stream",
    quality: "Handshaking",
  },
  connected: {
    header: "Online",
    headerColor: "#7ef0b2",
    hint: "Stream active",
    quality: "Measuring",
  },
  error: {
    header: "Offline",
    headerColor: "#fb7185",
    hint: "Reconnect to retry",
    quality: "No signal",
  },
};

function setStatus(next, options = {}) {
  state.status = next;
  const copy = STATUS_COPY[next];
  if (!copy) return;

  els.statusCard.dataset.state = next;
  els.statusText.textContent =
    next === "connected" ? "Connected" : next === "connecting" ? "Connecting" : "Disconnected";

  els.headerState.textContent = copy.header;
  els.headerDot.style.background = copy.headerColor;
  els.headerDot.style.boxShadow =
    next === "connected"
      ? "0 0 10px rgba(126,240,178,.8)"
      : next === "connecting"
        ? "0 0 10px rgba(251,191,36,.6)"
        : next === "error"
          ? "0 0 8px rgba(251,113,133,.5)"
          : "none";
  els.headerPulse.style.background = copy.headerColor;
  els.headerPulse.style.opacity = next === "offline" ? "0" : "0.5";

  els.signalBars.classList.toggle("is-connecting", next === "connecting");
  els.signalBars.classList.toggle("is-error", next === "error");
  els.qualityText.style.color = "";

  if (next === "connected") {
    if (state.latency == null) {
      els.pingText.innerHTML = '—<span class="ml-1 text-[9px] font-normal text-zinc-500">ms</span>';
      els.qualityText.textContent = "Measuring";
      els.qualityText.style.color = "#fbbf24";
      els.latencyFill.style.width = "24%";
      els.latencyFill.style.background = "linear-gradient(90deg,#f59e0b,#fbbf24)";
      setBars(2);
      els.statusHint.textContent = "Stream active";
    } else {
      updateLatency(state.latency);
    }
    return;
  }

  state.latency = null;
  els.pingText.innerHTML = '—<span class="ml-1 text-[9px] font-normal text-zinc-500">ms</span>';
  els.qualityText.textContent = copy.quality;
  els.latencyFill.style.width = next === "connecting" ? "38%" : "0%";
  els.latencyFill.style.background = "linear-gradient(90deg,#2dd4bf,#7ef0b2)";
  els.statusHint.textContent = options.hint || copy.hint;
  setBars(0);

  if (options.host) {
    state.host = options.host;
    els.statusHost.textContent = shortHost(options.host);
    els.connectingHost.textContent = options.host;
  }
}

function setBars(level, mode = "normal") {
  const bars = els.signalBars.querySelectorAll("span");
  bars.forEach((bar, index) => {
    bar.classList.toggle("is-on", mode === "normal" && index < level);
  });
}

function latencyQuality(ms) {
  if (ms == null) return { label: "No reply", level: 0, color: "#fb7185" };
  if (ms < 45) return { label: "Excellent", level: 4, color: "#7ef0b2" };
  if (ms < 90) return { label: "Good", level: 3, color: "#7ef0b2" };
  if (ms < 180) return { label: "Fair", level: 2, color: "#fbbf24" };
  return { label: "Slow", level: 1, color: "#fb7185" };
}

function updateLatency(ms) {
  state.latency = ms;
  const quality = latencyQuality(ms);

  if (ms == null) {
    els.pingText.innerHTML = '—<span class="ml-1 text-[9px] font-normal text-zinc-500">ms</span>';
    els.qualityText.textContent = "No reply";
    els.qualityText.style.color = "#fb7185";
    els.latencyFill.style.width = "6%";
    els.latencyFill.style.background = "#fb7185";
    setBars(0);
    return;
  }

  els.pingText.innerHTML = `${Math.round(ms)}<span class="ml-1 text-[9px] font-normal text-zinc-500">ms</span>`;
  els.qualityText.textContent = quality.label;
  els.qualityText.style.color = quality.color;
  const width = Math.max(8, Math.min(100, 108 - ms / 2.4));
  els.latencyFill.style.width = `${width}%`;
  els.latencyFill.style.background =
    quality.level >= 3
      ? "linear-gradient(90deg,#2dd4bf,#7ef0b2)"
      : quality.level === 2
        ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
        : "linear-gradient(90deg,#fb7185,#fda4af)";
  setBars(quality.level);
  els.statusHint.textContent = "Stream active";
}

function shortHost(host) {
  return host.length > 18 ? `${host.slice(0, 16)}…` : host;
}

function setOfflineCard(mode, message) {
  if (mode === "error") {
    const reason = message || "Check the IP, port 6080, and that noVNC is running.";
    els.offlineCard.dataset.state = "error";
    els.offlineTitle.textContent = "Stream unreachable";
    els.offlineBody.textContent = reason.length > 150 ? `${reason.slice(0, 147)}…` : reason;
    els.offlineActionLabel.textContent = "Retry";
    els.offlineIconUse.setAttribute("href", "#i-alert");
    return;
  }

  if (mode === "connecting") {
    els.offlineCard.dataset.state = "connecting";
    els.offlineTitle.textContent = "Connecting…";
    els.offlineBody.textContent = "Negotiating the noVNC stream. This usually takes a few seconds.";
    els.offlineActionLabel.textContent = "Cancel";
    els.offlineIconUse.setAttribute("href", "#i-loader");
    return;
  }

  els.offlineCard.dataset.state = "idle";
  els.offlineTitle.textContent = "VPS stream offline";
  els.offlineBody.textContent =
    message || "Add your noVNC endpoint to start streaming this device.";
  els.offlineActionLabel.textContent = "Connect";
  els.offlineIconUse.setAttribute("href", "#i-cloud-off");
}

function toast(message, type = "info") {
  window.clearTimeout(state.toastTimer);
  els.toastText.textContent = message;
  els.toast.classList.toggle("is-error", type === "error");
  els.toastIconUse.setAttribute("href", type === "error" ? "#i-alert" : "#i-bolt");
  els.toast.classList.add("is-visible");
  state.toastTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 3200);
}

/* ─────────────────────────  noVNC  ───────────────────────── */

async function loadRFB() {
  if (state.RFB) return state.RFB;
  const mod = await import("./vendor/novnc-rfb.js");
  const candidate = mod.default;
  state.RFB = typeof candidate === "function" ? candidate : candidate?.default || mod.RFB;
  if (typeof state.RFB !== "function") throw new Error("noVNC module could not be initialised.");
  return state.RFB;
}

function stopPing() {
  window.clearInterval(state.pingTimer);
  state.pingTimer = null;
  state.pingRun = null;
}

function startPing() {
  stopPing();
  const run = async () => {
    if (state.status !== "connected" || !state.wsUrl) return;
    if (document.hidden) return;
    const ms = await measureLatency(state.wsUrl);
    if (state.status === "connected") updateLatency(ms);
  };
  state.pingRun = run;
  window.setTimeout(run, 600);
  state.pingTimer = window.setInterval(run, PING_INTERVAL);
}

function measureLatency(wsUrl) {
  return new Promise((resolve) => {
    let settled = false;
    let socket;
    const started = performance.now();

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      try {
        socket?.close();
      } catch {
        /* ignore */
      }
      resolve(ok ? Math.max(1, Math.round(performance.now() - started)) : null);
    };

    const timeout = window.setTimeout(() => finish(false), 4500);

    try {
      socket = new WebSocket(wsUrl, ["binary"]);
      socket.addEventListener("open", () => finish(true));
      socket.addEventListener("error", () => finish(false));
      socket.addEventListener("close", () => finish(false));
    } catch {
      finish(false);
    }
  });
}

async function connect({ manual = false } = {}) {
  const raw = els.serverUrl.value;
  const stream = resolveStream(raw);

  if (stream.placeholder) {
    els.serverUrl.focus();
    els.serverUrl.select();
    toast("Add your VPS IP or stream URL first", "error");
    return;
  }

  if (stream.error) {
    setStatus("error", { host: stream.host });
    setOfflineCard("error", stream.error);
    toast(stream.error, "error");
    return;
  }

  const RFB = await loadRFB().catch(() => null);
  if (!RFB) {
    setStatus("error");
    setOfflineCard("error", "The noVNC engine could not be loaded. Reload the page and try again.");
    toast("Stream engine failed to load", "error");
    return;
  }

  state.endpoint = stream.endpoint;
  state.wsUrl = stream.wsUrl;
  state.host = stream.host;
  state.manualStop = false;
  state.generation += 1;
  const generation = state.generation;

  els.serverUrl.value = stream.endpoint;
  els.statusHost.textContent = shortHost(stream.host);
  els.connectingHost.textContent = stream.host;
  setOfflineCard("connecting");
  setStatus("connecting", { host: stream.host });
  els.reconnectBtn.classList.add("is-busy");
  els.reconnectBtn.setAttribute("aria-busy", "true");
  els.reconnectLabel.textContent = "Linking";
  els.phoneScreen.classList.add("is-connecting");
  els.phoneScreen.classList.remove("is-connected");

  disconnectRfb({ silent: true });
  window.clearTimeout(state.connectTimer);

  let rfb;
  try {
    rfb = new RFB(els.viewport, stream.wsUrl, { shared: true, wsProtocols: ["binary"] });
  } catch {
    handleConnectionFailure("Could not open the noVNC stream.", generation);
    return;
  }

  state.rfb = rfb;
  rfb.scaleViewport = true;
  rfb.resizeSession = false;
  rfb.clipViewport = false;
  rfb.qualityLevel = 6;
  rfb.compressionLevel = 2;
  rfb.background = "#05070a";

  rfb.addEventListener("connect", () => {
    if (generation !== state.generation || state.rfb !== rfb) return;
    window.clearTimeout(state.connectTimer);
    state.retries = 0;
    els.phoneScreen.classList.remove("is-connecting");
    els.phoneScreen.classList.add("is-connected");
    els.reconnectBtn.classList.remove("is-busy");
    els.reconnectBtn.removeAttribute("aria-busy");
    els.reconnectLabel.textContent = "Reconnect";
    setStatus("connected", { host: stream.host });
    startPing();
    try {
      localStorage.setItem(STORAGE_KEY, stream.endpoint);
    } catch {
      /* storage can be unavailable */
    }
    toast("Cloud phone connected");
  });

  rfb.addEventListener("disconnect", (event) => {
    if (generation !== state.generation || state.rfb !== rfb) return;
    const clean = event.detail?.clean;
    state.rfb = null;
    stopPing();
    els.phoneScreen.classList.remove("is-connected", "is-connecting");
    els.reconnectBtn.classList.remove("is-busy");
    els.reconnectBtn.removeAttribute("aria-busy");
    els.reconnectLabel.textContent = "Reconnect";
    window.clearTimeout(state.connectTimer);

    if (state.manualStop) {
      state.manualStop = false;
      setStatus("offline", { host: stream.host });
      setOfflineCard("idle");
      return;
    }

    const message = clean
      ? "The stream was closed. Reconnect whenever you’re ready."
      : "The stream dropped. Check that the VPS and noVNC are still running.";
    setStatus("error", { host: stream.host });
    setOfflineCard("error", message);
    toast(clean ? "Stream closed" : "Stream disconnected", clean ? "info" : "error");
    if (!clean) scheduleRetry();
  });

  rfb.addEventListener("securityfailure", (event) => {
    if (generation !== state.generation) return;
    handleConnectionFailure(
      event.detail?.reason || "The VPS rejected the connection. Check the VNC password or token.",
      generation,
    );
  });

  rfb.addEventListener("credentialsrequired", () => {
    if (generation !== state.generation) return;
    const password = window.prompt("This stream requires a password:");
    if (password == null) {
      state.manualStop = true;
      disconnectRfb();
      return;
    }
    try {
      rfb.sendCredentials({ password });
    } catch {
      /* ignore */
    }
  });

  state.connectTimer = window.setTimeout(() => {
    if (generation !== state.generation || state.status === "connected") return;
    handleConnectionFailure(
      "No response from the VPS. Check the IP, port 6080, and firewall rules.",
      generation,
    );
  }, CONNECT_TIMEOUT);
}

function handleConnectionFailure(message, generation) {
  if (generation != null && generation !== state.generation) return;
  window.clearTimeout(state.connectTimer);
  els.phoneScreen.classList.remove("is-connecting", "is-connected");
  els.reconnectBtn.classList.remove("is-busy");
  els.reconnectBtn.removeAttribute("aria-busy");
  els.reconnectLabel.textContent = "Reconnect";
  setStatus("error", { host: state.host });
  setOfflineCard("error", message);
  toast(message, "error");
  stopPing();
  try {
    disconnectRfb({ silent: true });
  } catch {
    /* ignore */
  }
  scheduleRetry();
}

function disconnectRfb({ silent = false } = {}) {
  const rfb = state.rfb;
  state.rfb = null;
  stopPing();
  if (!rfb) return;
  try {
    rfb.disconnect();
  } catch {
    /* ignore */
  }
  if (!silent) {
    els.phoneScreen.classList.remove("is-connected", "is-connecting");
    setStatus("offline", { host: state.host });
    setOfflineCard("idle");
  }
}

function scheduleRetry() {
  window.clearTimeout(state.retryTimer);
  if (state.retries >= 2 || document.hidden) return;
  const delay = state.retries === 0 ? 5000 : 11000;
  state.retries += 1;
  els.statusHint.textContent = `Retrying in ${Math.round(delay / 1000)}s`;
  state.retryTimer = window.setTimeout(() => {
    if (state.status === "connected" || state.status === "connecting") return;
    connect({ manual: false });
  }, delay);
}

/* ─────────────────────────  device actions  ───────────────────────── */

const KEY_ACTIONS = {
  power: { keysym: 0x1008ff2a, code: "Power", label: "Power key" },
  "volume-up": { keysym: 0x1008ff13, code: "AudioVolumeUp", label: "Volume up" },
  "volume-down": { keysym: 0x1008ff11, code: "AudioVolumeDown", label: "Volume down" },
  home: { keysym: 0xff50, code: "Home", label: "Home" },
  back: { keysym: 0xff1b, code: "Escape", label: "Back" },
  recents: { keysym: 0xff67, code: "ContextMenu", label: "Recent apps" },
};

function flashAction(action) {
  const buttons = document.querySelectorAll(`[data-action="${action}"]`);
  buttons.forEach((button) => {
    button.classList.add("is-pressed");
    window.setTimeout(() => button.classList.remove("is-pressed"), 220);
  });
}

function performAction(action) {
  if (action === "rotate") {
    toggleRotation();
    return;
  }

  const key = KEY_ACTIONS[action];
  if (!key) return;

  flashAction(action);

  if (state.status !== "connected" || !state.rfb) {
    if (action === "power") {
      if (state.status === "connecting") {
        toast("Stream is already connecting…");
      } else {
        toast("Waking the cloud phone…");
        connect({ manual: true });
      }
      return;
    }
    toast("Stream offline — connect to the VPS first", "error");
    return;
  }

  try {
    state.rfb.sendKey(key.keysym, key.code);
    toast(`${key.label} sent`);
  } catch {
    toast("Could not send the key to the device", "error");
  }
}

function toggleRotation() {
  state.landscape = !state.landscape;
  els.rotateButton.classList.toggle("is-active", state.landscape);
  els.rotateButton.setAttribute("aria-pressed", String(state.landscape));
  els.rotateMeta.textContent = state.landscape ? "Landscape" : "Portrait";

  if (state.landscape) {
    els.rotator.classList.add("is-landscape");
    layoutLandscape();
  } else {
    els.rotator.classList.remove("is-landscape");
    els.rotator.style.width = "";
    els.rotator.style.height = "";
    els.phoneShell.style.transform = "";
  }

  window.setTimeout(layoutLandscape, 60);
  toast(state.landscape ? "Screen rotated to landscape" : "Screen rotated to portrait");
}

function layoutLandscape() {
  if (!state.landscape) return;
  const shellWidth = els.phoneShell.offsetWidth;
  const shellHeight = els.phoneShell.offsetHeight;
  if (!shellWidth || !shellHeight) return;

  const desktop = window.innerWidth >= 768;
  const availableWidth = window.innerWidth - (desktop ? 420 : 40);
  const availableHeight = window.innerHeight - 250;
  const scale = Math.max(
    0.3,
    Math.min(availableWidth / shellHeight, availableHeight / shellWidth, 1.04),
  );

  els.rotator.style.width = `${Math.round(shellHeight * scale)}px`;
  els.rotator.style.height = `${Math.round(shellWidth * scale)}px`;
  els.phoneShell.style.transform = `translate(-50%, -50%) rotate(90deg) scale(${scale})`;
}

/* ─────────────────────────  clocks  ───────────────────────── */

function formatTime(date) {
  return new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function tickClock() {
  const now = new Date();
  const time = formatTime(now);
  els.clock.textContent = time;
  els.statusClock.textContent = time;
  els.date.textContent = new Intl.DateTimeFormat([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
}

/* ─────────────────────────  wiring  ───────────────────────── */

els.serverForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.retries = 0;
  connect({ manual: true });
});

els.reconnectBtn.addEventListener("click", () => {
  state.retries = 0;
});

els.serverUrl.addEventListener("focus", () => {
  if (isPlaceholder(els.serverUrl.value)) els.serverUrl.select();
});

els.serverUrl.addEventListener("input", () => {
  const stream = resolveStream(els.serverUrl.value);
  if (stream.host) els.statusHost.textContent = shortHost(stream.host);
});

els.serverUrl.addEventListener("keydown", (event) => {
  if (event.key === "Escape") els.serverUrl.blur();
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => performAction(button.dataset.action));
});

els.offlineAction.addEventListener("click", () => {
  if (state.status === "connecting") {
    state.manualStop = true;
    disconnectRfb();
    return;
  }
  state.retries = 0;
  connect({ manual: true });
});

els.cancelConnect.addEventListener("click", () => {
  state.generation += 1;
  state.retries = 2;
  state.manualStop = true;
  window.clearTimeout(state.retryTimer);
  window.clearTimeout(state.connectTimer);
  disconnectRfb();
  els.phoneScreen.classList.remove("is-connected", "is-connecting");
  els.reconnectBtn.classList.remove("is-busy");
  els.reconnectBtn.removeAttribute("aria-busy");
  els.reconnectLabel.textContent = "Reconnect";
  setStatus("offline", { host: state.host });
  setOfflineCard("idle");
  toast("Connection cancelled");
});

els.viewport.addEventListener("click", () => {
  if (state.status === "connected") state.rfb?.focus();
});

window.addEventListener("resize", () => {
  if (state.landscape) {
    window.requestAnimationFrame(layoutLandscape);
  }
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement) {
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return;
    }
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === "Escape") {
    event.preventDefault();
    performAction("back");
  } else if (event.key === "Home") {
    event.preventDefault();
    performAction("home");
  } else if (event.key.toLowerCase() === "r") {
    performAction("rotate");
  }
});

window.addEventListener("online", () => {
  if (state.status !== "connected" && state.endpoint && !isPlaceholder(state.endpoint)) {
    toast("Network restored — reconnecting");
    state.retries = 0;
    connect({ manual: false });
  }
});

window.addEventListener("offline", () => {
  if (state.status === "connected") toast("Network connection lost", "error");
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.status === "connected") state.pingRun?.();
});

/* ─────────────────────────  boot  ───────────────────────── */

function boot() {
  tickClock();
  window.setInterval(tickClock, 15000);

  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }

  if (saved) {
    els.serverUrl.value = saved;
  }

  const initial = resolveStream(els.serverUrl.value);
  els.statusHost.textContent = shortHost(initial.host || "6080");
  els.connectingHost.textContent = initial.host || "YOUR_VPS_IP:6080";
  setStatus("offline", { host: initial.host });
  setOfflineCard("idle");

  if (saved && !isPlaceholder(saved) && initial.wsUrl && !initial.mixedContent) {
    window.setTimeout(() => connect({ manual: false }), 700);
  }
}

boot();
