/**
 * Whether an option group allows one or many selections (LISTINGS.md §8). Wire values match
 * SelectionTypeDto in the OpenAPI contract and the Prisma `SelectionType` enum.
 */
export enum SelectionType {
  SINGLE = 'SINGLE',
  MULTIPLE = 'MULTIPLE',
}
