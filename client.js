window.__ModuleLoader__.load({
  id: 'dsh-docker-panel',
  factory(require) {
    const React = require('react');
    const { useEffect, useRef, useSyncExternalStore } = React;
    const h = React.createElement;

    const NS = 'dsh-docker';
    const ENDPOINT = '/dsh-docker-panel';
    const STYLE_ID = 'dsh-docker-panel/styles';
    const AUTO_REFRESH_MS = 20000;
    const CLOSE_ANIMATION_MS = 170;
    const DESKTOP_BOOT_TIMEOUT_MS = 150000;

    // -----------------------------------------------------------------------
    // Copy
    // -----------------------------------------------------------------------

    const zh = {
      'entry.label': 'Docker',
      'entry.aria': '打开 Docker 服务面板',
      'window.title': 'Docker 服务',
      'window.subtitle': '{total} 个容器 · {running} 个运行中',
      'window.aria': 'Docker 服务快捷面板',
      'action.refresh': '刷新',
      'action.close': '关闭',
      'action.retry': '重试',
      'action.startDocker': '启动 Docker Desktop',
      'action.open': '打开',
      'action.start': '启动并打开',
      'action.starting': '启动中…',
      'action.dismiss': '知道了',
      'status.running': '运行中',
      'status.stopped': '已停止',
      'card.noPort': '未映射端口',
      'empty.title': '还没有 Docker 容器',
      'empty.hint': '用 docker run 或 docker compose 创建容器后，这里会自动出现快捷入口。',
      'error.title': '无法读取 Docker 容器',
      'error.notInstalled': '没有找到 docker 命令，请先安装 Docker Desktop 或 Docker Engine。',
      'error.daemonDown': 'Docker 守护进程没有运行，启动 Docker Desktop 后即可自动发现容器。',
      'error.timeout': 'docker 命令响应超时，请稍后重试。',
      'error.desktopNotFound': '没有找到 Docker Desktop，请手动启动它后重试。',
      'error.desktopFailed': '启动 Docker Desktop 失败：{message}',
      'error.startFailed': '启动容器失败：{message}',
      'error.noUrl': '这个容器没有发布网页端口，无法打开。',
      'error.generic': '{message}',
      'error.unknown': '读取失败，请稍后重试。',
      'pending.blocked': '{name} 已启动，但浏览器拦截了新标签页。',
      'pending.open': '打开网页',
      'desktop.starting': '正在启动 Docker Desktop，首次启动可能需要 30 秒…',
      'desktop.hint': '启动后会自动刷新容器列表。',
      'loading': '正在读取容器…',
      'footer.hint': '自动发现本机 Docker 容器 · 每 20 秒刷新一次',
    };

    const en = {
      'entry.label': 'Docker',
      'entry.aria': 'Open the Docker services panel',
      'window.title': 'Docker services',
      'window.subtitle': '{total} containers · {running} running',
      'window.aria': 'Docker services quick-launch panel',
      'action.refresh': 'Refresh',
      'action.close': 'Close',
      'action.retry': 'Retry',
      'action.startDocker': 'Start Docker Desktop',
      'action.open': 'Open',
      'action.start': 'Start & open',
      'action.starting': 'Starting…',
      'action.dismiss': 'Dismiss',
      'status.running': 'running',
      'status.stopped': 'stopped',
      'card.noPort': 'No published port',
      'empty.title': 'No Docker containers yet',
      'empty.hint': 'Create one with docker run or docker compose and its shortcut will appear here automatically.',
      'error.title': 'Could not read Docker containers',
      'error.notInstalled': 'The docker command was not found. Install Docker Desktop or Docker Engine first.',
      'error.daemonDown': 'The Docker daemon is not running. Start Docker Desktop and containers will appear automatically.',
      'error.timeout': 'The docker command timed out. Try again in a moment.',
      'error.desktopNotFound': 'Docker Desktop was not found. Start it manually and retry.',
      'error.desktopFailed': 'Could not start Docker Desktop: {message}',
      'error.startFailed': 'Could not start the container: {message}',
      'error.noUrl': 'This container has no published web port to open.',
      'error.generic': '{message}',
      'error.unknown': 'Something went wrong. Try again in a moment.',
      'pending.blocked': '{name} is starting, but the browser blocked the new tab.',
      'pending.open': 'Open page',
      'desktop.starting': 'Starting Docker Desktop. The first launch can take about 30 seconds…',
      'desktop.hint': 'The container list refreshes automatically once it is up.',
      'loading': 'Reading containers…',
      'footer.hint': 'Auto-discovered from local Docker · refreshes every 20s',
    };

    // -----------------------------------------------------------------------
    // Styles
    // -----------------------------------------------------------------------

    const CSS = [
      '.ddp-entry{display:flex;align-items:center;gap:8px;width:100%;height:42px;min-width:0;padding:0 10px;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:13px;text-align:left;transition:background .15s ease,color .15s ease}',
      '.ddp-entry:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.ddp-entry:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.ddp-entry-icon{flex:none;width:18px;height:18px;display:block}',
      '.ddp-entry-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ddp-backdrop{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb, var(--dsw-alias-bg-base) 45%, transparent);-webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px);animation:ddp-backdrop-in .18s ease-out;pointer-events:auto}',
      '.ddp-backdrop.ddp-closing{animation:ddp-backdrop-out .16s ease-in forwards}',
      '.ddp-window{display:flex;flex-direction:column;width:min(680px,100%);max-height:min(660px,calc(100vh - 96px));overflow:hidden;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:18px;box-shadow:0 24px 64px color-mix(in srgb, #000 28%, transparent),0 2px 10px color-mix(in srgb, #000 12%, transparent);transform-origin:center;animation:ddp-window-in .26s cubic-bezier(.18,.9,.24,1.05)}',
      '.ddp-window.ddp-is-closing{animation:ddp-window-out .16s ease-in forwards}',
      '.ddp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 18px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.ddp-brand{display:flex;align-items:center;gap:11px;min-width:0}',
      '.ddp-brand-tile{flex:none;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:11px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);color:var(--dsw-alias-brand-primary)}',
      '.ddp-brand-icon{width:20px;height:20px;display:block}',
      '.ddp-brand-text{min-width:0}',
      '.ddp-title{margin:0;font-size:15px;font-weight:600;line-height:1.35;color:var(--dsw-alias-label-primary)}',
      '.ddp-subtitle{margin:3px 0 0;font-size:12px;line-height:1.4;color:var(--dsw-alias-label-secondary)}',
      '.ddp-head-actions{display:flex;align-items:center;gap:4px;flex:none}',
      '.ddp-icon-btn{display:flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .15s ease,color .15s ease}',
      '.ddp-icon-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.ddp-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.ddp-icon-btn:disabled{cursor:default;opacity:.55}',
      '.ddp-icon-btn svg{width:16px;height:16px;display:block}',
      '.ddp-icon-btn.ddp-spin svg{animation:ddp-spin .9s linear infinite}',
      '.ddp-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:14px 18px 16px}',
      '.ddp-banners{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}',
      '.ddp-banner{display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:1.45;color:var(--dsw-alias-label-secondary)}',
      '.ddp-banner-error{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 34%, var(--dsw-alias-border-l1))}',
      '.ddp-banner-warn{border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 34%, var(--dsw-alias-border-l1))}',
      '.ddp-banner-text{flex:1;min-width:0;text-align:left}',
      '.ddp-banner .ddp-btn{flex:none}',
      '.ddp-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);display:inline-block}',
      '.ddp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}',
      '.ddp-card{display:flex;flex-direction:column;align-items:stretch;gap:9px;min-width:0;padding:13px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit;text-align:left;cursor:pointer;animation:ddp-card-in .3s cubic-bezier(.2,.8,.2,1) backwards;transition:border-color .16s ease,background .16s ease,transform .16s ease,box-shadow .16s ease}',
      '.ddp-card:hover{border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 42%, var(--dsw-alias-border-l1));transform:translateY(-2px);box-shadow:0 8px 22px color-mix(in srgb, #000 14%, transparent)}',
      '.ddp-card:active{transform:translateY(0) scale(.992)}',
      '.ddp-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.ddp-card.is-busy{pointer-events:none;opacity:.8}',
      '.ddp-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.ddp-card-tile{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);color:var(--dsw-alias-brand-primary)}',
      '.ddp-card.is-stopped .ddp-card-tile{background:color-mix(in srgb, var(--dsw-alias-label-secondary) 10%, transparent);color:var(--dsw-alias-label-secondary)}',
      '.ddp-card-icon{width:16px;height:16px;display:block}',
      '.ddp-status{display:inline-flex;align-items:center;gap:5px;font-size:11px;line-height:1;color:var(--dsw-alias-label-secondary)}',
      '.ddp-card.is-running .ddp-dot{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent)}',
      '.ddp-card-title{font-size:13px;font-weight:600;line-height:1.35;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ddp-card-desc{font-size:11px;line-height:1.35;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ddp-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:1px;padding-top:9px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.ddp-card-url{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.ddp-card-action{flex:none;display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--dsw-alias-brand-primary)}',
      '.ddp-spinner{width:13px;height:13px;border-radius:50%;border:2px solid color-mix(in srgb, var(--dsw-alias-label-secondary) 30%, transparent);border-top-color:var(--dsw-alias-label-secondary);animation:ddp-spin .8s linear infinite}',
      '.ddp-spinner-small{width:10px;height:10px;border-width:1.5px;border-top-color:var(--dsw-alias-brand-primary)}',
      '.ddp-state{display:flex;flex-direction:column;align-items:center;gap:8px;padding:34px 16px 30px;text-align:center}',
      '.ddp-state-icon{display:flex;align-items:center;justify-content:center;width:44px;height:44px;margin-bottom:2px;border-radius:14px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.ddp-state-icon svg{width:22px;height:22px;display:block}',
      '.ddp-state-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.ddp-state-text{max-width:400px;margin:0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary)}',
      '.ddp-state-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:10px}',
      '.ddp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:500;cursor:pointer;transition:background .15s ease,border-color .15s ease}',
      '.ddp-btn:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.ddp-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.ddp-btn-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:#fff}',
      '.ddp-btn-primary:hover{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 86%, #000)}',
      '.ddp-btn-ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary);padding:0 6px;height:26px;font-size:11px}',
      '.ddp-btn-ghost:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.ddp-skeleton{height:112px;border-radius:14px;background:linear-gradient(100deg,var(--dsw-alias-bg-layer-2) 30%,color-mix(in srgb, var(--dsw-alias-label-secondary) 10%, var(--dsw-alias-bg-layer-2)) 50%,var(--dsw-alias-bg-layer-2) 70%);background-size:220% 100%;animation:ddp-shimmer 1.4s ease-in-out infinite}',
      '.ddp-progress{display:flex;flex-direction:column;align-items:center;gap:9px;padding:44px 18px 40px;text-align:center}',
      '.ddp-progress .ddp-spinner{width:22px;height:22px;border-width:2.5px}',
      '.ddp-progress-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.ddp-progress-text{max-width:380px;margin:0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary)}',
      '.ddp-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 18px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.ddp-foot-hint{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '@keyframes ddp-backdrop-in{from{opacity:0}to{opacity:1}}',
      '@keyframes ddp-backdrop-out{from{opacity:1}to{opacity:0}}',
      '@keyframes ddp-window-in{from{opacity:0;transform:translateY(14px) scale(.9)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes ddp-window-out{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(6px) scale(.94)}}',
      '@keyframes ddp-card-in{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes ddp-spin{to{transform:rotate(360deg)}}',
      '@keyframes ddp-shimmer{from{background-position:120% 0}to{background-position:-120% 0}}',
      '@media (max-width:560px){.ddp-backdrop{padding:12px}.ddp-grid{grid-template-columns:minmax(0,1fr)}.ddp-window{max-height:calc(100vh - 32px);border-radius:15px}.ddp-head,.ddp-body,.ddp-foot{padding-left:14px;padding-right:14px}}',
      '@media (prefers-reduced-motion:reduce){.ddp-backdrop,.ddp-window,.ddp-card,.ddp-skeleton,.ddp-spinner,.ddp-icon-btn.ddp-spin svg{animation:none!important}.ddp-entry,.ddp-card,.ddp-btn,.ddp-icon-btn{transition:none!important}}',
    ].join('\n');

    function installStyles() {
      const selector = 'style[data-plugin-css="' + STYLE_ID + '"]';
      for (const existing of document.querySelectorAll(selector)) existing.remove();
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-docker-panel';
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => tag.remove();
    }

    // -----------------------------------------------------------------------
    // Icons
    // -----------------------------------------------------------------------

    function DockerGlyph(props) {
      return h(
        'svg',
        {
          className: props.className,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        h('rect', { x: 3.4, y: 4.2, width: 7.4, height: 6.1, rx: 1.8 }),
        h('rect', { x: 13.2, y: 4.2, width: 7.4, height: 6.1, rx: 1.8 }),
        h('rect', { x: 8.3, y: 12.1, width: 7.4, height: 6.1, rx: 1.8 }),
        h('path', { d: 'M3.4 21h17.2', opacity: 0.55 }),
      );
    }

    function RefreshGlyph() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'M20 11a8 8 0 1 0-2.3 5.7' }),
        h('path', { d: 'M20 4.5V11h-6.5' }),
      );
    }

    function CloseGlyph() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'M6 6l12 12M18 6L6 18' }),
      );
    }

    function AlertGlyph() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'M12 4.2 3.6 19h16.8L12 4.2Z' }),
        h('path', { d: 'M12 9.4v4.4M12 16.6v.1' }),
      );
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function errorMessage(error) {
      if (error instanceof Error) return error.message;
      return String(error ?? '');
    }

    function normalizeError(error) {
      if (!error) return { code: 'generic', message: '' };
      if (typeof error === 'string') return { code: 'generic', message: error };
      return {
        code: typeof error.code === 'string' ? error.code : 'generic',
        message: typeof error.message === 'string' ? error.message : '',
      };
    }

    function errorText(t, error) {
      const code = error?.code ?? 'generic';
      const message = error?.message ?? '';
      if (code === 'docker_not_installed') return t('error.notInstalled');
      if (code === 'docker_daemon_down') return t('error.daemonDown');
      if (code === 'docker_timeout') return t('error.timeout');
      if (code === 'desktop_not_found') return t('error.desktopNotFound');
      if (code === 'desktop_failed') return t('error.desktopFailed', { message: message || t('error.unknown') });
      if (code === 'start_failed') return t('error.startFailed', { message: message || t('error.unknown') });
      if (code === 'no_url') return t('error.noUrl');
      if (code === 'docker_error' || code === 'generic' || code === 'internal') {
        return message ? t('error.generic', { message }) : t('error.unknown');
      }
      return message ? t('error.generic', { message }) : t('error.unknown');
    }

    function hostLabel(url) {
      return String(url).replace(/^https?:\/\//, '').replace(/\/$/, '');
    }

    function replaceContainer(containers, next) {
      if (!next) return containers;
      const key = next.name;
      let found = false;
      const result = containers.map((container) => {
        if (container.name !== key) return container;
        found = true;
        return next;
      });
      if (!found) result.push(next);
      return result;
    }

    // -----------------------------------------------------------------------
    // Store
    // -----------------------------------------------------------------------

    function createStore() {
      let state = {
        open: false,
        phase: 'closed',
        loading: false,
        refreshing: false,
        containers: [],
        error: null,
        fetchedAt: 0,
        dockerStarting: false,
        busyName: null,
        startError: null,
        pendingUrl: null,
      };
      let closeTimer = null;
      let refreshTimer = null;
      let loadSeq = 0;
      let disposed = false;
      const listeners = new Set();

      const emit = () => {
        if (disposed) return;
        for (const listener of [...listeners]) {
          try {
            listener();
          } catch {
            // A broken subscriber must not stop the others.
          }
        }
      };

      const set = (patch) => {
        state = { ...state, ...patch };
        emit();
      };

      const snapshot = () => state;

      async function requestJson(path, options = {}) {
        const headers = { accept: 'application/json' };
        let body;
        if (options.body !== undefined) {
          headers['content-type'] = 'application/json';
          body = options.body;
        }
        const response = await fetch(ENDPOINT + path, {
          method: options.method || 'GET',
          headers,
          body,
          cache: 'no-store',
          credentials: 'same-origin',
        });
        let data = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }
        if (!response.ok) {
          const detail = data?.error;
          const message = typeof detail === 'string' ? detail : detail?.message || `HTTP ${response.status}`;
          const failure = new Error(message);
          failure.code = typeof detail?.code === 'string' ? detail.code : 'generic';
          throw failure;
        }
        return data ?? {};
      }

      async function load(initial) {
        if (disposed || state.loading || state.refreshing || state.dockerStarting) return;
        const seq = ++loadSeq;
        set(initial ? { loading: true, error: null } : { refreshing: true });
        try {
          const data = await requestJson('/list');
          if (disposed || seq !== loadSeq) return;
          if (!data || data.ok === false) {
            set({ loading: false, refreshing: false, error: normalizeError(data?.error) });
            return;
          }
          set({
            loading: false,
            refreshing: false,
            error: null,
            fetchedAt: Date.now(),
            containers: Array.isArray(data.containers) ? data.containers : [],
          });
        } catch (error) {
          if (disposed || seq !== loadSeq) return;
          set({ loading: false, refreshing: false, error: { code: 'generic', message: errorMessage(error) } });
        }
      }

      function startAutoRefresh() {
        stopAutoRefresh();
        refreshTimer = setInterval(() => {
          if (state.open && state.phase === 'open' && document.visibilityState === 'visible' && !state.dockerStarting) {
            load(false);
          }
        }, AUTO_REFRESH_MS);
      }

      function stopAutoRefresh() {
        if (refreshTimer !== null) {
          clearInterval(refreshTimer);
          refreshTimer = null;
        }
      }

      const onVisibility = () => {
        if (document.visibilityState === 'visible' && state.open && state.phase === 'open' && !state.dockerStarting) {
          load(false);
        }
      };
      document.addEventListener('visibilitychange', onVisibility);

      function open() {
        if (disposed) return;
        if (closeTimer !== null) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }
        if (state.open) {
          set({ phase: 'open' });
          if (!state.loading && !state.refreshing) load(false);
          return;
        }
        set({ open: true, phase: 'open', startError: null, pendingUrl: null });
        startAutoRefresh();
        load(state.fetchedAt === 0);
      }

      function requestClose() {
        if (!state.open || state.phase === 'closing') return;
        set({ phase: 'closing' });
        stopAutoRefresh();
        closeTimer = setTimeout(() => {
          closeTimer = null;
          if (disposed) return;
          set({ open: false, phase: 'closed', startError: null, pendingUrl: null });
        }, CLOSE_ANIMATION_MS);
      }

      function toggle() {
        if (state.open && state.phase !== 'closing') requestClose();
        else open();
      }

      function refresh() {
        if (disposed) return;
        load(false);
      }

      function clearStartError() {
        set({ startError: null });
      }

      async function startDockerDesktop() {
        if (disposed || state.dockerStarting) return;
        set({ dockerStarting: true, error: null, startError: null });
        try {
          const started = await requestJson('/desktop/start', { method: 'POST', body: '{}' });
          if (!started || started.ok === false) {
            set({ dockerStarting: false, error: normalizeError(started?.error) });
            return;
          }
        } catch (error) {
          set({ dockerStarting: false, error: { code: 'desktop_failed', message: errorMessage(error) } });
          return;
        }

        const deadline = Date.now() + DESKTOP_BOOT_TIMEOUT_MS;
        while (Date.now() < deadline && !disposed) {
          if (!state.open) {
            set({ dockerStarting: false });
            return;
          }
          await delay(2000);
          try {
            const data = await requestJson('/list');
            if (data && data.ok) {
              set({
                dockerStarting: false,
                error: null,
                fetchedAt: Date.now(),
                containers: Array.isArray(data.containers) ? data.containers : [],
              });
              return;
            }
          } catch {
            // The daemon is still booting; keep polling.
          }
        }
        if (!disposed) set({ dockerStarting: false, error: { code: 'docker_timeout', message: '' } });
      }

      async function startAndOpen(container, tab) {
        set({ busyName: container.name, startError: null, pendingUrl: null });
        try {
          const data = await requestJson('/start', { method: 'POST', body: JSON.stringify({ name: container.name }) });
          if (!data || data.ok === false) {
            if (tab && !tab.closed) tab.close();
            set({ busyName: null, startError: normalizeError(data?.error) });
            return;
          }
          const updated = data.container ? { ...data.container } : { ...container, running: true };
          const url = updated.url || container.url;
          if (!url) {
            if (tab && !tab.closed) tab.close();
            set({ busyName: null, startError: { code: 'no_url', message: '' } });
            return;
          }
          set({ busyName: null, containers: replaceContainer(state.containers, updated) });
          let navigated = false;
          if (tab && !tab.closed) {
            try {
              tab.location.href = url;
              navigated = true;
            } catch {
              navigated = false;
            }
          }
          if (navigated) {
            requestClose();
          } else {
            if (tab && !tab.closed) tab.close();
            set({ pendingUrl: { name: updated.title || container.title || container.name, url } });
          }
          load(false);
        } catch (error) {
          if (tab && !tab.closed) tab.close();
          set({ busyName: null, startError: { code: 'start_failed', message: errorMessage(error) } });
        }
      }

      function openContainer(container) {
        if (!container || disposed || state.busyName !== null) return;
        if (!container.url) {
          set({ startError: { code: 'no_url', message: '' } });
          return;
        }
        if (container.running) {
          window.open(container.url, '_blank', 'noopener,noreferrer');
          requestClose();
          return;
        }
        let tab = null;
        try {
          tab = window.open('about:blank', '_blank');
        } catch {
          tab = null;
        }
        if (tab) {
          try {
            tab.opener = null;
          } catch {
            // Cross-origin restrictions do not apply to about:blank, but stay safe.
          }
        }
        startAndOpen(container, tab);
      }

      function openPending() {
        const pending = state.pendingUrl;
        if (!pending || disposed) return;
        window.open(pending.url, '_blank', 'noopener,noreferrer');
        set({ pendingUrl: null });
        requestClose();
      }

      function dispose() {
        disposed = true;
        stopAutoRefresh();
        if (closeTimer !== null) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }
        document.removeEventListener('visibilitychange', onVisibility);
        listeners.clear();
      }

      return {
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        getSnapshot: snapshot,
        open,
        toggle,
        requestClose,
        refresh,
        startDockerDesktop,
        openContainer,
        openPending,
        clearStartError,
        dispose,
      };
    }

    // -----------------------------------------------------------------------
    // UI
    // -----------------------------------------------------------------------

    function DockerEntry({ wide, t, store }) {
      const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
      if (!wide) return null;
      return h(
        'button',
        {
          type: 'button',
          className: 'ddp-entry',
          title: t('entry.aria'),
          'aria-label': t('entry.aria'),
          'aria-haspopup': 'dialog',
          'aria-expanded': state.open,
          onClick: () => store.toggle(),
        },
        h(DockerGlyph, { className: 'ddp-entry-icon' }),
        h('span', { className: 'ddp-entry-label' }, t('entry.label')),
      );
    }

    function ContainerCard({ container, t, store, index, busy }) {
      const running = Boolean(container.running);
      const actionLabel = busy ? t('action.starting') : !container.url ? t('card.noPort') : running ? t('action.open') : t('action.start');
      return h(
        'button',
        {
          type: 'button',
          className: 'ddp-card ' + (running ? 'is-running' : 'is-stopped') + (busy ? ' is-busy' : ''),
          style: { animationDelay: String(Math.min(index, 8) * 35) + 'ms' },
          onClick: () => store.openContainer(container),
          'aria-label': container.title + ', ' + (running ? t('status.running') : t('status.stopped')),
        },
        h(
          'span',
          { className: 'ddp-card-head' },
          h('span', { className: 'ddp-card-tile' }, h(DockerGlyph, { className: 'ddp-card-icon' })),
          h('span', { className: 'ddp-status' }, h('span', { className: 'ddp-dot' }), running ? t('status.running') : t('status.stopped')),
        ),
        h('span', { className: 'ddp-card-title' }, container.title),
        h('span', { className: 'ddp-card-desc' }, container.image || container.name),
        h(
          'span',
          { className: 'ddp-card-foot' },
          h('span', { className: 'ddp-card-url' }, container.url ? hostLabel(container.url) : t('card.noPort')),
          h('span', { className: 'ddp-card-action' }, busy ? h('span', { className: 'ddp-spinner ddp-spinner-small' }) : null, actionLabel),
        ),
      );
    }

    function SkeletonGrid() {
      return h(
        'div',
        { className: 'ddp-grid' },
        [0, 1, 2, 3].map((index) => h('div', { key: index, className: 'ddp-skeleton' })),
      );
    }

    function DockerWindow({ t, store }) {
      const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
      const closeRef = useRef(null);

      useEffect(() => {
        if (!state.open) return undefined;
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            store.requestClose();
          }
        };
        window.addEventListener('keydown', onKeyDown, true);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const focusTimer = window.setTimeout(() => {
          closeRef.current?.focus?.();
        }, 80);
        return () => {
          window.removeEventListener('keydown', onKeyDown, true);
          document.body.style.overflow = previousOverflow;
          window.clearTimeout(focusTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [state.open, store]);

      if (!state.open) return null;

      const closing = state.phase === 'closing';
      const runningCount = state.containers.filter((container) => container.running).length;
      const subtitle =
        state.loading && state.fetchedAt === 0
          ? t('loading')
          : t('window.subtitle', { total: state.containers.length, running: runningCount });

      const retryButton = h(
        'button',
        { type: 'button', className: 'ddp-btn', onClick: () => store.refresh(), disabled: state.loading || state.refreshing || state.dockerStarting },
        t('action.retry'),
      );

      const startDockerButton = h(
        'button',
        { type: 'button', className: 'ddp-btn ddp-btn-primary', onClick: () => store.startDockerDesktop(), disabled: state.dockerStarting },
        state.dockerStarting ? t('action.starting') : t('action.startDocker'),
      );

      let body;
      if (state.dockerStarting && state.containers.length === 0) {
        body = h(
          'div',
          { className: 'ddp-progress' },
          h('span', { className: 'ddp-spinner' }),
          h('span', { className: 'ddp-progress-title' }, t('desktop.starting')),
          h('p', { className: 'ddp-progress-text' }, t('desktop.hint')),
        );
      } else if (state.loading && state.containers.length === 0) {
        body = h(SkeletonGrid);
      } else if (state.error && state.containers.length === 0) {
        body = h(
          'div',
          { className: 'ddp-state', role: 'alert' },
          h('span', { className: 'ddp-state-icon' }, h(AlertGlyph)),
          h('span', { className: 'ddp-state-title' }, t('error.title')),
          h('p', { className: 'ddp-state-text' }, errorText(t, state.error)),
          h(
            'div',
            { className: 'ddp-state-actions' },
            state.error.code === 'docker_daemon_down' ? startDockerButton : null,
            retryButton,
          ),
        );
      } else if (state.containers.length === 0) {
        body = h(
          'div',
          { className: 'ddp-state' },
          h('span', { className: 'ddp-state-icon' }, h(DockerGlyph)),
          h('span', { className: 'ddp-state-title' }, t('empty.title')),
          h('p', { className: 'ddp-state-text' }, t('empty.hint')),
          h('div', { className: 'ddp-state-actions' }, h('button', { type: 'button', className: 'ddp-btn', onClick: () => store.refresh() }, t('action.refresh'))),
        );
      } else {
        const banners = [];
        if (state.error) {
          banners.push(
            h(
              'div',
              { key: 'error', className: 'ddp-banner ddp-banner-error', role: 'alert' },
              h('span', { className: 'ddp-banner-text' }, errorText(t, state.error)),
              h('button', { type: 'button', className: 'ddp-btn', onClick: () => store.refresh() }, t('action.retry')),
            ),
          );
        }
        if (state.dockerStarting) {
          banners.push(
            h(
              'div',
              { key: 'desktop', className: 'ddp-banner' },
              h('span', { className: 'ddp-spinner ddp-spinner-small' }),
              h('span', { className: 'ddp-banner-text' }, t('desktop.starting')),
            ),
          );
        }
        if (state.startError) {
          banners.push(
            h(
              'div',
              { key: 'start', className: 'ddp-banner ddp-banner-warn', role: 'alert' },
              h('span', { className: 'ddp-banner-text' }, errorText(t, state.startError)),
              state.startError.code === 'docker_daemon_down' ? startDockerButton : null,
              h('button', { type: 'button', className: 'ddp-btn ddp-btn-ghost', onClick: () => store.clearStartError() }, t('action.dismiss')),
            ),
          );
        }
        if (state.pendingUrl) {
          banners.push(
            h(
              'div',
              { key: 'pending', className: 'ddp-banner' },
              h('span', { className: 'ddp-banner-text' }, t('pending.blocked', { name: state.pendingUrl.name })),
              h('button', { type: 'button', className: 'ddp-btn ddp-btn-primary', onClick: () => store.openPending() }, t('pending.open')),
            ),
          );
        }
        body = h(
          'div',
          null,
          banners.length > 0 ? h('div', { className: 'ddp-banners' }, banners) : null,
          h(
            'div',
            { className: 'ddp-grid' },
            state.containers.map((container, index) =>
              h(ContainerCard, {
                key: container.id || container.name,
                container,
                t,
                store,
                index,
                busy: state.busyName === container.name,
              }),
            ),
          ),
        );
      }

      return h(
        'div',
        {
          className: 'ddp-backdrop' + (closing ? ' ddp-closing' : ''),
          onClick: (event) => {
            if (event.target === event.currentTarget) store.requestClose();
          },
        },
        h(
          'section',
          {
            className: 'ddp-window' + (closing ? ' ddp-is-closing' : ''),
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('window.aria'),
          },
          h(
            'header',
            { className: 'ddp-head' },
            h(
              'div',
              { className: 'ddp-brand' },
              h('span', { className: 'ddp-brand-tile' }, h(DockerGlyph, { className: 'ddp-brand-icon' })),
              h(
                'div',
                { className: 'ddp-brand-text' },
                h('h2', { className: 'ddp-title' }, t('window.title')),
                h('p', { className: 'ddp-subtitle' }, subtitle),
              ),
            ),
            h(
              'div',
              { className: 'ddp-head-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'ddp-icon-btn' + (state.loading || state.refreshing ? ' ddp-spin' : ''),
                  title: t('action.refresh'),
                  'aria-label': t('action.refresh'),
                  onClick: () => store.refresh(),
                  disabled: state.loading || state.refreshing || state.dockerStarting,
                },
                h(RefreshGlyph),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'ddp-icon-btn',
                  title: t('action.close'),
                  'aria-label': t('action.close'),
                  onClick: () => store.requestClose(),
                  ref: closeRef,
                },
                h(CloseGlyph),
              ),
            ),
          ),
          h('div', { className: 'ddp-body' }, body),
          h('footer', { className: 'ddp-foot' }, h('span', { className: 'ddp-foot-hint' }, t('footer.hint'))),
        ),
      );
    }

    // -----------------------------------------------------------------------
    // Plugin entry
    // -----------------------------------------------------------------------

    const inject = ['slots', 'locale'];

    function apply(ctx) {
      ctx.effect(installStyles, 'dsh-docker-panel: styles');
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-docker-panel: locale');
      const t = ctx.locale.bind(NS);
      const store = createStore();
      ctx.effect(() => () => store.dispose(), 'dsh-docker-panel: store');

      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register(
          {
            name: 'sidebar.footer.action',
            id: 'dsh-docker-panel-entry',
            order: 0,
            locale: NS,
            inject: () => ({ t, store }),
          },
          DockerEntry,
        ),
      );

      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          {
            name: 'shell.overlay',
            id: 'dsh-docker-panel-window',
            locale: NS,
            inject: () => ({ t, store }),
          },
          DockerWindow,
        ),
      );
    }

    return {
      name: 'dsh-docker-panel',
      inject,
      apply,
    };
  },
});
