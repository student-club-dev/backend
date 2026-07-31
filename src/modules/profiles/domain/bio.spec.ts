import { ERROR_CODE } from '../../../common/errors/error-code';
import { normalizeBio } from './bio';

describe('normalizeBio', () => {
  it('keeps an ordinary bio, trimmed', () => {
    expect(normalizeBio('  5/5 · Dasturiy injiniring  ')).toBe('5/5 · Dasturiy injiniring');
  });

  it('treats a blank bio as cleared, not as an empty string', () => {
    // Otherwise "never set one" and "deleted mine" become two different stored states that look
    // identical on screen.
    expect(normalizeBio('')).toBeNull();
    expect(normalizeBio('   ')).toBeNull();
  });

  it.each([
    'Kanalim: https://t.me/kanal',
    't.me/kanal',
    'telegram.me/kanal',
    '@mening_kanalim',
    'Arzon kiyim — arzonkiyim.uz',
    'http://spam.example',
  ])('refuses %s', (bio) => {
    expect(() => normalizeBio(bio)).toThrow(
      expect.objectContaining({ code: ERROR_CODE.BIO_NOT_ALLOWED, status: 422 }),
    );
  });

  it('refuses a phone number however it is spaced out', () => {
    // A digit run is only seven long once the separators come out — counting them raw would let
    // every prettily formatted number through.
    for (const bio of ['+998901234567', '+998 90 123 45 67', '90-123-45-67', '(90) 123 45 67']) {
      expect(() => normalizeBio(bio)).toThrow(
        expect.objectContaining({ code: ERROR_CODE.BIO_NOT_ALLOWED }),
      );
    }
  });

  it('does not mistake ordinary numbers for a phone number', () => {
    expect(normalizeBio('2004-yilda tug‘ilganman, 3-kurs')).toBe('2004-yilda tug‘ilganman, 3-kurs');
  });

  it('refuses a bio past the 140-character cap as a field error, not a spam verdict', () => {
    expect(() => normalizeBio('a'.repeat(141))).toThrow(
      expect.objectContaining({ code: ERROR_CODE.VALIDATION_ERROR, status: 422 }),
    );
  });
});
