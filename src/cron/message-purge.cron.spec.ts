import { ChatService } from '../modules/chat/application/chat.service';
import { MessagePurgeCron } from './message-purge.cron';

function makeService(purgeClearedMessages: jest.Mock): ChatService {
  return { purgeClearedMessages } as unknown as ChatService;
}

describe('MessagePurgeCron', () => {
  it('runs the sweep every tick', async () => {
    const purge = jest.fn().mockResolvedValue(12);
    await new MessagePurgeCron(makeService(purge)).purge();
    expect(purge).toHaveBeenCalledTimes(1);
  });

  it('does not throw when a sweep fails — the next tick retries', async () => {
    const purge = jest.fn().mockRejectedValue(new Error('db down'));
    await expect(new MessagePurgeCron(makeService(purge)).purge()).resolves.toBeUndefined();
    expect(purge).toHaveBeenCalledTimes(1);
  });
});
