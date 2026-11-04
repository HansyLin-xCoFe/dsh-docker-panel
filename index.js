/**
 * dsh-docker-panel — Host half.
 *
 * Discovers the local Docker containers and exposes a tiny JSON API to this
 * package's client half:
 *
 *   GET  /dsh-docker-panel/list           container list with published web URL
 *   POST /dsh-docker-panel/start          { name } -> docker start + wait
 *   POST /dsh-docker-panel/desktop/start  launch Docker Desktop when the daemon is down
 *
 * Every route is same-origin and loopback-only. The client half is the only
 * intended caller.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROUTES = {
  list: '/dsh-docker-panel/list',
  start: '/dsh-docker-panel/start',
  desktopStart: '/dsh-docker-panel/desktop/start',
};

const DOCKER_TIMEOUT_MS = 10_000;
const START_TIMEOUT_MS = 15_000;
const READY_TIMEOUT_MS = 25_000;
const MAX_BUFFER = 4 * 1024 * 1024;
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

/** Ports that usually serve a web page; used to pick one URL per container. */
const WEB_PORT_PREFERENCE = [80, 8080, 8000, 8888, 3000, 5000, 9000, 7860, 3001, 8096, 5173, 4173];

/** Friendly names for containers whose image has no usable title label. */
const KNOWN_TITLES = {
  libretv: 'LibreTV',
  searxng: 'SearXNG',
  sillytavern: 'SillyTavern',
};

const DOCKER_CANDIDATES = (() => {
  const candidates = [];
  if (process.env.DSH_DOCKER_BIN) candidates.push(process.env.DSH_DOCKER_BIN);
  candidates.push('docker');
  if (process.platform === 'win32') {
    const roots = [process.env.ProgramFiles, process.env.ProgramW6432, 'C:\\Program Files'];
    for (const root of roots) {
      if (root) candidates.push(join(root, 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'));
    }
  } else {
    candidates.push('/usr/local/bin/docker', '/usr/bin/docker', '/opt/homebrew/bin/docker');
  }
  return [...new Set(candidates)];
})();

let resolvedDocker = null;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimDetail(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 400 ? `${text.slice(0, 397)}...` : text;
}

function describeError(error) {
  if (error instanceof Error) return trimDetail(error.message);
  return trimDetail(error);
}

function methodNotAllowed(response, allow) {
  sendJson(response, 405, { ok: false, error: { code: 'method_not_allowed', message: `Use ${allow}.` } }, { allow });
}

function sendJson(response, status, payload, extraHeaders = {}) {
  if (response.writableEnded) return;
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  response.end(body);
}

function loopbackAuthority(host) {
  if (typeof host !== 'string' || host === '') return false;
  let hostname;
  try {
    hostname = new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1';
}

function loopbackPeer(request) {
  const address = request.socket?.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function forwardedRequest(request) {
  return Boolean(request.headers['forwarded'] ?? request.headers['x-forwarded-for'] ?? request.headers['x-real-ip']);
}

function trustedRequest(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!loopbackPeer(request) || forwardedRequest(request) || !loopbackAuthority(host)) return false;
  if (typeof origin !== 'string' || origin === '') return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function readJsonBody(request, limit = 8192) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// ---------------------------------------------------------------------------
// Docker access
// ---------------------------------------------------------------------------

async function execDocker(args, timeout) {
  const candidates = resolvedDocker === null ? DOCKER_CANDIDATES : [resolvedDocker];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const result = await execFileAsync(candidate, args, {
        timeout,
        windowsHide: true,
        maxBuffer: MAX_BUFFER,
        encoding: 'utf8',
      });
      resolvedDocker = candidate;
      return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
    } catch (error) {
      lastError = error;
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  throw lastError ?? new Error('docker command was not found.');
}

function classifyDockerError(error) {
  const stderr = trimDetail(error?.stderr);
  const message = stderr || describeError(error) || 'docker command failed.';
  if (error?.code === 'ENOENT') return { code: 'docker_not_installed', message };
  if (error?.killed === true || error?.signal === 'SIGTERM') return { code: 'docker_timeout', message };
  if (
    /failed to connect|error during connect|docker daemon|dockerDesktopLinuxEngine|cannot find the file specified|open \/\/\.\/pipe|the system cannot find the file specified|is the docker daemon running/i.test(
      message,
    )
  ) {
    return { code: 'docker_daemon_down', message };
  }
  return { code: 'docker_error', message };
}

function parseLabels(raw) {
  const labels = {};
  if (typeof raw !== 'string') return labels;
  for (const pair of raw.split(',')) {
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    labels[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }
  return labels;
}

function parsePorts(raw) {
  const ports = [];
  if (typeof raw !== 'string') return ports;
  const pattern = /(\d+)->(\d+)\/(tcp|udp)/g;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    ports.push({ host: Number(match[1]), container: Number(match[2]), protocol: match[3] });
  }
  return ports;
}

function chooseWebPort(ports) {
  const tcp = ports.filter((port) => port.protocol === 'tcp');
  if (tcp.length === 0) return null;
  for (const preferred of WEB_PORT_PREFERENCE) {
    const match = tcp.find((port) => port.container === preferred);
    if (match) return match;
  }
  return tcp[0];
}

function prettify(value) {
  const words = String(value ?? '')
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(' ') : 'Docker Container';
}

function containerTitle(name, image, labels) {
  const byName = KNOWN_TITLES[name.toLowerCase()];
  if (byName) return byName;
  const imageBase = image.split('/').pop()?.split(':')[0] ?? '';
  const byImage = KNOWN_TITLES[imageBase.toLowerCase()];
  if (byImage) return byImage;
  const title = labels['org.opencontainers.image.title'];
  if (typeof title === 'string' && title.trim() !== '') return title.trim();
  return prettify(name);
}

function toContainer(raw) {
  const name = typeof raw?.Names === 'string' ? raw.Names.split(',')[0].trim() : '';
  if (name === '') return null;
  const image = typeof raw.Image === 'string' ? raw.Image : '';
  const labels = parseLabels(raw.Labels);
  const state = String(raw.State ?? '').toLowerCase();
  const ports = parsePorts(raw.Ports);
  const webPort = chooseWebPort(ports);
  const url = webPort === null ? null : `${webPort.container === 443 ? 'https' : 'http'}://localhost:${webPort.host}/`;
  return {
    id: typeof raw.ID === 'string' ? raw.ID : name,
    name,
    title: containerTitle(name, image, labels),
    image,
    state,
    running: state === 'running',
    status: typeof raw.Status === 'string' ? raw.Status : '',
    ports,
    hostPort: webPort === null ? null : webPort.host,
    containerPort: webPort === null ? null : webPort.container,
    url,
    composeProject: labels['com.docker.compose.project'] ?? null,
    composeService: labels['com.docker.compose.service'] ?? null,
    description: labels['org.opencontainers.image.description'] ?? '',
  };
}

async function listContainers() {
  let output;
  try {
    output = await execDocker(['ps', '-a', '--no-trunc', '--format', '{{json .}}'], DOCKER_TIMEOUT_MS);
  } catch (error) {
    return { ok: false, error: classifyDockerError(error), containers: [] };
  }

  const containers = [];
  for (const line of String(output.stdout).split(/\r?\n/)) {
    const text = line.trim();
    if (text === '') continue;
    try {
      const container = toContainer(JSON.parse(text));
      if (container) containers.push(container);
    } catch {
      // A malformed row from a third-party Docker wrapper: skip it rather than
      // failing the whole list.
    }
  }

  containers.sort((left, right) => {
    if (left.running !== right.running) return left.running ? -1 : 1;
    return left.title.localeCompare(right.title);
  });

  return { ok: true, containers, fetchedAt: new Date().toISOString() };
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(800);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function waitForContainer(name, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastContainer = null;
  while (Date.now() < deadline) {
    const listing = await listContainers();
    if (listing.ok) {
      const found = listing.containers.find((container) => container.name === name);
      if (found) {
        lastContainer = found;
        if (found.running && found.hostPort === null) return { container: found, ready: true };
        if (found.running && (await portOpen(found.hostPort))) return { container: found, ready: true };
      }
    }
    await delay(500);
  }
  return { container: lastContainer, ready: false };
}

function dockerDesktopExecutable() {
  if (process.platform === 'win32') {
    const roots = [process.env.ProgramFiles, process.env.ProgramW6432, 'C:\\Program Files'];
    for (const root of roots) {
      if (!root) continue;
      const candidate = join(root, 'Docker', 'Docker', 'Docker Desktop.exe');
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }
  if (process.platform === 'darwin') {
    return existsSync('/Applications/Docker.app') ? '/Applications/Docker.app' : null;
  }
  return null;
}

function launchDockerDesktop() {
  if (process.platform === 'win32') {
    const executable = dockerDesktopExecutable();
    if (!executable) {
      return { ok: false, error: { code: 'desktop_not_found', message: 'Docker Desktop.exe was not found.' } };
    }
    try {
      const child = spawn(executable, [], { detached: true, stdio: 'ignore', windowsHide: false });
      child.on('error', () => {});
      child.unref();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: { code: 'desktop_failed', message: describeError(error) } };
    }
  }
  if (process.platform === 'darwin') {
    if (!existsSync('/Applications/Docker.app')) {
      return { ok: false, error: { code: 'desktop_not_found', message: 'Docker.app was not found.' } };
    }
    try {
      const child = spawn('open', ['-a', 'Docker'], { detached: true, stdio: 'ignore' });
      child.on('error', () => {});
      child.unref();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: { code: 'desktop_failed', message: describeError(error) } };
    }
  }
  return {
    ok: false,
    error: { code: 'desktop_not_found', message: 'Automatic Docker Desktop launch is only supported on Windows and macOS.' },
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function handleList(request, response) {
  if (!trustedRequest(request)) {
    sendJson(response, 403, { ok: false, error: { code: 'forbidden', message: 'Loopback access only.' } });
    return;
  }
  if (request.method !== 'GET') {
    methodNotAllowed(response, 'GET');
    return;
  }
  const listing = await listContainers();
  sendJson(response, 200, listing);
}

async function handleStart(request, response) {
  if (!trustedRequest(request)) {
    sendJson(response, 403, { ok: false, error: { code: 'forbidden', message: 'Loopback access only.' } });
    return;
  }
  if (request.method !== 'POST') {
    methodNotAllowed(response, 'POST');
    return;
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    sendJson(response, 400, { ok: false, error: { code: 'bad_request', message: describeError(error) } });
    return;
  }
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!NAME_PATTERN.test(name)) {
    sendJson(response, 400, { ok: false, error: { code: 'bad_request', message: 'Invalid container name.' } });
    return;
  }

  try {
    await execDocker(['start', name], START_TIMEOUT_MS);
  } catch (error) {
    sendJson(response, 200, { ok: false, error: classifyDockerError(error) });
    return;
  }

  try {
    const waited = await waitForContainer(name, READY_TIMEOUT_MS);
    sendJson(response, 200, { ok: true, container: waited.container, ready: waited.ready });
  } catch (error) {
    sendJson(response, 200, { ok: true, container: null, ready: false, error: classifyDockerError(error) });
  }
}

async function handleDesktopStart(request, response) {
  if (!trustedRequest(request)) {
    sendJson(response, 403, { ok: false, error: { code: 'forbidden', message: 'Loopback access only.' } });
    return;
  }
  if (request.method !== 'POST') {
    methodNotAllowed(response, 'POST');
    return;
  }
  const result = launchDockerDesktop();
  sendJson(response, 200, result);
}

function handler(route) {
  return (request, response) => {
    route(request, response).catch((error) => {
      sendJson(response, 500, { ok: false, error: { code: 'docker_error', message: describeError(error) } });
    });
  };
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

const inject = ['webServer'];

function apply(ctx) {
  ctx.inject(['webServer'], (hostCtx) => {
    hostCtx.effect(() => {
      const disposers = [
        hostCtx.webServer.register({ kind: 'exact', path: ROUTES.list, handler: handler(handleList) }),
        hostCtx.webServer.register({ kind: 'exact', path: ROUTES.start, handler: handler(handleStart) }),
        hostCtx.webServer.register({ kind: 'exact', path: ROUTES.desktopStart, handler: handler(handleDesktopStart) }),
      ];
      return () => {
        for (const dispose of disposers.splice(0)) {
          try {
            dispose();
          } catch {
            // The host is already tearing down this generation.
          }
        }
      };
    }, 'dsh-docker-panel: docker routes');
  });
}

export { apply, inject };
