import { ERROR_CODE } from '../../../common/errors/error-code';
import { Call } from '../domain/entities/call.entity';
import { CallEndReason } from '../domain/enums/call-end-reason.enum';
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallParty } from '../domain/enums/call-party.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { IceCandidateType } from '../domain/enums/ice-candidate-type.enum';
import { CallStatsService } from './call-stats.service';

const CALLER = 'std_caller';
const CALLEE = 'std_callee';
const STRANGER = 'std_stranger';
const CALL_ID = 'b3f1c2d4-5e6a-4b7c-8d9e-0f1a2b3c4d5e';

const endedCall = (overrides: Partial<Call> = {}): Call => ({
  id: CALL_ID,
  conversationId: 'cnv_1',
  callerId: CALLER,
  calleeId: CALLEE,
  media: CallMedia.AUDIO,
  relayOnly: true,
  status: CallStatus.ENDED,
  startedAt: new Date('2026-08-01T10:00:00.000Z'),
  answeredAt: new Date('2026-08-01T10:00:10.000Z'),
  endedAt: new Date('2026-08-01T10:03:14.000Z'),
  endReason: CallEndReason.HANGUP,
  endedBy: CallParty.CALLER,
  ...overrides,
});

describe('CallStatsService.record', () => {
  const calls = { findById: jest.fn(async (): Promise<Call | null> => endedCall()) };
  const stats = { record: jest.fn(async (input: unknown) => input) };

  const service = (): CallStatsService => new CallStatsService(calls as never, stats as never);

  const input = { candidateType: IceCandidateType.RELAY, rttMs: 42, bytesSent: 3_000_000_000 };

  beforeEach(() => jest.clearAllMocks());

  it('records the report for the caller', async () => {
    await service().record(CALLER, CALL_ID, input);
    expect(stats.record).toHaveBeenCalledWith(
      expect.objectContaining({ callId: CALL_ID, studentId: CALLER, rttMs: 42 }),
    );
  });

  // Both ends report separately — the row is keyed on (call, student), and a call where one side
  // relayed and the other did not is exactly the case this table exists to capture.
  it('records the report for the callee too', async () => {
    await service().record(CALLEE, CALL_ID, input);
    expect(stats.record).toHaveBeenCalledWith(expect.objectContaining({ studentId: CALLEE }));
  });

  it('rejects a call that does not exist', async () => {
    calls.findById.mockResolvedValueOnce(null);
    await expect(service().record(CALLER, CALL_ID, input)).rejects.toMatchObject({
      code: ERROR_CODE.CALL_NOT_FOUND,
      status: 404,
    });
    expect(stats.record).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ 403, not 404 (CLAUDE.md): someone else's call is refused outright. Paired with the fact that
   * `studentId` comes from the token, this is what stops a stranger writing rows against calls they
   * were never part of — which would poison the relay share the whole TURN budget is decided on.
   */
  it('refuses a student who was not on the call, with 403 rather than 404', async () => {
    await expect(service().record(STRANGER, CALL_ID, input)).rejects.toMatchObject({
      code: ERROR_CODE.FORBIDDEN,
      status: 403,
    });
    expect(stats.record).not.toHaveBeenCalled();
  });

  /**
   * A never-answered call carried no media, so no candidate pair was ever selected and no byte was
   * relayed. Accepting a RELAY row for one would inflate the relay share with calls that cost
   * nothing — the table must mean "calls that actually connected".
   */
  it('refuses a call that was never answered', async () => {
    calls.findById.mockResolvedValueOnce(
      endedCall({ status: CallStatus.MISSED, answeredAt: null }),
    );
    await expect(service().record(CALLER, CALL_ID, input)).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_CALL_STATE,
      status: 409,
    });
    expect(stats.record).not.toHaveBeenCalled();
  });

  // The repository takes `null`, not `undefined` — an omitted field must reach the row as SQL NULL.
  it('normalises omitted measurements to null', async () => {
    await service().record(CALLER, CALL_ID, { candidateType: IceCandidateType.SRFLX });
    expect(stats.record).toHaveBeenCalledWith(
      expect.objectContaining({
        rttMs: null,
        jitterMs: null,
        packetsLost: null,
        packetsReceived: null,
        bytesSent: null,
        bytesReceived: null,
      }),
    );
  });
});
