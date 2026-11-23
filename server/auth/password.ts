import crypto from 'node:crypto';

// OWASP-recommended Argon2id parameters (19 MiB, 2 iterations, 1 lane).
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

type Argon2Module = {
  argon2id: number;
  hash: (pw: string, opts: Record<string, unknown>) => Promise<string>;
  verify: (hash: string, pw: string) => Promise<boolean>;
  needsRehash: (hash: string, opts: Record<string, unknown>) => boolean;
};

let argon2Promise: Promise<Argon2Module> | null = null;
function loadArgon2(): Promise<Argon2Module> {
  argon2Promise ??= import('argon2').then((m: any) => (m.default ?? m) as Argon2Module);
  return argon2Promise;
}

export async function hashPassword(password: string): Promise<string> {
  const argon2 = await loadArgon2();
  return argon2.hash(password, { type: argon2.argon2id, ...ARGON2_OPTIONS });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    const argon2 = await loadArgon2();
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function passwordNeedsRehash(hash: string): Promise<boolean> {
  try {
    const argon2 = await loadArgon2();
    return argon2.needsRehash(hash, { type: argon2.argon2id, ...ARGON2_OPTIONS });
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;
/** Burns the same CPU time as a real verification so unknown phones are not distinguishable by timing. */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(await dummyHash, password);
}
