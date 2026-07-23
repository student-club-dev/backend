import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { BranchRequestDto } from './branch-request.dto';

/**
 * `LocationDto.geohash` is documented but server-computed. With `useDefineForClassFields` (target
 * ES2022) every declared field exists on the instance, so a property carrying no class-validator
 * decorator is stripped by `whitelist` and then rejected by `forbidNonWhitelisted` — even when the
 * client never sends it. `@Allow()` keeps it whitelisted; `toDomain()` still discards the value.
 */
describe('BranchRequestDto validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const validBody = {
    name: 'Chilonzor filiali',
    location: {
      regionId: 'TOSHKENT_SHAHRI',
      districtId: 'CHILONZOR',
      address: 'Chilonzor 9-kvartal, 42-uy',
      lat: 41.2856,
      lng: 69.2034,
    },
    workingHours: [{ day: 'MON', open: '09:00', close: '23:00', isClosed: false }],
  };

  const transform = (body: unknown): Promise<unknown> =>
    pipe.transform(body, { type: 'body', metatype: BranchRequestDto });

  it('accepts a body that omits the server-computed geohash', async () => {
    await expect(transform(validBody)).resolves.toBeInstanceOf(BranchRequestDto);
  });

  it('accepts a body that sends geohash and discards it', async () => {
    const dto = (await transform({
      ...validBody,
      location: { ...validBody.location, geohash: 'tzz1234' },
    })) as BranchRequestDto;

    expect(dto.toInput().location.geohash).toBeNull();
  });

  it('still rejects a genuinely unknown property', async () => {
    await expect(transform({ ...validBody, nope: 'x' })).rejects.toThrow();
  });
});
