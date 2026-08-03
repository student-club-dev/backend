/**
 * Smoke-tests the two raw-SQL triggers added by the student_listings migration. Prisma cannot
 * model them, so nothing else would catch a silent failure — and a dead geo trigger breaks every
 * proximity query in Phase 1b without any error surfacing.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const student = await prisma.student.create({
    data: { email: `trigger-smoke-${Date.now()}@example.test` },
    select: { id: true },
  });

  try {
    const listing = await prisma.studentListing.create({
      data: {
        ownerId: student.id,
        kind: 'RENTAL',
        title: 'Chilonzorda sherik kerak',
        searchText: 'Chilonzorda sherik kerak metro yaqin',
        details: { kind: 'RENTAL' },
        branches: {
          create: [{ lat: 41.2856, lng: 69.2034, address: 'Chilonzor 9-kvartal' }],
        },
      },
      select: { id: true },
    });

    const [row] = await prisma.$queryRaw<{ has_vector: boolean; lat: number; lng: number }[]>`
      SELECT
        l.search_vector IS NOT NULL AND l.search_vector::text <> '' AS has_vector,
        ST_Y(b.geo_point::geometry) AS lat,
        ST_X(b.geo_point::geometry) AS lng
      FROM student_listings l
      JOIN student_listing_branches b ON b.listing_id = l.id
      WHERE l.id = ${listing.id}
    `;

    const geoOk = row !== undefined && Math.abs(row.lat - 41.2856) < 1e-6 && Math.abs(row.lng - 69.2034) < 1e-6;
    console.log(`geo_point trigger:    ${geoOk ? 'OK' : 'FAILED'} (lat=${row?.lat}, lng=${row?.lng})`);
    console.log(`search_vector trigger: ${row?.has_vector ? 'OK' : 'FAILED'}`);

    if (!geoOk || row?.has_vector !== true) {
      process.exitCode = 1;
    }
  } finally {
    // Cascades to the listing and its branches.
    await prisma.student.delete({ where: { id: student.id } });
    await prisma.$disconnect();
  }
}

void main();
