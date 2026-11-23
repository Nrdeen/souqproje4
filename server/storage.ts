import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The single place that decides where store.json lives. The server and the operator CLI both use it,
 * so they can never disagree about which data directory they are touching.
 * An explicit value wins (DATA_DIR / config.dataDir); otherwise `<project>/data`.
 */
export function resolveDataDir(explicit?: string): string {
  return path.resolve(explicit ? explicit : path.join(PROJECT_ROOT, 'data'));
}

export const STORE_FILE_NAME = 'store.json';
export const STORE_LOCK_FILE_NAME = '.store.lock';

export class StoreLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreLockedError';
  }
}

export interface StoreLock {
  readonly lockPath: string;
  release(): void;
}

interface LockHolder {
  pid: number;
  host: string;
  owner: string;
  nonce: string;
  startedAt: string;
}

/** Lock files held by THIS process, so a second server on the same directory is refused even with the same pid. */
const heldHere = new Set<string>();

const UNREADABLE_LOCK_GRACE_MS = 10_000;

function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    // EPERM = the process exists but belongs to someone else.
    return err?.code === 'EPERM';
  }
}

function readHolder(lockPath: string): LockHolder | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    if (parsed && typeof parsed.pid === 'number' && typeof parsed.host === 'string') return parsed as LockHolder;
    return null;
  } catch {
    return null;
  }
}

/** Is the recorded holder still running on this machine? */
function holderIsLive(holder: LockHolder): boolean {
  if (holder.host !== os.hostname()) {
    // Different host (e.g. a previous container with a persisted volume): its pid says nothing about us.
    // Documented limitation: we treat it as stale instead of blocking a restart forever.
    return false;
  }
  // The same pid as ours but not held in this process = a leftover from a previous run (typical in containers where the app is pid 1).
  if (holder.pid === process.pid) return false;
  return pidIsAlive(holder.pid);
}

function describeHolder(holder: LockHolder | null): string {
  if (!holder) return 'a process that is still starting';
  return `${holder.owner} (pid ${holder.pid}, started ${holder.startedAt})`;
}

/**
 * Takes an exclusive, advisory lock on a data directory.
 *
 * Why: the JSON store is loaded into memory by the server and rewritten as a whole file. Any other writer
 * (the manage-users CLI, a second server instance) would silently overwrite or be overwritten by it.
 * Only one live process may own a data directory at a time; the others must refuse to run.
 *
 * It is best-effort protection suitable for a single machine. It is NOT a substitute for a real database.
 */
export function acquireStoreLock(dataDir: string, owner: string): StoreLock {
  fs.mkdirSync(dataDir, { recursive: true });
  const lockPath = path.join(dataDir, STORE_LOCK_FILE_NAME);
  const nonce = crypto.randomBytes(8).toString('hex');
  const record: LockHolder = {
    pid: process.pid,
    host: os.hostname(),
    owner,
    nonce,
    startedAt: new Date().toISOString(),
  };

  if (heldHere.has(lockPath)) {
    throw new StoreLockedError(`Data directory ${dataDir} is already in use by another server instance in this process.`);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      try {
        fs.writeSync(fd, JSON.stringify(record));
      } finally {
        fs.closeSync(fd);
      }
      heldHere.add(lockPath);
      let released = false;
      return {
        lockPath,
        release() {
          if (released) return;
          released = true;
          heldHere.delete(lockPath);
          // Only remove the file if it is still OUR lock.
          if (readHolder(lockPath)?.nonce === nonce) {
            try {
              fs.unlinkSync(lockPath);
            } catch {
              // already gone
            }
          }
        },
      };
    } catch (err: any) {
      if (err?.code !== 'EEXIST') throw err;
    }

    const holder = readHolder(lockPath);
    let stale: boolean;
    if (holder) {
      stale = !holderIsLive(holder);
    } else {
      // Empty/garbled file: either another process is mid-write, or a crash left junk. Wait a little before judging.
      try {
        stale = Date.now() - fs.statSync(lockPath).mtimeMs > UNREADABLE_LOCK_GRACE_MS;
      } catch {
        stale = true; // vanished between the checks: just retry
      }
    }
    if (!stale) {
      throw new StoreLockedError(
        `Data directory ${dataDir} is locked by ${describeHolder(holder)}. ` +
          `Stop that process first (for CLI commands: stop the server, run the command, then start the server again).`
      );
    }
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // someone else removed it; loop and try again
    }
  }
  throw new StoreLockedError(`Could not acquire the data directory lock at ${lockPath}.`);
}

export const AUDIT_ARCHIVE_FILE_NAME = 'audit-archive.ndjson';

/**
 * Safely appends older audit entries to an append-only NDJSON archive file
 * inside dataDir before they are trimmed from the active store snapshot.
 */
export function appendAuditArchive(dataDir: string, entries: unknown[]): void {
  if (!Array.isArray(entries) || entries.length === 0) return;
  fs.mkdirSync(dataDir, { recursive: true });
  const archivePath = path.join(dataDir, AUDIT_ARCHIVE_FILE_NAME);
  const lines = `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
  fs.appendFileSync(archivePath, lines, { encoding: 'utf-8', mode: 0o600 });
}

/**
 * Atomic JSON store persister with two write modes:
 * - saveImmediate(): synchronous atomic write (temp + rename) for critical state changes
 * - scheduleSave(): short coalesced timer for frequent non-critical metadata touches (e.g. session lastSeenAt, notification read flags)
 * - flushSync(): flushes any pending scheduled write synchronously (called on server close / shutdown)
 */
export class StorePersister<T> {
  private dirtyRevision = 0;
  private persistedRevision = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingGetData: (() => T) | null = null;

  constructor(
    private readonly dataDir: string,
    private readonly storePath: string,
    private readonly coalesceMs = 200
  ) {}

  private writeAtomic(data: T): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    const tmp = `${this.storePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(data), { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tmp, this.storePath);
    } catch (err) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        // best effort cleanup of temporary file
      }
      throw err;
    }
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  saveImmediate(data: T): void {
    this.clearTimer();
    this.pendingGetData = null;
    this.dirtyRevision += 1;
    const targetRev = this.dirtyRevision;
    try {
      this.writeAtomic(data);
      this.persistedRevision = Math.max(this.persistedRevision, targetRev);
    } catch (err) {
      console.error('Failed to persist store immediately:', err);
    }
  }

  scheduleSave(getData: () => T): void {
    this.dirtyRevision += 1;
    this.pendingGetData = getData;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flushSync(getData);
    }, this.coalesceMs);
    this.timer.unref();
  }

  flushSync(fallbackGetData?: () => T): boolean {
    this.clearTimer();
    if (this.dirtyRevision <= this.persistedRevision) {
      this.pendingGetData = null;
      return false;
    }
    const getter = this.pendingGetData || fallbackGetData;
    this.pendingGetData = null;
    if (!getter) return false;
    const targetRev = this.dirtyRevision;
    try {
      this.writeAtomic(getter());
      this.persistedRevision = Math.max(this.persistedRevision, targetRev);
      return true;
    } catch (err) {
      console.error('Failed to flush store persistence:', err);
      return false;
    }
  }

  hasPendingWrites(): boolean {
    return this.dirtyRevision > this.persistedRevision;
  }
}

