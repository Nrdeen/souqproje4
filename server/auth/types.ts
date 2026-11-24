import type { SessionRecord } from './sessions';

export interface Credential {
  userId: string;
  /** Argon2id PHC string. Never serialised to clients. */
  passwordHash: string;
  updatedAt: string;
}

export interface GoogleIdentityRecord {
  id: string;
  userId: string;
  provider: 'google' | 'facebook';
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
  pictureUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The slice of the JSON store the auth layer needs. */
export interface AuthStore {
  users: any[];
  sellers: any[];
  credentials: Credential[];
  sessions: SessionRecord[];
  googleIdentities?: GoogleIdentityRecord[];
}

export interface AuthContext {
  user: any;
  session: SessionRecord;
  csrfToken: string;
}
