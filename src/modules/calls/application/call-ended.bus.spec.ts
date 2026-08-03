import { Call } from '../domain/entities/call.entity';
import { CallEndReason } from '../domain/enums/call-end-reason.enum';
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallParty } from '../domain/enums/call-party.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { CallEndedBus } from './call-ended.bus';

const call: Call = {
  id: 'call_1',
  conversationId: 'cnv_1',
  callerId: 'std_caller',
  calleeId: 'std_callee',
  media: CallMedia.AUDIO,
  relayOnly: false,
  status: CallStatus.ENDED,
  startedAt: new Date('2026-08-01T10:00:00.000Z'),
  answeredAt: new Date('2026-08-01T10:00:10.000Z'),
  endedAt: new Date('2026-08-01T10:03:14.000Z'),
  endReason: CallEndReason.HANGUP,
  endedBy: CallParty.CALLER,
};

describe('CallEndedBus', () => {
  it('delivers to every subscriber', async () => {
    const bus = new CallEndedBus();
    const first = jest.fn();
    const second = jest.fn();
    bus.subscribe(first);
    bus.subscribe(second);

    await bus.publish(call);

    expect(first).toHaveBeenCalledWith(call);
    expect(second).toHaveBeenCalledWith(call);
  });

  /**
   * ⚠️ The one subscriber is `ChatGateway`, whose handler runs a Prisma write. Fire-and-forget
   * (`void listener(call)`) turned any rejection — a DB blip, a deadlock, a conversation deleted
   * mid-call — into an unhandled rejection, and with no global handler Node kills the process. This
   * path was dead while calls and chat held separate bus instances; wiring them up made it live.
   */
  it('does not propagate a rejecting subscriber', async () => {
    const bus = new CallEndedBus();
    bus.subscribe(async () => {
      throw new Error('prisma transaction failed');
    });

    await expect(bus.publish(call)).resolves.toBeUndefined();
  });

  it('does not propagate a synchronously throwing subscriber', async () => {
    const bus = new CallEndedBus();
    bus.subscribe(() => {
      throw new Error('boom');
    });

    await expect(bus.publish(call)).resolves.toBeUndefined();
  });

  // One broken listener must not cost the others their notification.
  it('still delivers to the remaining subscribers when one fails', async () => {
    const bus = new CallEndedBus();
    const healthy = jest.fn();
    bus.subscribe(async () => {
      throw new Error('boom');
    });
    bus.subscribe(healthy);

    await bus.publish(call);

    expect(healthy).toHaveBeenCalledWith(call);
  });
});
