import { ERROR_CODE } from '../../../common/errors/error-code';
import { MediaKind } from '../../media/domain/enums/media-kind.enum';
import { MessageType } from './enums/message-type.enum';
import {
  assertQuoteMatches,
  carriesAttachment,
  kindFitsType,
  MAX_CAPTION_LENGTH,
  MAX_QUOTE_LENGTH,
  MAX_TEXT_LENGTH,
  normalizeBody,
} from './message-composition';

describe('normalizeBody', () => {
  it('requires text on a TEXT message', () => {
    expect(() => normalizeBody(MessageType.TEXT, '   ')).toThrow(
      expect.objectContaining({ code: ERROR_CODE.MESSAGE_EMPTY }),
    );
    expect(() => normalizeBody(MessageType.TEXT, null)).toThrow();
  });

  it('trims a TEXT body', () => {
    expect(normalizeBody(MessageType.TEXT, '  salom  ')).toBe('salom');
  });

  it('caps a TEXT body at 4000', () => {
    expect(normalizeBody(MessageType.TEXT, 'a'.repeat(MAX_TEXT_LENGTH))).toHaveLength(
      MAX_TEXT_LENGTH,
    );
    expect(() => normalizeBody(MessageType.TEXT, 'a'.repeat(MAX_TEXT_LENGTH + 1))).toThrow(
      expect.objectContaining({ code: ERROR_CODE.VALIDATION_ERROR }),
    );
  });

  it.each([MessageType.IMAGE, MessageType.VIDEO, MessageType.FILE])(
    'allows an optional caption on %s',
    (type) => {
      expect(normalizeBody(type, 'Kecha universitetda')).toBe('Kecha universitetda');
      expect(normalizeBody(type, undefined)).toBeNull();
      expect(normalizeBody(type, '  ')).toBeNull();
    },
  );

  it('caps a caption at 1024', () => {
    expect(() => normalizeBody(MessageType.IMAGE, 'a'.repeat(MAX_CAPTION_LENGTH + 1))).toThrow(
      expect.objectContaining({ code: ERROR_CODE.VALIDATION_ERROR }),
    );
  });

  it.each([MessageType.GIF, MessageType.VOICE, MessageType.STICKER])(
    'refuses a caption on %s, rather than dropping it silently',
    (type) => {
      expect(() => normalizeBody(type, 'izoh')).toThrow(
        expect.objectContaining({ code: ERROR_CODE.VALIDATION_ERROR }),
      );
      expect(normalizeBody(type, null)).toBeNull();
    },
  );
});

describe('kindFitsType', () => {
  it('matches each media type to the attachment kind it carries', () => {
    expect(kindFitsType(MessageType.IMAGE, MediaKind.IMAGE)).toBe(true);
    expect(kindFitsType(MessageType.GIF, MediaKind.GIF)).toBe(true);
    expect(kindFitsType(MessageType.VIDEO, MediaKind.VIDEO)).toBe(true);
    expect(kindFitsType(MessageType.VIDEO_NOTE, MediaKind.VIDEO_NOTE)).toBe(true);
    expect(kindFitsType(MessageType.VOICE, MediaKind.VOICE)).toBe(true);
    expect(kindFitsType(MessageType.FILE, MediaKind.FILE)).toBe(true);
  });

  // Parity spec §3: an original-quality photo is still an IMAGE message. The client renders the two
  // identically and only the bytes differ, so both kinds have to pass here.
  it('accepts either image kind on an IMAGE message', () => {
    expect(kindFitsType(MessageType.IMAGE, MediaKind.IMAGE_ORIGINAL)).toBe(true);
  });

  it('rejects a kind that belongs to another type', () => {
    expect(kindFitsType(MessageType.VIDEO, MediaKind.VIDEO_NOTE)).toBe(false);
    expect(kindFitsType(MessageType.VIDEO_NOTE, MediaKind.VIDEO)).toBe(false);
    expect(kindFitsType(MessageType.IMAGE, MediaKind.FILE)).toBe(false);
    expect(kindFitsType(MessageType.FILE, MediaKind.IMAGE)).toBe(false);
  });

  it('expects no attachment on the non-media types', () => {
    expect(carriesAttachment(MessageType.TEXT)).toBe(false);
    expect(carriesAttachment(MessageType.STICKER)).toBe(false);
    expect(carriesAttachment(MessageType.SYSTEM)).toBe(false);
    expect(carriesAttachment(MessageType.IMAGE)).toBe(true);
  });
});

describe('assertQuoteMatches', () => {
  const BODY = 'ertaga soat 10 da uchrashamizmi';

  it('accepts a quote that is the exact slice at the offset', () => {
    expect(() => assertQuoteMatches(BODY, 'soat 10 da', 7)).not.toThrow();
  });

  it('accepts a quote covering the whole body', () => {
    expect(() => assertQuoteMatches(BODY, BODY, 0)).not.toThrow();
  });

  it('rejects text that exists in the body but not at the given offset', () => {
    expect(() => assertQuoteMatches(BODY, 'soat 10 da', 0)).toThrow(
      expect.objectContaining({ code: ERROR_CODE.QUOTE_NOT_FOUND }),
    );
  });

  it('rejects text that is not in the body at all', () => {
    expect(() => assertQuoteMatches(BODY, 'ertaga kelmayman', 0)).toThrow(
      expect.objectContaining({ code: ERROR_CODE.QUOTE_NOT_FOUND }),
    );
  });

  it('rejects a quote against a message with no text', () => {
    expect(() => assertQuoteMatches(null, 'anything', 0)).toThrow(
      expect.objectContaining({ code: ERROR_CODE.QUOTE_NOT_FOUND }),
    );
  });

  it('rejects a quote longer than the cap before looking at the body', () => {
    const long = 'a'.repeat(MAX_QUOTE_LENGTH + 1);
    expect(() => assertQuoteMatches(long, long, 0)).toThrow(
      expect.objectContaining({ code: ERROR_CODE.QUOTE_TOO_LONG }),
    );
  });

  it('rejects a negative offset rather than letting slice wrap from the end', () => {
    expect(() => assertQuoteMatches(BODY, 'mi', -2)).toThrow(
      expect.objectContaining({ code: ERROR_CODE.QUOTE_NOT_FOUND }),
    );
  });

  it('counts offsets in UTF-16 code units, matching Kotlin and Swift on the client', () => {
    expect(() => assertQuoteMatches('😀 salom', 'salom', 3)).not.toThrow();
  });
});
