import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startServer } from '../../../server.ts';

export interface PlaywrightPageErrorCollector {
  pageErrors: string[];
  consoleErrors: string[];
  failedResponses: Array<{ url: string; status: number }>;
  clear(): void;
}

const DEFAULT_PLAYWRIGHT_CANDIDATES = [
  process.env.PLAYWRIGHT_MODULE_PATH,
  '/usr/local/share/bun-global/node_modules/playwright-core/index.mjs',
  '/usr/local/lib/node_modules/playwright-core/index.mjs',
].filter((v): v is string => Boolean(v));

const DEFAULT_EXECUTABLE_CANDIDATES = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
  '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter((v): v is string => Boolean(v));

export async function loadPlaywright(): Promise<any> {
  const pkgCandidates = ['playwright', 'playwright-core'];
  for (const pkg of pkgCandidates) {
    try {
      return await import(pkg);
    } catch {
      // Fall back to explicit system paths
    }
  }
  for (const candidate of DEFAULT_PLAYWRIGHT_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return await import(pathToFileURL(candidate).href);
    }
  }
  throw new Error(
    'Playwright is not installed. Set PLAYWRIGHT_MODULE_PATH or install playwright / playwright-core.'
  );
}

export function resolveChromiumExecutable(): string | undefined {
  for (const candidate of DEFAULT_EXECUTABLE_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export async function launchChromiumBrowser() {
  const pw = await loadPlaywright();
  const executablePath = resolveChromiumExecutable();
  const launchOpts: Record<string, unknown> = {
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  };
  if (executablePath) {
    launchOpts.executablePath = executablePath;
  }
  const browser = await pw.chromium.launch(launchOpts);
  return { pw, browser };
}

export interface TestServerHandle {
  server: Awaited<ReturnType<typeof startServer>>;
  dataDir: string;
  baseUrl: string;
  restart(): Promise<void>;
  cleanup(): Promise<void>;
}

/**
 * Starts an isolated Express + production `dist/` SPA server using a temporary DATA_DIR.
 * Note: uses `cookieSecure: false` strictly for plain HTTP `127.0.0.1` loopback in local tests;
 * production (`loadConfig`) enforces `cookieSecure: true` and `__Host-sid` over HTTPS.
 */
export async function startE2EServer(opts: { port?: number } = {}): Promise<TestServerHandle> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'souq-e2e-'));
  const csrfSecret = 'phase5e-e2e-isolated-test-secret-key-minimum-32-chars';

  const boot = async (preferredPort: number) => {
    const srv = await startServer({
      serveFrontend: true,
      aiConfig: {
        geminiApiKey: '',
        providerMode: 'mock',
      },
      config: {
        dataDir,
        port: preferredPort,
        isProd: true,
        cookieName: 'sid',
        cookieSecure: false,
        csrfSecret,
        demoAccounts: false,
        allowedOrigins: preferredPort > 0 ? [`http://127.0.0.1:${preferredPort}`] : [],
      },
    });
    const baseUrl = `http://127.0.0.1:${srv.port}`;
    if (!srv.config.allowedOrigins.includes(baseUrl)) {
      srv.config.allowedOrigins.push(baseUrl);
    }
    return srv;
  };

  let server = await boot(opts.port ?? 0);
  const fixedPort = server.port;

  return {
    get server() {
      return server;
    },
    dataDir,
    baseUrl: `http://127.0.0.1:${fixedPort}`,
    async restart() {
      await server.close();
      server = await boot(fixedPort);
    },
    async cleanup() {
      try {
        await server.close();
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
  };
}

export function attachDiagnostics(
  page: any,
  opts: { allowHttpStatuses?: number[] } = {}
): PlaywrightPageErrorCollector {
  const allowed = new Set(opts.allowHttpStatuses || []);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: Array<{ url: string; status: number }> = [];

  page.on('pageerror', (err: Error) => {
    pageErrors.push(String(err?.message || err));
  });
  page.on('console', (msg: any) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!allowed.size || !text.includes('Failed to load resource: the server responded with a status of 40')) {
        consoleErrors.push(text);
      }
    }
  });
  page.on('response', (res: any) => {
    const status = res.status();
    if (status >= 400 && !allowed.has(status)) {
      failedResponses.push({ url: res.url(), status });
    }
  });

  return {
    pageErrors,
    consoleErrors,
    failedResponses,
    clear() {
      pageErrors.length = 0;
      consoleErrors.length = 0;
      failedResponses.length = 0;
    },
  };
}

export async function inspectViewportLayout(page: any) {
  return await page.evaluate(() => {
    const g = globalThis as any;
    const doc = g.document.documentElement;
    const scrollWidth = doc.scrollWidth;
    const innerWidth = g.window.innerWidth;
    const dir = doc.getAttribute('dir');
    const lang = doc.getAttribute('lang');

    const imgs = Array.from(g.document.querySelectorAll('img')).map((img: any) => {
      const rect = img.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0;
      return {
        src: img.currentSrc || img.getAttribute('src') || '',
        alt: img.getAttribute('alt') || '',
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        visible,
      };
    });

    const brokenImages = imgs.filter((i: any) => !i.complete || i.naturalWidth === 0);

    const header = g.document.querySelector('header');
    let headerOverlapCount = 0;
    let headerOverflow = false;
    if (header) {
      const hRect = header.getBoundingClientRect();
      if (hRect.right > innerWidth + 2 || hRect.left < -2) {
        headerOverflow = true;
      }
      const btns = Array.from(header.querySelectorAll('button'))
        .map((b: any) => ({ text: (b.textContent || '').trim(), rect: b.getBoundingClientRect() }))
        .filter((b: any) => b.rect.width > 0 && b.rect.height > 0);
      for (let i = 0; i < btns.length; i++) {
        for (let j = i + 1; j < btns.length; j++) {
          const a = btns[i].rect;
          const b = btns[j].rect;
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (overlapX > 2 && overlapY > 2) {
            headerOverlapCount += 1;
          }
        }
      }
    }

    return {
      dir,
      lang,
      scrollWidth,
      innerWidth,
      overflowPx: Math.max(0, scrollWidth - innerWidth),
      totalImages: imgs.length,
      brokenImages,
      headerOverflow,
      headerOverlapCount,
    };
  });
}
