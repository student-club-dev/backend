import { ERROR_CODE } from '../../../common/errors/error-code';
import { MediaKind } from '../../media/domain/enums/media-kind.enum';
import { MessageType } from './enums/message-type.enum';
import {
  MAX_CAPTION_LENGTH,
  MAX_TEXT_LENGTH,
  normalizeBody,
  requiredKindFor,
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

describe('requiredKindFor', () => {
  it('maps each media type to the attachment kind it must carry', () => {
    expect(requiredKindFor(MessageType.IMAGE)).toBe(MediaKind.IMAGE);
    expect(requiredKindFor(MessageType.GIF)).toBe(MediaKind.GIF);
    expect(requiredKindFor(MessageType.VIDEO)).toBe(MediaKind.VIDEO);
    expect(requiredKindFor(MessageType.VOICE)).toBe(MediaKind.VOICE);
    expect(requiredKindFor(MessageType.FILE)).toBe(MediaKind.FILE);
  });

  it('expects no attachment on the non-media types', () => {
    expect(requiredKindFor(MessageType.TEXT)).toBeNull();
    expect(requiredKindFor(MessageType.STICKER)).toBeNull();
    expect(requiredKindFor(MessageType.SYSTEM)).toBeNull();
  });
});
