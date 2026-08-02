import 'reflect-metadata';
import { CallMedia } from '../../domain/enums/call-media.enum';
import { AppException } from '../../../../common/exceptions/app.exception';
import { IceDto, InviteDto, validateWsPayload } from './call-ws.dto';

describe('validateWsPayload', () => {
  // A real uuid v4 — `callId` is validated with `@IsUUID('4')`, so a filler string is rejected for
  // the wrong reason and would make these tests pass without proving anything.
  const CALL_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const validInvite = { calleeId: 'c'.repeat(25), media: CallMedia.AUDIO, sdp: 'v=0\r\n' };

  it('accepts a well-formed invite', async () => {
    await expect(validateWsPayload(InviteDto, validInvite)).resolves.toMatchObject({
      media: CallMedia.AUDIO,
    });
  });

  // ⚠️ The global ValidationPipe never sees a @MessageBody() typed as an interface — its metatype
  // is Object, so it validates nothing. Without this helper all 16 events ship unvalidated.
  it('rejects a non-object payload', async () => {
    await expect(validateWsPayload(InviteDto, null)).rejects.toBeInstanceOf(AppException);
    await expect(validateWsPayload(InviteDto, 'nope')).rejects.toBeInstanceOf(AppException);
  });

  it('rejects an unknown media type', async () => {
    await expect(
      validateWsPayload(InviteDto, { ...validInvite, media: 'HOLOGRAM' }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects extra properties', async () => {
    await expect(validateWsPayload(InviteDto, { ...validInvite, evil: 1 })).rejects.toBeInstanceOf(
      AppException,
    );
  });

  // Every forwarded event is republished through the Redis adapter to every instance, so an
  // oversized SDP is multiplied by the instance count on each send.
  it('rejects an oversized sdp', async () => {
    await expect(
      validateWsPayload(InviteDto, { ...validInvite, sdp: 'x'.repeat(65_537) }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects an oversized ICE candidate', async () => {
    await expect(
      validateWsPayload(IceDto, {
        callId: CALL_ID,
        candidate: { candidate: 'x'.repeat(513), sdpMid: '0', sdpMLineIndex: 0 },
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects an out-of-range sdpMLineIndex', async () => {
    await expect(
      validateWsPayload(IceDto, {
        callId: CALL_ID,
        candidate: { candidate: 'a', sdpMid: '0', sdpMLineIndex: 999 },
      }),
    ).rejects.toBeInstanceOf(AppException);
  });
});
