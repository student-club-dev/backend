import { durationMsOf } from '../domain/entities/call.entity';

describe('durationMsOf', () => {
  it('measures from answer to end', () => {
    expect(
      durationMsOf({
        answeredAt: new Date('2026-08-01T10:00:00.000Z'),
        endedAt: new Date('2026-08-01T10:03:04.000Z'),
      }),
    ).toBe(184_000);
  });

  // A missed or declined call has no conversation to measure; the DTO field is non-null, so 0.
  it('is zero when the call was never answered', () => {
    expect(durationMsOf({ answeredAt: null, endedAt: new Date() })).toBe(0);
  });

  it('is zero while the call is still running', () => {
    expect(durationMsOf({ answeredAt: new Date(), endedAt: null })).toBe(0);
  });
});
