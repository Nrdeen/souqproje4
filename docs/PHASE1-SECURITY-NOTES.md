# Phase 1 – operational notes

## 1. Data directory is per server instance, and exclusive
* `server.ts` no longer has module-level `DATA_DIR` / `STORE_PATH`. Every `startServer()` call builds its own
  paths (`config.dataDir` → `DATA_DIR` env → `<project>/data`) and its own `saveStore`.
* While an instance runs it holds `DATA_DIR/.store.lock`. A second server, or `manage-users`, on the same
  directory **refuses to start** with a clear message. The lock is released on clean shutdown
  (SIGINT/SIGTERM handled in the `tsx server.ts` entry point) and reclaimed automatically if the owner crashed.
* Limits (by design, no database yet): advisory lock for **one machine**. A lock left by a different hostname is
  treated as stale (so a restarted container on a persistent volume can start). Do not run two instances against
  one shared network folder. The real fix for multi-instance is the database migration planned for later.

## 2. manage-users
Stop the server → run the command → start the server.

    npm run user:create-admin -- --phone 05XXXXXXXX --name "الاسم"
    npm run user:set-password -- --phone 05XXXXXXXX

Prompt + password hashing happen before the lock is taken; under the lock the CLI re-reads the store, re-checks
the preconditions, writes `data/backups/store.pre-cli-<timestamp>-<pid>.json` (never overwrites an existing
backup), then writes `store.json` atomically. A refused or failed run leaves `store.json` untouched.
The CLI reads the same `.env` and the same data-directory resolution as the server.

## 3. .env loading
`dotenv` is loaded only from the two entry points (`tsx server.ts`, `scripts/manage-users.ts`), never on import.
Real environment variables always win (`override: false`); only variable *names* are ever reported, never
values; a `.env` readable by other users prints a `chmod 600` warning. `.env` is git-ignored (`.env*`).

## 4. TypeScript layout
* `tsconfig.json` – backend/tooling: `server.ts`, `server/`, `scripts/`, `tests/`, `vite.config.ts`; Node types, no DOM.
* `src/tsconfig.json` – React frontend: DOM + `vite/client` types, no Node types.
* `tsconfig.base.json` – shared options. `npm run lint` type-checks both.

## 5. Registration and account enumeration
Finding: `/auth/register` answers 409 "number already registered", so anyone can test which numbers have accounts
(login is already generic). Implemented, without changing the sign-up experience:
* same CPU cost for the "exists" path as for a real sign-up (no timing difference);
* a tight per-IP budget (5 per hour) for the "exists" outcome; beyond it the IP gets 429 for **all** registrations
  until the hour passes. Trade-off: many users behind one carrier NAT share an IP, but 5 "already registered"
  results from one IP in an hour is very unusual for real users.

Complete fix (recommended next step, needs an SMS provider): phone verification (OTP). `/register` always replies
"we sent a code to 05XXXXXXXX" for new and existing numbers alike; an existing account only gets a
"someone tried to register your number" message. `users[].phoneVerifiedAt` already exists for this. Until then the
409 cannot be removed without making sign-up unusable for people who forgot they have an account.

## 6. Git hygiene (the upload contained no `.git` folder, so none of this could be checked from here)
Run these in your repository (read-only until the `rm --cached` step):

    git ls-files | grep -E '(^|/)(\.env($|\.)|data/)'          # tracked sensitive files? (.env.example is fine)
    git rm --cached data/store.json                              # untrack, keeps your local file
    git rm -r --cached data/backups 2>/dev/null                  # only if tracked
    git log --all --oneline -- data/store.json '.env' '.env.*'   # was it ever committed?
    git log --all -p -S'passwordHash' -- data | head             # hashes ever committed?
    git log --all -p -S'argon2id' --  . ':!bun.lock' | head      # same, whole tree

If any old commit contains `passwordHash`/`sessions` or real customer data, send me the output first: cleaning
history (git filter-repo / BFG) is a separate, deliberate step, and every secret that was ever committed must be
rotated regardless. `.gitignore` already ignores `data/store.json`, `data/backups/`, `data/*.tmp`, `data/.store.lock`
and `.env*`.

## 7. Moving from bun to npm
    npm install                      # creates package-lock.json
    npm run lint && npm test && npm run build
    git rm bun.lock                  # only after the three commands above pass
Fresh resolution may pick newer versions inside the `^` ranges than `bun.lock` pinned; run the tests before committing the lock file.
