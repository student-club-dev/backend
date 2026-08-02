import { Message } from '../../domain/entities/message.entity';
import { MessageType } from '../../domain/enums/message-type.enum';
import { MessageDto } from './message.dto';

const message: Message = {
  id: 'msg_1',
  conversationId: 'cnv_1',
  senderId: 'std_sender',
  seq: 7,
  type: MessageType.TEXT,
  body: 'salom',
  clientMsgId: 'cmid-1',
  deletedAt: null,
  albumId: null,
  attachment: null,
  sticker: null,
  replyTo: null,
  call: null,
  createdAt: new Date('2026-07-28T09:14:22.531Z'),
};

/**
 * §17.1 — the client retires its optimistic ("sending") copy by matching `clientMsgId`. Echoing it
 * to anyone but the sender would be leaking one device's idempotency key to another account.
 */
describe('MessageDto — clientMsgId visibility (§17.1)', () => {
  it('echoes clientMsgId back to the sender', () => {
    expect(MessageDto.fromDomain(message, 'std_sender').clientMsgId).toBe('cmid-1');
  });

  it('hides clientMsgId from the recipient', () => {
    expect(MessageDto.fromDomain(message, 'std_other').clientMsgId).toBeNull();
  });

  it('hides clientMsgId when there is no viewer', () => {
    expect(MessageDto.fromDomain(message, null).clientMsgId).toBeNull();
  });

  it('leaves the rest of the payload untouched', () => {
    expect(MessageDto.fromDomain(message, 'std_other')).toMatchObject({
      id: 'msg_1',
      conversationId: 'cnv_1',
      senderId: 'std_sender',
      seq: 7,
      type: MessageType.TEXT,
      body: 'salom',
      createdAt: '2026-07-28T09:14:22.531Z',
    });
  });
});
