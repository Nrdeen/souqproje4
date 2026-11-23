import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface LoadEnvResult {
  loaded: boolean;
  file: string;
  /** Names only. Values are never returned or logged. */
  keys: string[];
  warnings: string[];
}

/**
 * Loads `<project>/.env` into the environment. Call it ONLY from process entry points
 * (the `tsx server.ts` bootstrap and the operator CLI), never at import time, so that tests and
 * library code are not affected by a developer's local .env.
 *
 *  - Variables already present in the real environment always win (override: false), so the hosting
 *    platform's secret manager cannot be silently replaced by a stale file.
 *  - The path is fixed to the project root, not the current working directory.
 *  - Nothing is printed except variable names / warnings; secret values never reach the logs.
 *  - A missing file is fine (production usually injects variables directly).
 */
export function loadEnvFile(
  target: Record<string, string | undefined> = process.env,
  file: string = path.join(PROJECT_ROOT, '.env')
): LoadEnvResult {
  const result: LoadEnvResult = { loaded: false, file, keys: [], warnings: [] };
  if (!fs.existsSync(file)) return result;

  try {
    // On POSIX, a secrets file that other local users can read is worth a warning.
    const mode = fs.statSync(file).mode;
    if (process.platform !== 'win32' && (mode & 0o077) !== 0) {
      result.warnings.push(`${path.basename(file)} is readable by other users; run: chmod 600 ${path.basename(file)}`);
    }
  } catch {
    // stat failure is not fatal
  }

  const parsed = dotenv.config({
    path: file,
    processEnv: target as Record<string, string>,
    override: false,
    quiet: true,
  });
  if (parsed.error) {
    result.warnings.push(`Could not parse ${path.basename(file)}: ${parsed.error.message}`);
    return result;
  }
  result.loaded = true;
  result.keys = Object.keys(parsed.parsed || {});
  return result;
}

/** Entry-point helper: load the file and print warnings (names only). */
export function loadEnvForEntryPoint(): void {
  const res = loadEnvFile();
  for (const w of res.warnings) console.warn(`[env] ${w}`);
}
