export const PERMANENT_PASSWORD_LIFETIME_IN_DAYS = 90;
export const PERMANENT_PASSWORD_LIFETIME_IN_MILLISECONDS =
  PERMANENT_PASSWORD_LIFETIME_IN_DAYS * 24 * 60 * 60 * 1000;

export const getPermanentPasswordExpiresAt = (from = new Date()): Date =>
  new Date(from.getTime() + PERMANENT_PASSWORD_LIFETIME_IN_MILLISECONDS);
