/** Seed accounts shipped with the project. They are demo data and never receive shared/default credentials. */
export const DEMO_USER_IDS = new Set(['usr_seller_1', 'usr_seller_2', 'usr_seller_3', 'usr_buyer_1', 'usr_admin_1']);

/**
 * Additive, idempotent migration: adds the auth-related collections/fields and flags demo users.
 * It never removes or rewrites existing records. Returns true when the data shape changed.
 */
export function migrateAuthFields(data: any): boolean {
  let changed = false;
  if (!Array.isArray(data.credentials)) {
    data.credentials = [];
    changed = true;
  }
  if (!Array.isArray(data.sessions)) {
    data.sessions = [];
    changed = true;
  }
  if (!Array.isArray(data.googleIdentities)) {
    data.googleIdentities = [];
    changed = true;
  }
  if (Array.isArray(data.users)) {
    for (const u of data.users) {
      if (u.phoneVerifiedAt === undefined) {
        u.phoneVerifiedAt = null;
        changed = true;
      }
      if (DEMO_USER_IDS.has(u.id) && u.isDemo !== true) {
        u.isDemo = true;
        changed = true;
      }
    }
  }
  return changed;
}
