import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';

/** Longest bio we store. Also the column width, so a direct write cannot exceed it either. */
export const MAX_BIO_LENGTH = 140;

/**
 * What a bio may not carry.
 *
 * A profile blurb is the cheapest advertising slot on a social app: it is free, it is seen by
 * everyone who opens the profile, and nobody has to accept anything to see it. Left open, it fills
 * with channel links and phone numbers within a week — which is why this is a hard reject rather
 * than something moderation cleans up later.
 */
const FORBIDDEN: readonly RegExp[] = [
  // Any explicit URL.
  /https?:\/\//i,
  // Telegram, with or without a scheme — the format the spam actually uses.
  /\bt\.me\//i,
  /\btelegram\.me\//i,
  // A channel or account handle: `@` plus a plausible username.
  /@[a-z0-9_]{3,}/i,
  // A bare domain that would be tapped as a link anyway.
  /\b[a-z0-9-]+\.(uz|com|net|org|io|ru|me)\b/i,
];

/** Seven or more digits in a row — a phone number, however it is spaced out. */
const DIGIT_RUN = /\d{7,}/;

/** Separators someone puts inside a number to slip past a naive digit count. */
const NUMBER_NOISE = /[\s\-().+]/g;

/**
 * Normalises a bio and rejects one that is really an advert.
 *
 * Returns the trimmed text, or `null` when it is empty — clearing a bio and never having set one are
 * the same state, and storing `""` for one of them would make two identical-looking profiles differ.
 */
export function normalizeBio(raw: string): string | null {
  const bio = raw.trim();
  if (bio.length === 0) {
    return null;
  }
  if (bio.length > MAX_BIO_LENGTH) {
    throw AppException.validation({
      bio: `Tarjimayi hol ${MAX_BIO_LENGTH} belgidan oshmasligi kerak`,
    });
  }
  // Stripped before counting: `+998 90 123 45 67` is a phone number, and no run in it reaches seven
  // digits until the spaces come out.
  const digitsOnly = bio.replace(NUMBER_NOISE, '');
  if (FORBIDDEN.some((pattern) => pattern.test(bio)) || DIGIT_RUN.test(digitsOnly)) {
    throw new AppException(
      ERROR_CODE.BIO_NOT_ALLOWED,
      422,
      "Tarjimayi holda havola yoki telefon raqami bo'lishi mumkin emas",
    );
  }
  return bio;
}
