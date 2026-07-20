/**
 * OAuth identity providers. Mirror of the Prisma `AuthProvider` enum (same string values), kept
 * in common so the domain / application / presentation layers can reference it without importing
 * Prisma (which is confined to infrastructure). Infrastructure maps it to the Prisma enum.
 */
export enum AuthProvider {
  GOOGLE = 'GOOGLE',
  APPLE = 'APPLE',
}
