/**
 * Kind of a student-posted listing. Wire values match the client's `ListingKind`, which also
 * carries DISCOUNT — that is the business `Listing`, a different aggregate entirely, and this
 * module rejects it (STUDENT_LISTINGS_BACKEND.md §2.3).
 */
export enum StudentListingKind {
  RENTAL = 'RENTAL',
  SERVICE = 'SERVICE',
  JOB = 'JOB',
  TASK = 'TASK',
}
