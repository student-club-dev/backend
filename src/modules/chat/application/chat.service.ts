import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CHAT_REPOSITORY, ChatRepository } from '../domain/chat.repository';
import { CONNECTION_CHECK, ConnectionCheckRepository } from '../domain/connection-check.repository';
import { Conversation } from '../domain/entities/conversation.entity';
import { ConversationListItem } from '../domain/entities/conversation-view.entity';
import { Message } from '../domain/entities/message.entity';
import { PRESENCE_REPOSITORY, PresenceRepository } from '../domain/presence.repository';
import { directKeyOf, Page } from './chat.io';

/**
 * Chat use-cases (docs/architecture/chat.md). 1:1 DIRECT conversations gated by an accepted
 * connection (C1); the caller id is the JWT `sub` (students only). Broadcasting is the gateway's
 * job — the service returns domain data. Depends on repository interfaces only.
 */
@Injectable()
export class ChatService {
  constructor(
    @Inject(CHAT_REPOSITORY) private readonly chat: ChatRepository,
    @Inject(CONNECTION_CHECK) private readonly connectionCheck: ConnectionCheckRepository,
    @Inject(PRESENCE_REPOSITORY) private readonly presence: PresenceRepository,
  ) {}

  /** Opens (or returns) the DIRECT conversation with a connected student. */
  async openDirect(user: AuthenticatedUser, otherId: string): Promise<Conversation> {
    if (otherId === user.id) {
      throw AppException.validation({ studentId: "O'zingiz bilan suhbat ochib bo'lmaydi" });
    }
    if (!(await this.connectionCheck.areConnected(user.id, otherId))) {
      throw new AppException(ERROR_CODE.NOT_CONNECTED, 403, "Avval bog'lanish kerak");
    }
    const directKey = directKeyOf(user.id, otherId);
    return (
      (await this.chat.findDirect(directKey)) ??
      (await this.chat.createDirect(directKey, user.id, otherId))
    );
  }

  /** Sends a text message into a conversation the caller belongs to (connection re-checked). */
  async sendMessage(
    user: AuthenticatedUser,
    conversationId: string,
    body: string,
  ): Promise<Message> {
    const text = body.trim();
    if (text.length === 0) {
      throw new AppException(ERROR_CODE.MESSAGE_EMPTY, 422, "Xabar bo'sh bo'lishi mumkin emas");
    }
    await this.assertMember(conversationId, user.id);
    const otherId = await this.chat.otherMemberId(conversationId, user.id);
    if (otherId !== null && !(await this.connectionCheck.areConnected(user.id, otherId))) {
      throw new AppException(ERROR_CODE.NOT_CONNECTED, 403, "Avval bog'lanish kerak");
    }
    return this.chat.appendMessage(conversationId, user.id, text);
  }

  /** History for a conversation the caller belongs to (newest-first, `seq`-cursor). */
  async history(
    user: AuthenticatedUser,
    conversationId: string,
    beforeSeq: number | null,
    size: number,
  ): Promise<Message[]> {
    await this.assertMember(conversationId, user.id);
    return this.chat.listMessages(conversationId, beforeSeq, size);
  }

  /** Advances the caller's read cursor. */
  async markRead(user: AuthenticatedUser, conversationId: string, seq: number): Promise<void> {
    await this.assertMember(conversationId, user.id);
    await this.chat.advanceCursor(conversationId, user.id, 'read', seq);
  }

  /** Advances the caller's delivered cursor. */
  async markDelivered(user: AuthenticatedUser, conversationId: string, seq: number): Promise<void> {
    await this.assertMember(conversationId, user.id);
    await this.chat.advanceCursor(conversationId, user.id, 'delivered', seq);
  }

  /** The caller's conversation list, with each other member's live `online` status. */
  async listConversations(
    user: AuthenticatedUser,
    page: number,
    size: number,
  ): Promise<Page<ConversationListItem>> {
    const result = await this.chat.listConversations(user.id, page, size);
    const items = await Promise.all(
      result.items.map(async (item): Promise<ConversationListItem> => {
        const online = await this.presence.isOnline(item.other.id);
        return { ...item, other: { ...item.other, online } };
      }),
    );
    return { items, total: result.total };
  }

  /** A socket connected — mark the student online. */
  async goOnline(studentId: string): Promise<void> {
    await this.presence.online(studentId);
  }

  /** A socket disconnected — decrement; on true-offline persist and return `lastSeenAt`. */
  async goOffline(studentId: string): Promise<{ offline: boolean; lastSeenAt: Date | null }> {
    const offline = await this.presence.offline(studentId);
    if (!offline) {
      return { offline: false, lastSeenAt: null };
    }
    const lastSeenAt = await this.chat.touchLastSeen(studentId);
    return { offline: true, lastSeenAt };
  }

  /** The other member's id in a conversation the caller belongs to (for broadcasting), or null. */
  otherMemberId(conversationId: string, selfId: string): Promise<string | null> {
    return this.chat.otherMemberId(conversationId, selfId);
  }

  /** Distinct conversation partners of a student — presence fan-out targets. */
  partnerIds(studentId: string): Promise<string[]> {
    return this.chat.partnerIds(studentId);
  }

  private async assertMember(conversationId: string, studentId: string): Promise<void> {
    const membership = await this.chat.findMembership(conversationId, studentId);
    if (membership === null) {
      throw AppException.notFound(ERROR_CODE.CONVERSATION_NOT_FOUND, 'Suhbat topilmadi');
    }
  }
}
