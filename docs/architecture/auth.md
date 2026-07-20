# Auth — design decisions (ElonUz backend)

**Status:** draft — being defined interactively (grill-me). Feeds the **M-auth** implementation.
**Context:** Own auth (no Firebase). Email+password, Google/Apple OAuth, SMS OTP (Eskiz + Redis), JWT access+refresh. See `CLAUDE.md` → "Auth & Ownership" and `docs/architecture/otp-sms-eskiz.md`.

---

## Decisions

### D1 — Identity: phone is the trust anchor, verified *lazily*
- An account can be created by **any** method: email+password, Google, or Apple. Phone is **not** required to create an account or to **browse** (public catalog + discounts feed).
- **Phone + SMS OTP verification is required only for trust-sensitive actions**: redeeming an offer, and creating/managing a business.
- Rationale: student audience — minimise signup friction, let them browse first (Google one-tap), ask for the verified phone only when trust matters. In the UZ market phone is the reliable identifier.

### D2 — Token lifetimes
- **Access token:** JWT, **15 min**, stateless (verified by signature, not stored server-side). Sent on every request.
- **Refresh token:** **60 days**, **rotating** (each `/auth/refresh` issues a new one and resets the clock — sliding expiry), stored **hashed** in the `RefreshToken` table, revocable.
- Effect: active users effectively never re-login; inactive for 60 days → re-login. Short access token limits the blast radius if leaked.

### D3 — Sessions & multi-device
- **One refresh token per device/session**, with metadata: `deviceName`, `platform` (iOS/Android), `lastUsedAt`, `ipAddress`, `createdAt`.
- Users can see a **device/session list**.
- **Logout:** revoke a single device's refresh token; **"logout all devices"** revokes all. **Password change → revoke all** (force re-login everywhere).
- Requires extending the `RefreshToken` model with the device-metadata columns above.

### D4 — Account linking
- One account per person. **Primary stable key: the OAuth provider's account id** (`OAuthAccount(provider, providerAccountId)` — already unique). A provider login whose **verified email** matches an existing account attaches to it (new `OAuthAccount` row on the same `userId`). Rule of thumb: **one verified email = one account**.
- **Apple caveat:** Apple may return a **private-relay** email (`…@privaterelay.appleid.com`) or none, and reliably sends email/name only on the **first** authorization. Never rely on email alone for Apple — persist the Apple `sub` (`providerAccountId`) on first sign-in and match on it thereafter.

### D5 — Password reset channel (priority: phone → email)
- **Has a verified phone → SMS OTP reset** (preferred, even if an email is also on file).
- **No verified phone** (e.g. Google-only, or email signup without phone) **→ email-code reset** (6-digit code to the account email, short TTL, same Redis-backed pattern as the SMS OTP).
- OAuth-only account with no password → nothing to reset; prompt "sign in with your provider". (Adding a password later = a separate "set password" flow — see open questions.)
- **Implication:** needs an **email sender** (`src/infrastructure/email`, currently empty) in addition to SMS. Provider TBD (SMTP / Resend / SendGrid).

### D6 — Two separate account types (separate tables)
- **Two independent account tables:** `students` and `business_owners`. Each holds its **own auth fields** (email, phone, passwordHash, phoneVerified, emailVerified, timestamps) **+ type-specific profile fields** (students: universityId, universityEmail, birthYear, courseYear, gender; business_owners: personal identity — business details live in `Business`).
- The two mobile apps are **fully separate**: the student app authenticates only against `students`, the provider app only against `business_owners`. A business owner therefore **cannot** enter the student app with their business identity — they'd register a separate student account.
- **Same email may exist independently in each table** (biznes@gmail.com as a business ≠ as a student — two accounts). Uniqueness is per-table.
- **Auth written once:** a shared auth **core** (register/login/OAuth/OTP/refresh/reset) parameterised by account type, with **per-type repositories** — NOT copy-pasted.
- `OAuthAccount` and `RefreshToken` are per type (student_* / business_* sets); FKs to the respective table.
- **Supersedes the single `User` model.** The `role` enum becomes redundant (the table *is* the type). D1–D5 flows apply within each account type.
- **Schema impact:** replace `users` with `students` + `business_owners`; repoint `Business.ownerUserId` → `business_owners`, `Redemption.studentUserId` → `students`; new migration (no data yet → cheap). Catalog module untouched.

---

## Open questions (grilling in progress)
- **OTP abuse protection** specifics (resend cooldown, attempt caps, per-phone / per-IP rate limits) — partly in `otp-sms-eskiz.md`.
- **OAuth-only accounts** — do they ever get a password? Set-password flow?
- **Email provider** for the email-code reset path (D5).
