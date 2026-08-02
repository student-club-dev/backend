import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AppException } from '../../common/exceptions/app.exception';
import {
  assertTokenFresh,
  personalRoom,
  toWsError,
  userOf,
  wsUnauthorized,
} from '../../common/websocket/ws-helpers';
import { VerifiedSocket, verifyStudentSocket } from '../../common/websocket/ws-jwt';
import type { Env } from '../../config/env';
import { CallEndedBus } from '../calls/application/call-ended.bus';
import { CallStatus } from '../calls/domain/enums/call-status.enum';
import { MediaReadyBus } from '../media/application/media-ready.bus';
import { MediaAsset } from '../media/domain/entities/media-asset.entity';
import { AttachmentDto } from '../media/presentation/dto/attachment.dto';
import { NotificationsService } from '../notifications/application/notifications.service';
import {
  CHAT_EVENT,
  ConversationDeletedPayload,
  CursorPayload,
  HistoryClearedPayload,
  MessageDeletedPayload,
  SendMessagePayload,
  TypingPayload,
} from './application/chat-events';
import { ChatService } from './application/chat.service';
import { CallSnapshot, Message } from './domain/entities/message.entity';
import { DeleteScope } from './domain/enums/delete-scope.enum';
import { MessageType } from './domain/enums/message-type.enum';
import { MessageDto } from './presentation/dto/message.dto';

/**
 * Socket.IO gateway for real-time chat (`/chat`, C2/C6). JWT verified on the handshake (students
 * only); each socket joins its personal room. Delivery/receipts/typing target the other member's
 * personal room. Scales across instances via the Redis adapter attached in `main.ts`.
 */
@WebSocketGateway({ namespace: '/chat', cors: false })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly chat: ChatService,
    private readonly notifications: NotificationsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly mediaReady: MediaReadyBus,
    private readonly callEnded: CallEndedBus,
  ) {}

  /**
   * A video finishes transcoding long after its message was sent, so the client is told out of band
   * rather than by re-sending the message.
   */
  onModuleInit(): void {
    this.mediaReady.subscribe(async (asset) => {
      if (asset.messageId === null) {
        return; // never attached to a message — nobody to tell
      }
      await this.broadcastMediaReady(asset);
    });
    // A call record appears in chat when the call ends. The bus keeps the dependency one-way:
    // chat imports calls, never the reverse.
    this.callEnded.subscribe(async (call) => {
      const message = await this.chat.appendCallMessage(call);
      await this.broadcastMessage(message);
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    let verified: VerifiedSocket;
    try {
      verified = await verifyStudentSocket(client, this.jwt, this.config);
    } catch {
      this.logger.warn('Rejected an unauthenticated /chat socket');
      client.disconnect(true);
      return;
    }
    client.data.user = verified.user;
    client.data.tokenExp = verified.expiresAt;
    await client.join(personalRoom(verified.user.id));
    await this.chat.goOnline(verified.user.id);
    await this.emitPresence(verified.user.id, true, null);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const user = userOf(client);
    if (user === undefined) {
      return;
    }
    const { offline, lastSeenAt } = await this.chat.goOffline(user.id);
    if (offline) {
      await this.emitPresence(user.id, false, lastSeenAt?.toISOString() ?? null);
    }
  }

  @SubscribeMessage(CHAT_EVENT.MESSAGE_SEND)
  async onSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SendMessagePayload,
  ): Promise<Record<string, unknown>> {
    const user = userOf(client);
    if (user === undefined) {
      return { clientMsgId: payload?.clientMsgId, status: 'error', error: wsUnauthorized() };
    }
    try {
      assertTokenFresh(client);
      const message = await this.chat.sendMessage(user, {
        conversationId: payload.conversationId,
        type: toMessageType(payload.type),
        body: payload.body,
        mediaId: payload.mediaId,
        stickerId: payload.stickerId,
        albumId: payload.albumId,
        clientMsgId: payload.clientMsgId ?? null,
        replyToMessageId: payload.replyToMessageId,
        quote: payload.quote,
      });
      await this.broadcastMessage(message);
      return {
        clientMsgId: payload.clientMsgId,
        id: message.id,
        seq: message.seq,
        createdAt: message.createdAt.toISOString(),
        status: 'sent',
      };
    } catch (error) {
      return { clientMsgId: payload.clientMsgId, status: 'error', error: toWsError(error) };
    }
  }

  /**
   * Acks with the cursor it stored (§17.8). Socket.IO only delivers an ack when the client passed a
   * callback, so returning one is invisible to clients that do not ask — but it lets those that do
   * re-send a cursor that was lost in flight instead of carrying a stale unread badge until restart.
   */
  @SubscribeMessage(CHAT_EVENT.MESSAGE_READ)
  async onRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CursorPayload,
  ): Promise<Record<string, unknown>> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: wsUnauthorized() };
    }
    try {
      assertTokenFresh(client);
      await this.chat.markRead(user, payload.conversationId, payload.seq);
      await this.broadcastRead(payload.conversationId, user.id, payload.seq);
      return { conversationId: payload.conversationId, seq: payload.seq, status: 'ok' };
    } catch (error) {
      return { status: 'error', error: toWsError(error) };
    }
  }

  @SubscribeMessage(CHAT_EVENT.MESSAGE_DELIVERED)
  async onDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CursorPayload,
  ): Promise<Record<string, unknown>> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: wsUnauthorized() };
    }
    try {
      assertTokenFresh(client);
      await this.chat.markDelivered(user, payload.conversationId, payload.seq);
      await this.broadcastDelivered(payload.conversationId, user.id, payload.seq);
      return { conversationId: payload.conversationId, seq: payload.seq, status: 'ok' };
    } catch (error) {
      return { status: 'error', error: toWsError(error) };
    }
  }

  @SubscribeMessage(CHAT_EVENT.TYPING_START)
  async onTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TypingPayload,
  ): Promise<void> {
    await this.emitTyping(client, payload.conversationId, true);
  }

  @SubscribeMessage(CHAT_EVENT.TYPING_STOP)
  async onTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TypingPayload,
  ): Promise<void> {
    await this.emitTyping(client, payload.conversationId, false);
  }

  /**
   * Broadcast a new message to both members' personal rooms (used by WS send + the REST fallback).
   * Each side gets its own payload rather than a shared one: `clientMsgId` is echoed only to the
   * sender's devices, so they can retire the optimistic copy by id instead of by text (§17.1).
   */
  async broadcastMessage(message: Message): Promise<void> {
    const otherId = await this.chat.otherMemberId(message.conversationId, message.senderId);
    // WS fan-out to both members' devices (only when a socket server is bound).
    if (this.server !== undefined) {
      this.server.to(personalRoom(message.senderId)).emit(CHAT_EVENT.MESSAGE_NEW, {
        conversationId: message.conversationId,
        message: MessageDto.fromDomain(message, message.senderId),
      });
      if (otherId !== null) {
        this.server.to(personalRoom(otherId)).emit(CHAT_EVENT.MESSAGE_NEW, {
          conversationId: message.conversationId,
          message: MessageDto.fromDomain(message, otherId),
        });
      }
    }
    // Offline push to the recipient (C8) — best-effort; only when they have no open socket.
    if (otherId !== null && !(await this.chat.isOnline(otherId))) {
      // One push per album, not one per image: the rest of a multi-image send would otherwise
      // buzz the recipient's phone ten times in a row.
      const isAlbumFollowUp =
        message.albumId !== null &&
        (await this.chat.countInAlbum(message.conversationId, message.albumId)) > 1;
      if (!isAlbumFollowUp) {
        await this.notifications.pushToStudent(otherId, {
          title: 'Yangi xabar',
          body: pushTextFor(message),
          data: {
            conversationId: message.conversationId,
            messageType: message.type,
            ...(message.albumId === null ? {} : { albumId: message.albumId }),
          },
        });
      }
    }
  }

  /**
   * Tell both members a message was deleted (§18). Only the identity is sent — the content is gone,
   * and the recipient already holds the row it needs to replace with a tombstone.
   */
  async broadcastDeleted(message: Message): Promise<void> {
    await this.broadcastBulkDeleted(
      message.conversationId,
      message.senderId,
      [message.id],
      [message.seq],
      DeleteScope.EVERYONE,
    );
  }

  /**
   * Tell the right audience a batch was deleted (§A3). A `ME` delete reaches the deleter's other
   * devices only — which is what makes "hidden for me" survive a reinstall.
   */
  async broadcastBulkDeleted(
    conversationId: string,
    deletedBy: string,
    ids: string[],
    seqs: number[],
    scope: DeleteScope,
  ): Promise<void> {
    const firstId = ids[0];
    if (this.server === undefined || firstId === undefined) {
      return;
    }
    const rooms = await this.roomsFor(conversationId, deletedBy, scope);
    const payload: MessageDeletedPayload = {
      conversationId,
      ids,
      seqs,
      scope,
      deletedBy,
      messageId: firstId,
      seq: seqs[0] ?? 0,
    };
    this.server.to(rooms).emit(CHAT_EVENT.MESSAGE_DELETED, payload);
  }

  /** Tell the right audience a history was cleared (§B1). */
  async broadcastHistoryCleared(
    conversationId: string,
    by: string,
    clearedBeforeSeq: number,
    scope: DeleteScope,
  ): Promise<void> {
    if (this.server === undefined) {
      return;
    }
    const payload: HistoryClearedPayload = { conversationId, clearedBeforeSeq, scope, by };
    this.server
      .to(await this.roomsFor(conversationId, by, scope))
      .emit(CHAT_EVENT.HISTORY_CLEARED, payload);
  }

  /** Tell the right audience a conversation was removed from a list (§B2). */
  async broadcastConversationDeleted(
    conversationId: string,
    by: string,
    scope: DeleteScope,
  ): Promise<void> {
    if (this.server === undefined) {
      return;
    }
    const payload: ConversationDeletedPayload = { conversationId, scope, by };
    this.server
      .to(await this.roomsFor(conversationId, by, scope))
      .emit(CHAT_EVENT.CONVERSATION_DELETED, payload);
  }

  /** Who a scoped change reaches: `ME` the actor's own devices, `EVERYONE` both members. */
  private async roomsFor(
    conversationId: string,
    actorId: string,
    scope: DeleteScope,
  ): Promise<string[]> {
    const rooms = [personalRoom(actorId)];
    if (scope === DeleteScope.EVERYONE) {
      const otherId = await this.chat.otherMemberId(conversationId, actorId);
      if (otherId !== null) {
        rooms.push(personalRoom(otherId));
      }
    }
    return rooms;
  }

  /** Tell both members an attachment finished processing (chat media spec §6.3). */
  async broadcastMediaReady(asset: MediaAsset): Promise<void> {
    if (this.server === undefined || asset.messageId === null) {
      return;
    }
    const message = await this.chat.findMessageById(asset.messageId);
    if (message === null) {
      return;
    }
    const otherId = await this.chat.otherMemberId(message.conversationId, message.senderId);
    const rooms = [personalRoom(message.senderId)];
    if (otherId !== null) {
      rooms.push(personalRoom(otherId));
    }
    this.server.to(rooms).emit(CHAT_EVENT.MEDIA_READY, {
      mediaId: asset.id,
      conversationId: message.conversationId,
      messageId: message.id,
      attachment: AttachmentDto.fromDomain(
        asset,
        `/${this.config.get('API_PREFIX', { infer: true })}`,
      ),
    });
  }

  /** Broadcast a read receipt to the other member (the sender whose messages were read). */
  async broadcastRead(conversationId: string, readerId: string, seq: number): Promise<void> {
    if (this.server === undefined) {
      return;
    }
    const otherId = await this.chat.otherMemberId(conversationId, readerId);
    if (otherId !== null) {
      this.server.to(personalRoom(otherId)).emit(CHAT_EVENT.READ_RECEIPT, {
        conversationId,
        seq,
        byStudentId: readerId,
      });
    }
  }

  /**
   * Broadcast a delivered receipt to the other member (the sender whose messages arrived). Shared by
   * the `message:delivered` event and its REST fallback, so both move the single tick to a double one.
   */
  async broadcastDelivered(
    conversationId: string,
    byStudentId: string,
    seq: number,
  ): Promise<void> {
    if (this.server === undefined) {
      return;
    }
    const otherId = await this.chat.otherMemberId(conversationId, byStudentId);
    if (otherId !== null) {
      this.server
        .to(personalRoom(otherId))
        .emit(CHAT_EVENT.DELIVERED_RECEIPT, { conversationId, seq, byStudentId });
    }
  }

  private async emitTyping(
    client: Socket,
    conversationId: string,
    isTyping: boolean,
  ): Promise<void> {
    const user = userOf(client);
    if (user === undefined) {
      return;
    }
    const otherId = await this.chat.otherMemberId(conversationId, user.id);
    if (otherId !== null) {
      this.server
        .to(personalRoom(otherId))
        .emit(CHAT_EVENT.TYPING, { conversationId, studentId: user.id, isTyping });
    }
  }

  /** Fans a presence change out to the student's connections; a no-op when they hid it (C7). */
  private async emitPresence(
    studentId: string,
    online: boolean,
    lastSeenAt: string | null,
  ): Promise<void> {
    const audience = await this.chat.presenceAudience(studentId);
    if (audience.length === 0) {
      return;
    }
    this.server
      .to(audience.map(personalRoom))
      .emit(CHAT_EVENT.PRESENCE_UPDATE, { studentId, online, lastSeenAt });
  }
}

/** Wire value → enum, rejecting anything unknown so a typo does not silently become TEXT. */
function toMessageType(value: string | undefined): MessageType | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!(Object.values(MessageType) as string[]).includes(value)) {
    throw AppException.validation({ type: 'Noma‘lum xabar turi' });
  }
  return value as MessageType;
}

/**
 * What the recipient sees on the lock screen (chat media spec §7). Localisation stays here rather
 * than on the client because a push arrives while the app is not running.
 */
function pushTextFor(message: Message): string {
  const caption = message.body === null ? '' : ` ${message.body}`;
  switch (message.type) {
    case MessageType.TEXT:
      return (message.body ?? '').slice(0, 120);
    case MessageType.IMAGE:
      return `📷 Rasm${caption}`.slice(0, 120);
    case MessageType.GIF:
      return '🎞 GIF';
    case MessageType.VIDEO:
      return `🎥 Video${caption}`.slice(0, 120);
    case MessageType.VOICE:
      return '🎤 Ovozli xabar';
    case MessageType.FILE:
      return `📎 ${message.attachment?.fileName ?? 'Fayl'}`.slice(0, 120);
    case MessageType.STICKER:
      return `${message.sticker?.emoji ?? ''} Stiker`.trim();
    case MessageType.SYSTEM:
      return 'Xabar';
    case MessageType.CALL:
      return callPushText(message.call);
    default: {
      // Keeps the exhaustiveness check that TS2366 used to provide: a new MessageType fails to
      // compile here. The runtime fallback is for an older pod whose client predates the member.
      const unhandled: never = message.type;
      void unhandled;
      return 'Xabar';
    }
  }
}

/**
 * ⚠️ Every CALL message used to push "Javobsiz qo‘ng‘iroq". The push goes out whenever the
 * recipient's CHAT socket is closed — routine while they are on the `/calls` socket or the app is
 * backgrounded — so an answered ten-minute call, a decline, a cancel and a glare-preemption loser
 * all told the callee they had missed a call. The status snapshot on the row is what tells them
 * apart; a missing snapshot can only be an older row, for which "missed" stays the safe default.
 */
function callPushText(call: CallSnapshot | null): string {
  if (call === null || call.status === CallStatus.MISSED) {
    return '📞 Javobsiz qo‘ng‘iroq';
  }
  // Declined, canceled, or never answered at all — a call that never reached `answeredAt` has a
  // `durationMs` of 0, which is nothing to show on a lock screen.
  if (
    call.status === CallStatus.DECLINED ||
    call.status === CallStatus.CANCELED ||
    call.durationMs <= 0
  ) {
    return '📞 Qo‘ng‘iroq';
  }
  return `📞 Qo‘ng‘iroq · ${callDurationText(call.durationMs)}`;
}

/** `m:ss`, or `h:mm:ss` once past an hour — the same shape the call bubble renders. */
function callDurationText(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, '0');
  return hours === 0
    ? `${minutes}:${paddedSeconds}`
    : `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
}
