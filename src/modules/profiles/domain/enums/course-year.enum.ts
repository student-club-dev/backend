/**
 * Year of study. Wire values match CourseYearDto in the OpenAPI contract ("1".."4","MASTER").
 * The Prisma enum names these YEAR_1..YEAR_4 (@map'd back to "1".."4"); the infrastructure
 * mapper translates between the Prisma names and these wire values.
 */
export enum CourseYear {
  YEAR_1 = '1',
  YEAR_2 = '2',
  YEAR_3 = '3',
  YEAR_4 = '4',
  MASTER = 'MASTER',
}
