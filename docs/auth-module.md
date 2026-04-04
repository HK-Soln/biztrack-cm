# Auth Module � Frontend Integration Guide

This document is a detailed, frontend-focused guide to the auth module in `apps/api`. It covers endpoints, payloads, response shapes, next-step flows, OTP behavior, and client-side integration patterns.

## Base URL and Conventions

- Base URL (dev default): `http://localhost:3000`
- All request/response bodies are JSON.
- Most endpoints are `POST` with JSON bodies.
- Protected endpoints require `Authorization: Bearer <accessToken>`.

## Core Concepts

### Next Step Orchestration
Auth uses a **`nextStep`** field to drive the client flow. The backend decides what the user should do next.

`AuthNextStep` values (from `packages/types/src/auth.types.ts`):
- `verify_phone`
- `verify_email`
- `password_required`
- `confirm_login`
- `login_complete`

The client should treat `nextStep` as the **single source of truth** to determine the next screen or action.
`password_required` and `confirm_login` are only returned by `POST /auth/request-login`.

### OTP Types and Purposes
OTP codes are used for multiple purposes:
- **Phone verification**: verify ownership of phone number.
- **Email verification**: verify ownership of email.
- **Login confirmation (2-step)**: confirm login when **no password is configured** during `POST /auth/request-login`.

OTP purpose is controlled by the server via `VerificationPurpose` (server-side enum). For the client, the important part is **which endpoint returns `verification`** and what you should do next.

### Verification Payload Shape
Responses that send an OTP include a `verification` object:

```json
{
  "verification": {
    "channel": "PHONE" | "EMAIL",
    "delivery": "SMS" | "WHATSAPP", // phone only
    "expiresAt": "2026-03-28T10:00:00.000Z",
    "code": "123456" // only in non-production
  }
}
```

Notes:
- `delivery` is only present for phone OTPs.
- `code` is returned only in non-production environments (dev/test).

### Tokens
When login completes, the server returns tokens:

```json
{
  "tokens": {
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

Tokens are returned only with `nextStep: login_complete` or `/auth/login`.

---

## Endpoints

### 1) Register
`POST /auth/register`

Create a user and start the onboarding flow (phone verification always required).

**Request**
```json
{
  "name": "Jean Dupont",
  "phone": "+237612345678",
  "email": "jean@example.com",
  "password": "Password123!",
  "language": "fr",
  "preferredPhoneChannel": "WHATSAPP"
}
```

Validation highlights:
- `phone`: Cameroon format `+2376xxxxxxx` (or `6xxxxxxx`).
- `password` (optional):
  - min 8 chars
  - must include lowercase, uppercase, number, special char

**Response**
```json
{
  "nextStep": "verify_phone",
  "verification": {
    "channel": "PHONE",
    "delivery": "WHATSAPP",
    "expiresAt": "2026-03-28T10:00:00.000Z",
    "code": "123456"
  }
}
```

---

### 2) Request Login (phone/email)
`POST /auth/request-login`

Starts a login flow using **phone or email**. The backend decides the next step.

**Request**
```json
{
  "phone": "+237612345678",
  "email": "jean@example.com"
}
```

**Possible Responses**

1) Phone not verified ? send phone OTP
```json
{
  "nextStep": "verify_phone",
  "verification": {
    "channel": "PHONE",
    "delivery": "SMS",
    "expiresAt": "2026-03-28T10:00:00.000Z",
    "code": "123456"
  }
}
```

2) Email exists but not verified ? send email OTP
```json
{
  "nextStep": "verify_email",
  "verification": {
    "channel": "EMAIL",
    "expiresAt": "2026-03-28T10:00:00.000Z",
    "code": "123456"
  }
}
```

3) Password configured ? ask for password
```json
{ "nextStep": "password_required" }
```

4) No password configured ? send login confirmation OTP
```json
{
  "nextStep": "confirm_login",
  "verification": {
    "channel": "PHONE",
    "delivery": "WHATSAPP",
    "expiresAt": "2026-03-28T10:00:00.000Z",
    "code": "123456"
  }
}
```

---

### 3) Request Login OTP (phone)
`POST /auth/request-login-otp`

Explicitly requests a phone OTP for login (uses phone only). This behaves the same as calling `/auth/request-login` with phone only.

**Request**
```json
{ "phone": "+237612345678" }
```

**Response**
Same as `/auth/request-login`.

---

### 4) Verify Phone
`POST /auth/verify-phone`

Verify phone number with OTP. This can occur after register or during login.

**Request**
```json
{ "phone": "+237612345678", "code": "123456" }
```

**Possible Responses**
- If email exists and not verified ? `verify_email`
- Otherwise ? `login_complete` + tokens (auto-login)

---

### 5) Verify Email
`POST /auth/verify-email`

Verify email with OTP.

**Request**
```json
{ "email": "jean@example.com", "code": "123456" }
```

**Possible Responses**
- `login_complete` + tokens (auto-login)

---

### 6) Login (Password)
`POST /auth/login`

Standard password login (phone or email + password).

**Request**
```json
{ "phone": "+237612345678", "password": "Password123!" }
```

**Response**
```json
{
  "tokens": {
    "accessToken": "...",
    "refreshToken": "..."
  },
  "user": {
    "id": "...",
    "name": "Jean Dupont",
    "phone": "+237612345678",
    "email": "jean@example.com",
    "role": "OWNER",
    "language": "fr",
    "isEmailVerified": true,
    "isPhoneVerified": true,
    "isActive": true,
    "preferredPhoneChannel": "SMS",
    "businessId": null,
    "createdAt": "2026-03-28T10:00:00.000Z",
    "updatedAt": "2026-03-28T10:00:00.000Z"
  }
}
```

---

### 7) Login with OTP (Confirm Login)
`POST /auth/login-otp`

Confirms login using an OTP (2-step login) when no password is configured.

**Request**
```json
{ "phone": "+237612345678", "code": "123456" }
```

**Response**
```json
{
  "nextStep": "login_complete",
  "displayName": "Jean Dupont",
  "tokens": {
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

---

### 8) Refresh Token
`POST /auth/refresh`

**Request**
```json
{ "refreshToken": "..." }
```

**Response**
```json
{
  "tokens": {
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

---

### 9) Logout
`POST /auth/logout`

Requires `Authorization: Bearer <accessToken>`.

**Request**
```json
{ "refreshToken": "..." }
```

**Response**
`200 OK` with empty body.

---

### 10) Me (JWT Payload)
`GET /auth/me`

Returns the JWT payload, not the full user entity. Requires `Authorization` header.

**Response**
```json
{
  "sub": "user-id",
  "email": "jean@example.com",
  "phone": "+237612345678",
  "role": "OWNER",
  "businessId": null
}
```

---

## Client Flow Decision Matrix

When the client receives a `nextStep`, it should respond as follows:

- `verify_phone` ? show phone OTP input; call `POST /auth/verify-phone`
- `verify_email` ? show email OTP input; call `POST /auth/verify-email`
- `password_required` ? show password screen; call `POST /auth/login`
- `confirm_login` ? show OTP input (2-step); call `POST /auth/login-otp`
- `login_complete` ? store tokens, proceed to app

---

## Error Handling (Important Codes)

Auth endpoints throw structured errors. Expect `code` and HTTP status in error responses. Common error codes:

- `EMAIL_IN_USE`
- `PHONE_IN_USE`
- `PASSWORD_NOT_CONFIGURED`
- `INVALID_CREDENTIALS`
- `INVALID_CODE`
- `LOGIN_IDENTIFIER_REQUIRED`
- `EMAIL_MISMATCH`
- `ACCOUNT_DEACTIVATED`
- `PHONE_NOT_VERIFIED`
- `EMAIL_NOT_VERIFIED`
- `INVALID_REFRESH_TOKEN`

Frontend should map these codes to user-friendly messages.

---

## Frontend Integration Notes

- Always **lowercase emails** before sending to be consistent with backend lookup.
- When `nextStep` is `confirm_login`, the OTP is **sent to the phone** (channel: `PHONE`).
- After `verify_phone` or `verify_email`, the server may return `nextStep: login_complete` with tokens.
- The OTP `code` field is **dev/test only**; production responses do not include it.
- Tokens are short-lived; refresh with `/auth/refresh` when needed.
- When login completes via OTP, **use the returned `displayName`** for immediate UI (do not expect user data in nextStep responses).

---

## Sequence Example (No Password)

1) `POST /auth/request-login` ? `nextStep: confirm_login` + phone OTP
2) User enters OTP
3) `POST /auth/login-otp` ? `nextStep: login_complete` + tokens
4) Store tokens and proceed

---

## Files of Interest (Backend)

- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/dto/*.ts`
- `packages/types/src/auth.types.ts`
- `apps/api/src/entities/verification-code.entity.ts`

---

If you need more examples or want a UI-specific checklist for each screen, let me know and I�ll add it.
