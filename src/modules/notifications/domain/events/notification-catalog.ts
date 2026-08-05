import { NotificationTargetType } from '../enums/notification-target-type.enum';
import { NotificationType } from '../enums/notification-type.enum';
import { GROUPING, NotificationEvent } from './notification-event';
import { clipBody, clipName, clipTitle } from './push-limits';

/**
 * The push catalogue (02-PUSH_CATALOG_BACKEND.md §3) as code — every event the app can raise, with
 * its type, destination, wording, grouping key and delivery policy fixed in one place.
 *
 * This file exists so that "which push does this event send, and does it appear in the list" has
 * exactly one answer. When those decisions live at the call sites instead, they drift: a push
 * reaches the phone that the in-app list has no row for, which §1.1 calls a defect outright.
 *
 * Every factory returns a fully-resolved `NotificationEvent`. Titles and bodies are clipped here,
 * on the way out, so no caller can produce a payload that FCM rejects (see `push-limits.ts`).
 */

/** A person with no usable name still has to be called something inside a sentence. */
const ANONYMOUS = 'Talaba';

/** §3.1 — full name, else username, else a generic stand-in. Same rule on every row. */
export function displayName(
  fullName: string | null | undefined,
  username: string | null | undefined,
): string {
  return clipName(fullName) ?? clipName(username) ?? ANONYMOUS;
}

/** Shared shape of the five conversation/people rows (§3.1). All are urgent: people are waiting. */
function conversationEvent(
  recipientId: string,
  conversationId: string,
  title: string,
  body: string | null,
  type: NotificationType,
  extraData?: Record<string, string>,
): NotificationEvent {
  return {
    recipientId,
    type,
    title: clipTitle(title),
    body: clipBody(body),
    target: { type: NotificationTargetType.CHAT, id: conversationId },
    grouping: GROUPING.chat(conversationId),
    conversationId,
    ...(extraData === undefined ? {} : { extraData }),
    urgent: true,
    push: true,
  };
}

/** Shared shape of the owner's own-listing rows (§3.3 №6–8). Not urgent — these can wait for 08:00. */
function myListingEvent(
  recipientId: string,
  title: string,
  body: string | null,
): NotificationEvent {
  return {
    recipientId,
    type: NotificationType.LISTING,
    title: clipTitle(title),
    body: clipBody(body),
    target: { type: NotificationTargetType.MY_LISTINGS, id: null },
    grouping: GROUPING.myListings(),
    urgent: false,
    push: true,
  };
}

export const NotificationCatalog = {
  // ---- §3.1 Conversations and people -------------------------------------------------------

  /** №1 — a new message while the recipient's conversation is closed. */
  newMessage(params: {
    recipientId: string;
    conversationId: string;
    senderName: string;
    text: string;
    /** Keys today's app already reads: `messageType`, `senderId`, `senderName`, `senderAvatarUrl`. */
    extraData?: Record<string, string>;
  }): NotificationEvent {
    return conversationEvent(
      params.recipientId,
      params.conversationId,
      params.senderName,
      params.text,
      NotificationType.CHAT,
      params.extraData,
    );
  },

  // №2 (album) has no factory of its own yet. The requirement that matters — **one** push and
  // **one** row for a ten-photo send, not ten — is met by the gateway suppressing every message
  // after the first, so an album arrives through `newMessage` above. The wording `📷 N ta rasm`
  // is what is missing, and it cannot be produced: the count is 1 at the moment the first image is
  // processed, and the client sends no album size. See the response document — this needs
  // `albumSize` on the first message of an album before it can be written honestly.

  /**
   * №3 — how a finished call is reported, the missed one included.
   *
   * Typed `CHAT` rather than a new `CALL` (§7.1): it belongs to the conversation, and the client
   * already draws that icon. A new type would come out as `SYSTEM` on every deployed build.
   *
   * `text` is passed in because a call row is not only ever "missed" — an answered call reports its
   * duration, a declined one says so. The catalogue's job here is the routing and the grouping key,
   * not re-deriving wording the chat layer has already worked out.
   *
   * The ringing itself is never listed (§3.2); only its outcome reaches this.
   */
  callMessage(params: {
    recipientId: string;
    conversationId: string;
    /** The caller, under the same name the ordinary message factory uses — the gateway picks
     * between the two on `message.type` and must not have to reshape its arguments to do it. */
    senderName: string;
    text: string;
    extraData?: Record<string, string>;
  }): NotificationEvent {
    const event = conversationEvent(
      params.recipientId,
      params.conversationId,
      params.senderName,
      params.text,
      NotificationType.CHAT,
      params.extraData,
    );
    // The one place a conversation row groups under the call key instead of the chat key (§4.1):
    // a call must not replace the unread message sitting above it in the tray.
    return { ...event, grouping: GROUPING.call(params.conversationId) };
  },

  /** №4 — somebody wants to connect. Opens the requests tab, which needs no id. */
  connectionRequest(params: { recipientId: string; requesterName: string }): NotificationEvent {
    return {
      recipientId: params.recipientId,
      type: NotificationType.CONNECTION,
      title: clipTitle('Yangi so‘rov'),
      body: clipBody(`${params.requesterName} siz bilan bog‘lanmoqchi`),
      target: { type: NotificationTargetType.CONNECTION_REQUESTS, id: null },
      grouping: GROUPING.connection(),
      urgent: true,
      push: true,
    };
  },

  /** №5 — the request was accepted; there is now a conversation to open. */
  connectionAccepted(params: {
    recipientId: string;
    accepterName: string;
    conversationId: string;
  }): NotificationEvent {
    const event = conversationEvent(
      params.recipientId,
      params.conversationId,
      params.accepterName,
      'So‘rovingiz qabul qilindi — endi yozishingiz mumkin',
      NotificationType.CONNECTION,
    );
    return { ...event, grouping: GROUPING.connection() };
  },

  // ---- §3.3 Listings -----------------------------------------------------------------------

  // №6 and №7 (moderation passed / refused) have no factory, because this backend raises no such
  // event: a student listing is published the moment it is submitted — `student-listings.service.ts`
  // is explicit that REJECTED and PENDING_REVIEW are "contract-only states this phase never
  // writes", and there is no admin surface for them. The only moderation that exists is for
  // *business* listings, whose owner is a `BusinessOwner` and not a row this table can address.
  // Writing the factories now would be writing for a caller that cannot exist. See the response
  // document.

  /** №8 — closing soon. Sent once in a listing's life (§5.2), not every day. */
  listingExpiring(params: {
    recipientId: string;
    listingTitle: string;
    days: number;
  }): NotificationEvent {
    return myListingEvent(
      params.recipientId,
      'E‘lon muddati tugayapti',
      `"${params.listingTitle}" ${params.days} kundan keyin yopiladi`,
    );
  },

  /**
   * №9 — the daily digest of matching jobs (§5.1).
   *
   * One listing names it and opens it; several collapse into a count that opens the list, because
   * twelve separate pushes on a weekday morning is how an app gets its notifications switched off.
   * Each listing still gets its own row in the list — only the push is pooled.
   */
  jobDigest(params: {
    recipientId: string;
    count: number;
    firstTitle: string;
    firstSubtitle: string | null;
    firstListingId: string;
  }): NotificationEvent {
    const single = params.count === 1;
    return {
      recipientId: params.recipientId,
      type: NotificationType.JOB,
      title: clipTitle(single ? 'Yangi ish e‘loni' : `${params.count} ta yangi ish e‘loni`),
      body: clipBody(
        single
          ? [params.firstTitle, params.firstSubtitle].filter(Boolean).join(' — ')
          : 'Sizga mos ish e‘lonlari chiqdi',
      ),
      // A digest of several opens the list rather than an arbitrary one of them (§5.1).
      target: single ? { type: NotificationTargetType.LISTING, id: params.firstListingId } : null,
      grouping: GROUPING.feed(),
      urgent: false,
      push: true,
    };
  },

  /** №10 — a discount the student saved is about to end. Once per listing (§5.2). */
  discountExpiring(params: {
    recipientId: string;
    listingId: string;
    merchant: string;
    discount: string;
    days: number;
  }): NotificationEvent {
    return {
      recipientId: params.recipientId,
      type: NotificationType.DISCOUNT,
      title: clipTitle('Chegirma tugayapti'),
      body: clipBody(`${params.merchant}: ${params.discount} — ${params.days} kun qoldi`),
      target: { type: NotificationTargetType.LISTING, id: params.listingId },
      grouping: GROUPING.feed(),
      urgent: false,
      push: true,
    };
  },

  // ---- §3.4 System -------------------------------------------------------------------------

  /**
   * №11 — an announcement. **No push by default** (§3.4): it lands in the list and the user finds
   * it. `sendPush` is the admin's explicit opt-in, and it exists precisely so that marketing
   * cannot become the reason someone turns notifications off and loses their chat alerts with them.
   */
  system(params: {
    recipientId: string;
    title: string;
    body: string | null;
    sendPush: boolean;
  }): NotificationEvent {
    return {
      recipientId: params.recipientId,
      type: NotificationType.SYSTEM,
      title: clipTitle(params.title),
      body: clipBody(params.body),
      target: null,
      grouping: GROUPING.system(),
      urgent: false,
      push: params.sendPush,
    };
  },

  /** №12 — something about their own account. Always pushed; it is never marketing. */
  profile(params: { recipientId: string; title: string; body: string | null }): NotificationEvent {
    return {
      recipientId: params.recipientId,
      type: NotificationType.SYSTEM,
      title: clipTitle(params.title),
      body: clipBody(params.body),
      target: { type: NotificationTargetType.PROFILE, id: null },
      grouping: GROUPING.system(),
      urgent: false,
      push: true,
    };
  },
} as const;
