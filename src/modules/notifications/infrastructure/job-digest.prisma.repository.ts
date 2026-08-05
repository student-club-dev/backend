import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { JobDigestMatch, JobDigestRepository } from '../domain/job-digest.repository';

/**
 * Prisma implementation of the job matcher. Prisma is used ONLY here.
 *
 * **What "matching" means**, agreed with the product side: a new `JOB` listing is relevant to a
 * student if it is at their university **or** near where they live. It is deliberately an OR — a
 * student who has told us only one of the two still gets matched on that one, and an AND would
 * mean nobody matched until profiles were complete.
 *
 * Course year takes no part, and cannot: the student has one, but a job listing carries no course
 * requirement to compare it against (`JobDetails` has `experience`, `ageFrom`/`ageTo` and no
 * equivalent). Matching on it would mean inventing a field the listing never filled in.
 *
 * A student with neither signal matches nothing at all. That is the intended outcome, not a gap:
 * §7.2 of the catalogue is explicit that a digest sent without a real criterion is spam, so no
 * criterion means no digest.
 */
@Injectable()
export class JobDigestPrismaRepository implements JobDigestRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMatchesSince(since: Date, limit: number): Promise<JobDigestMatch[]> {
    // `$queryRaw` because this is an aggregate over a join with an OR-ed geo/university predicate —
    // expressible in Prisma's query API only as several round trips. Every value below is a bound
    // parameter, never interpolated.
    return this.prisma.$queryRaw<JobDigestMatch[]>`
      SELECT
        s.id                                                          AS "studentId",
        COUNT(*)::int                                                 AS "count",
        (array_agg(sl.id    ORDER BY sl.created_at DESC))[1]          AS "firstListingId",
        (array_agg(sl.title ORDER BY sl.created_at DESC))[1]          AS "firstTitle",
        (array_agg(NULLIF(sl.price, 0)::text  ORDER BY sl.created_at DESC))[1] AS "firstPrice",
        (array_agg(sl.details->>'companyName' ORDER BY sl.created_at DESC))[1] AS "firstCompany"
      FROM students s
      JOIN student_listings sl
        ON sl.kind = 'JOB'
       AND sl.status = 'ACTIVE'
       AND sl.deleted_at IS NULL
       AND sl.created_at >= ${since}
       -- Nobody is told about their own posting.
       AND sl.owner_id <> s.id
       AND (
             (sl.university_id IS NOT NULL AND sl.university_id = s.university_id)
          OR EXISTS (
               SELECT 1
               FROM student_listing_branches b
               WHERE b.listing_id = sl.id
                 AND (
                       (s.district_id IS NOT NULL AND b.district_id = s.district_id)
                       -- District is the finer signal; region is the fallback for a student who
                       -- has only said which province they are in.
                    OR (s.district_id IS NULL AND s.region_id IS NOT NULL AND b.region_id = s.region_id)
                     )
             )
           )
      WHERE s.status = 'ACTIVE'
        -- No signal, no digest. Without this every student with an empty profile matches every
        -- listing whose university is also null.
        AND (s.university_id IS NOT NULL OR s.region_id IS NOT NULL)
      GROUP BY s.id
      LIMIT ${limit}
    `;
  }
}
