import { Injectable, Logger } from '@nestjs/common';
import { Call } from '../domain/entities/call.entity';

type Listener = (call: Call) => void | Promise<void>;

/**
 * calls → chat, one way. Mirrors `MediaReadyBus`, and for the same reason: chat must write the CALL
 * message (it owns `seq`), but a port injected the other way round would make the two modules
 * import each other.
 */
@Injectable()
export class CallEndedBus {
  private readonly logger = new Logger(CallEndedBus.name);
  private readonly listeners: Listener[] = [];

  subscribe(listener: Listener): void {
    this.listeners.push(listener);
  }

  /**
   * ⚠️ Awaited per listener inside a try/catch — never `void listener(call)`.
   *
   * The only subscriber is `ChatGateway`, whose handler is async and runs a Prisma write: a DB blip,
   * a deadlock or a conversation deleted mid-call rejects. A fire-and-forget call would surface that
   * as an unhandled rejection, and with no global handler and `start:prod` being a bare
   * `node dist/main.js`, Node terminates the process — for every close, including from the BullMQ
   * timer worker. The call itself is already committed by the time this runs, so a failed listener
   * costs a missing chat message, and that is logged rather than swallowed.
   */
  async publish(call: Call): Promise<void> {
    await Promise.all(
      this.listeners.map(async (listener) => {
        try {
          await listener(call);
        } catch (error) {
          this.logger.error(
            `A call:ended listener failed for call ${call.id}: ${(error as Error).message}`,
          );
        }
      }),
    );
  }
}
