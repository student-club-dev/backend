import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StudentListingKind } from '../../domain/enums/student-listing-kind.enum';
import { CreateStudentListingDto } from './create-student-listing.dto';
import { RentalDetailsDto, TaskDetailsDto } from './listing-details.dto';

/** Mirrors the global pipe: `whitelist`, `forbidNonWhitelisted`, `transform`. */
async function check(payload: Record<string, unknown>): Promise<{
  dto: CreateStudentListingDto;
  errorCount: number;
}> {
  const dto = plainToInstance(CreateStudentListingDto, payload, {
    enableImplicitConversion: false,
  });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errorCount: errors.length };
}

describe('CreateStudentListingDto', () => {
  it('accepts a bare draft carrying only kind and details', async () => {
    // §6.1 — a half-filled form must save, so nothing but the discriminators is required.
    const { errorCount } = await check({ kind: 'TASK', details: { kind: 'TASK' } });
    expect(errorCount).toBe(0);
  });

  it('resolves details to the subclass matching kind', async () => {
    const { dto } = await check({
      kind: 'RENTAL',
      details: { kind: 'RENTAL', roomCount: 3 },
    });
    expect(dto.details).toBeInstanceOf(RentalDetailsDto);
  });

  it('keeps details.kind after transformation', async () => {
    // Without keepDiscriminatorProperty this is stripped and LISTING_KIND_MISMATCH can never fire.
    const { dto } = await check({ kind: 'RENTAL', details: { kind: 'RENTAL' } });
    expect(dto.details.kind).toBe(StudentListingKind.RENTAL);
  });

  it('resolves a TASK details payload to its own subclass', async () => {
    const { dto } = await check({
      kind: 'TASK',
      details: { kind: 'TASK', category: 'EXACT', typeKey: 'MATH' },
    });
    expect(dto.details).toBeInstanceOf(TaskDetailsDto);
  });

  it('rejects more than 5 images', async () => {
    const { errorCount } = await check({
      kind: 'TASK',
      details: { kind: 'TASK' },
      images: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    expect(errorCount).toBeGreaterThan(0);
  });

  it.each(['901234567', '+7 900 000 00 00', '998901234567', ''])(
    'rejects the phone number %p',
    async (contactPhone) => {
      const { errorCount } = await check({
        kind: 'TASK',
        details: { kind: 'TASK' },
        contactPhone,
      });
      expect(errorCount).toBeGreaterThan(0);
    },
  );

  it('accepts a well-formed Uzbek phone number', async () => {
    const { errorCount } = await check({
      kind: 'TASK',
      details: { kind: 'TASK' },
      contactPhone: '+998901234567',
    });
    expect(errorCount).toBe(0);
  });

  it('rejects a coordinate outside Uzbekistan', async () => {
    const { errorCount } = await check({
      kind: 'RENTAL',
      details: { kind: 'RENTAL' },
      branches: [{ lat: 55.75, lng: 37.62, address: 'Moskva' }],
    });
    expect(errorCount).toBeGreaterThan(0);
  });

  it('rejects more than 20 branches', async () => {
    const branches = Array.from({ length: 21 }, () => ({
      lat: 41.2856,
      lng: 69.2034,
      address: 'Chilonzor',
    }));
    const { errorCount } = await check({ kind: 'RENTAL', details: { kind: 'RENTAL' }, branches });
    expect(errorCount).toBeGreaterThan(0);
  });

  it('rejects an unknown top-level field', async () => {
    const { errorCount } = await check({
      kind: 'TASK',
      details: { kind: 'TASK' },
      ownerId: 'usr_hacker',
    });
    expect(errorCount).toBeGreaterThan(0);
  });

  it('rejects a negative price', async () => {
    const { errorCount } = await check({ kind: 'TASK', details: { kind: 'TASK' }, price: -1 });
    expect(errorCount).toBeGreaterThan(0);
  });

  describe('toInput', () => {
    it('fills absent optional fields with nulls and defaults', async () => {
      const { dto } = await check({ kind: 'TASK', details: { kind: 'TASK' } });
      const input = dto.toInput();

      expect(input).toMatchObject({
        kind: StudentListingKind.TASK,
        submit: false,
        title: '',
        description: null,
        images: [],
        price: 0,
        isNegotiable: false,
        contactPhone: null,
        validFrom: null,
        validTo: null,
        attributes: {},
        optionGroups: [],
      });
    });

    it('converts ISO strings to Dates', async () => {
      const { dto } = await check({
        kind: 'TASK',
        details: { kind: 'TASK', deadline: '2026-08-14T18:00:00Z' },
        validFrom: '2026-08-01T00:00:00Z',
        validTo: '2026-08-15T00:00:00Z',
      });
      const input = dto.toInput();

      expect(input.validFrom).toEqual(new Date('2026-08-01T00:00:00Z'));
      expect(input.validTo).toEqual(new Date('2026-08-15T00:00:00Z'));
      expect(input.details).toMatchObject({ deadline: new Date('2026-08-14T18:00:00Z') });
    });

    it('maps branches to domain data without an id', async () => {
      const { dto } = await check({
        kind: 'RENTAL',
        details: { kind: 'RENTAL' },
        branches: [{ lat: 41.2856, lng: 69.2034, address: 'Chilonzor 9', landmark: 'Korzinka' }],
      });
      const input = dto.toInput();

      expect(input.branches).toEqual([
        {
          lat: 41.2856,
          lng: 69.2034,
          address: 'Chilonzor 9',
          name: null,
          landmark: 'Korzinka',
          regionId: null,
          districtId: null,
        },
      ]);
    });
  });
});
