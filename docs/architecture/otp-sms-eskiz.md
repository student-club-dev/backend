# SMS OTP (Eskiz)

Implement SMS OTP authentication using the Eskiz SMS API.

## Requirements

- Use the official Eskiz API.
- Follow NestJS best practices.
- Follow Clean Code and SOLID principles.
- Keep the implementation simple and maintainable.

## Architecture

AuthController
    ↓
AuthService
    ↓
OtpService
    ↓
EskizService

### AuthController

Responsible only for HTTP request/response handling.

### AuthService

Responsible for authentication flow.

### OtpService

Responsible for:

- Generate a secure 6-digit OTP.
- Store OTP in Redis with a 5-minute TTL.
- Verify OTP.
- Delete OTP after successful verification.
- Prevent OTP reuse.
- Limit resend requests.
- Limit verification attempts.

### EskizService

Responsible only for communication with the Eskiz API.

- Authentication
- Access token management
- Sending OTP SMS
- Error handling
- Logging

Do not place any business logic inside EskizService.

## Redis

Store OTP in Redis.

Example key:

otp:+998901234567

TTL:

5 minutes

Never store OTP in PostgreSQL.

## Security

- 6-digit OTP
- Use cryptographically secure random generation.
- Store only the hashed OTP.
- Delete OTP after successful verification.
- Implement resend cooldown.
- Implement verification rate limiting.

## Configuration

Use environment variables.

Example:

ESKIZ_EMAIL=
ESKIZ_PASSWORD=

Never hardcode credentials.

## Goal

Create a clean, production-ready OTP module using Redis and the Eskiz SMS API.
