import { Logger } from '@nestjs/common';
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
import { ERROR_CODE } from '../../common/errors/error-code';
import { AppException } from '../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { Env } from '../../config/env';
import {
  CHAT_EVENT,
  CursorPayload,
  SendMessagePayload,
  TypingPayload,
} from './application/chat-events';
import { ChatService } from './application/chat.service';
import { Message } from './domain/entities/message.entity';
import { verifyStudentSocket } from './infrastructure/ws-jwt';
import { MessageDto } from './presentation/dto/message.dto';

/** All of a student's devices share this room — 1:1 delivery targets a member's personal room. */
const personalRoom = (studentId: string): string => `user:${studentId}`;

const userOf = (client: Socket): AuthenticatedUser | undefined =>
  client.data.user as AuthenticatedUser | undefined;

/**
 * Socket.IO gateway for real-time chat (`/chat`, C2/C6). JWT verified on the handshake (students
 * only); each socket joins its personal room. Delivery/receipts/typing target the other member's
 * personal room. Scales across instances via the Redis adapter attached in `main.ts`.
 */
@WebSocketGateway({ namespace: '/chat', cors: false })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly chat: ChatService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    let user: AuthenticatedUser;
    try {
      user = await verifyStudentSocket(client, this.jwt, this.config);
    } catch {
      this.logger.warn('Rejected an unauthenticated /chat socket');
      client.disconnect(true);
      return;
    }
    client.data.user = user;
    await client.join(personalRoom(user.id));
    await this.chat.goOnline(user.id);
    await this.emitPresence(user.id, true, null);
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
      return { clientMsgId: payload?.clientMsgId, status: 'error', error: unauthorized() };
    }
    try {
      const message = await this.chat.sendMessage(user, payload.conversationId, payload.body);
      await this.broadcastMessage(message);
      return {
        clientMsgId: payload.clientMsgId,
        id: message.id,
        seq: message.seq,
        createdAt: message.createdAt.toISOString(),
        status: 'sent',
      };
    } catch (error) {
      return { clientMsgId: payload.clientMsgId, status: 'error', error: toError(error) };
    }
  }

  @SubscribeMessage(CHAT_EVENT.MESSAGE_READ)
  async onRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CursorPayload,
  ): Promise<void> {
    const user = userOf(client);
    if (user === undefined) {
      return;
    }
    await this.chat.markRead(user, payload.conversationId, payload.seq);
    await this.broadcastRead(payload.conversationId, user.id, payload.seq);
  }

  @SubscribeMessage(CHAT_EVENT.MESSAGE_DELIVERED)
  async onDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CursorPayload,
  ): Promise<void> {
    const user = userOf(client);
    if (user === undefined) {
      return;
    }
    await this.chat.markDelivered(user, payload.conversationId, payload.seq);
    const otherId = await this.chat.otherMemberId(payload.conversationId, user.id);
    if (otherId !== null) {
      this.server.to(personalRoom(otherId)).emit(CHAT_EVENT.DELIVERED_RECEIPT, {
        conversationId: payload.conversationId,
        seq: payload.seq,
        byStudentId: user.id,
      });
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

  /** Broadcast a new message to both members' personal rooms (used by WS send + the REST fallback). */
  async broadcastMessage(message: Message): Promise<void> {
    if (this.server === undefined) {
      return; // no WS server bound (e.g. REST-only context) — broadcast is best-effort
    }
    const otherId = await this.chat.otherMemberId(message.conversationId, message.senderId);
    const payload = {
      conversationId: message.conversationId,
      message: MessageDto.fromDomain(message),
    };
    this.server.to(personalRoom(message.senderId)).emit(CHAT_EVENT.MESSAGE_NEW, payload);
    if (otherId !== null) {
      this.server.to(personalRoom(otherId)).emit(CHAT_EVENT.MESSAGE_NEW, payload);
    }
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

  private async emitPresence(
    studentId: string,
    online: boolean,
    lastSeenAt: string | null,
  ): Promise<void> {
    const partners = await this.chat.partnerIds(studentId);
    if (partners.length === 0) {
      return;
    }
    this.server
      .to(partners.map(personalRoom))
      .emit(CHAT_EVENT.PRESENCE_UPDATE, { studentId, online, lastSeenAt });
  }
}

function toError(error: unknown): { code: string; message: string } {
  if (error instanceof AppException) {
    return { code: error.code, message: error.message };
  }
  return { code: ERROR_CODE.INTERNAL_ERROR, message: 'Xatolik yuz berdi' };
}

function unauthorized(): { code: string; message: string } {
  return { code: ERROR_CODE.UNAUTHORIZED, message: 'Avtorizatsiyadan o‘tilmagan' };
}
