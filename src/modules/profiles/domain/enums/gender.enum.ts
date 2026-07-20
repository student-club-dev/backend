/**
 * User gender. Wire values match GenderDto in the OpenAPI contract.
 * Domain enum (pure TS) — mapped from the Prisma enum inside the infrastructure layer.
 */
export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}
