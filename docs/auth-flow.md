# Auth Onboarding & Login Flow

This document describes the onboarding and login decision flow.

## Mermaid Diagram

```mermaid
flowchart LR
  start(["Start"]) --> reg(["Register"])
  reg --> sendPhone(["Send Phone OTP"])
  sendPhone --> verifyPhone(["Verify Phone"])
  verifyPhone --> emailProvided{"Email provided?"}
  emailProvided -->|"No"| pwConfigured1{"Password configured?"}
  emailProvided -->|"Yes"| sendEmail(["Send Email OTP"])
  sendEmail --> verifyEmail(["Verify Email"])
  verifyEmail --> pwConfigured2{"Password configured?"}
  pwConfigured1 -->|"Yes"| passwordLogin1(["Password Login"])
  pwConfigured1 -->|"No"| sendLoginOtp1(["Send Login OTP"])
  pwConfigured2 -->|"Yes"| passwordLogin2(["Password Login"])
  pwConfigured2 -->|"No"| sendLoginOtp2(["Send Login OTP"])
  sendLoginOtp1 --> verifyLoginOtp1(["Confirm Login OTP"])
  sendLoginOtp2 --> verifyLoginOtp2(["Confirm Login OTP"])
  passwordLogin1 --> loginSuccess(["Login Success + Tokens"])
  passwordLogin2 --> loginSuccess
  verifyLoginOtp1 --> loginSuccess
  verifyLoginOtp2 --> loginSuccess

  start --> requestLogin(["Request Login (phone/email)"])
  requestLogin --> phoneVerified{"Phone verified?"}
  phoneVerified -->|"No"| sendPhone
  phoneVerified -->|"Yes"| emailVerified{"Email exists & verified?"}
  emailVerified -->|"No"| sendEmail
  emailVerified -->|"Yes"| pwConfigured3{"Password configured?"}
  pwConfigured3 -->|"Yes"| passwordLogin3(["Password Login"])
  pwConfigured3 -->|"No"| sendLoginOtp3(["Send Login OTP"])
  sendLoginOtp3 --> verifyLoginOtp3(["Confirm Login OTP"])
  passwordLogin3 --> loginSuccess
  verifyLoginOtp3 --> loginSuccess
```

## API Flow (Endpoints)

```mermaid
flowchart LR
  start(["Start"]) --> reg(["Register (POST /auth/register)"])
  reg --> sendPhone(["Send Phone OTP (response from /auth/register)"])
  sendPhone --> verifyPhone(["Verify Phone (POST /auth/verify-phone)"])
  verifyPhone --> emailProvided{"Email provided? (request payload)"}
  emailProvided -->|"No"| pwConfigured1{"Password configured? (server decision)"}
  emailProvided -->|"Yes"| sendEmail(["Send Email OTP (response from /auth/verify-phone or /auth/request-login)"])
  sendEmail --> verifyEmail(["Verify Email (POST /auth/verify-email)"])
  verifyEmail --> pwConfigured2{"Password configured? (server decision)"}
  pwConfigured1 -->|"Yes"| passwordLogin1(["Password Login (POST /auth/login)"])
  pwConfigured1 -->|"No"| sendLoginOtp1(["Send Login OTP (response from /auth/verify-phone or /auth/verify-email)"])
  pwConfigured2 -->|"Yes"| passwordLogin2(["Password Login (POST /auth/login)"])
  pwConfigured2 -->|"No"| sendLoginOtp2(["Send Login OTP (response from /auth/verify-email)"])
  sendLoginOtp1 --> verifyLoginOtp1(["Confirm Login OTP (POST /auth/login-otp)"])
  sendLoginOtp2 --> verifyLoginOtp2(["Confirm Login OTP (POST /auth/login-otp)"])
  passwordLogin1 --> loginSuccess(["Login Success + Tokens"])
  passwordLogin2 --> loginSuccess
  verifyLoginOtp1 --> loginSuccess
  verifyLoginOtp2 --> loginSuccess

  start --> requestLogin(["Request Login (POST /auth/request-login)"])
  requestLogin --> phoneVerified{"Phone verified? (server decision)"}
  phoneVerified -->|"No"| sendPhoneLogin(["Send Phone OTP (response from /auth/request-login)"])
  phoneVerified -->|"Yes"| emailVerified{"Email exists & verified? (server decision)"}
  emailVerified -->|"No"| sendEmailLogin(["Send Email OTP (response from /auth/request-login or /auth/verify-phone)"])
  emailVerified -->|"Yes"| pwConfigured3{"Password configured? (server decision)"}
  pwConfigured3 -->|"Yes"| passwordLogin3(["Password Login (POST /auth/login)"])
  pwConfigured3 -->|"No"| sendLoginOtp3(["Send Login OTP (response from /auth/request-login or /auth/verify-email)"])
  sendLoginOtp3 --> verifyLoginOtp3(["Confirm Login OTP (POST /auth/login-otp)"])
  passwordLogin3 --> loginSuccess
  verifyLoginOtp3 --> loginSuccess
```

## Notes

- Phone is mandatory for all users and must be verified first.
- Email is optional; if present it must be verified before password or login OTP confirmation.
- If no password is configured, successful verification results in a login OTP confirmation.
- Preferred phone channel is respected when sending phone OTP.
