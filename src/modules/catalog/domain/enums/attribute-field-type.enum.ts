/**
 * The UI type of a dynamic listing-form field. Wire values match AttributeFieldTypeDto
 * in the OpenAPI contract (mapped from the Prisma `AttributeKind` enum in infrastructure).
 */
export enum AttributeFieldType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  SELECT = 'SELECT',
  MULTI_SELECT = 'MULTI_SELECT',
  TAGS = 'TAGS',
}
