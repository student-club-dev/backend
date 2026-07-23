import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { CreateListingRequestDto } from './create-listing-request.dto';

/**
 * `RedemptionInfoDto.usedCount` is documented but server-owned. With `useDefineForClassFields`
 * (target ES2022) the field exists on every instance, so without a class-validator decorator
 * `forbidNonWhitelisted` rejects the whole body — even when the client never sends it. `@Allow()`
 * keeps it whitelisted; `toInput()` still drops the value.
 */
describe('CreateListingRequestDto validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const validBody = {
    categoryKey: 'PIZZA',
    title: 'Pepperoni pitsa',
    images: ['https://example.com/a.jpg'],
    priceUnit: 'PER_ITEM',
    originalPrice: 55000,
    discount: { type: 'PERCENT', value: 20 },
    redemption: { method: 'QR' },
    validFrom: '2026-08-01T00:00:00Z',
    validTo: '2026-09-01T00:00:00Z',
  };

  const transform = (body: unknown): Promise<unknown> =>
    pipe.transform(body, { type: 'body', metatype: CreateListingRequestDto });

  it('accepts a body that omits the server-owned usedCount', async () => {
    await expect(transform(validBody)).resolves.toBeInstanceOf(CreateListingRequestDto);
  });

  it('accepts a body that sends usedCount and drops it from the input', async () => {
    const dto = (await transform({
      ...validBody,
      redemption: { method: 'QR', usedCount: 99 },
    })) as CreateListingRequestDto;

    expect(dto.toInput().redemption).not.toHaveProperty('usedCount');
  });

  it('still rejects a genuinely unknown property', async () => {
    await expect(transform({ ...validBody, nope: 'x' })).rejects.toThrow();
  });
});
