# UNIFY API Contracts

Status: draft. Last updated: 2026-04-19.

These contracts describe how the student wallet, admin portal, vendor portal, and future backend should talk. They are not final backend implementation requirements yet.

## General Rules

- Use JSON over HTTPS.
- Use ISO 8601 timestamps for machine-readable dates.
- Use stable string IDs for students, credentials, vendors, service points, and transactions.
- Do not send secrets in QR payloads.
- Do not trust client-provided credential status without backend verification.
- Return typed error codes that the apps can map to clear user-facing messages.

## Shared Types

### StudentProfile

```ts
type StudentProfile = {
  id: string;
  name: string;
  institution: string;
};
```

### StudentCredential

```ts
type StudentCredential = {
  id: string;
  holderName: string;
  issuer: string;
  programme: string;
  status: "Active" | "Suspended" | "Expired";
  studentNumber: string;
  expiresAt: string;
};
```

### PaymentRecord

```ts
type PaymentRecord = {
  id: string;
  amount: string;
  status: "Approved" | "Pending" | "Declined";
  vendor: string;
};
```

## QR Payload

The current wallet scaffold validates this QR payload shape:

```ts
type QrPayload = {
  vendorId: string;
  servicePointId: string;
  amount: number;
  nonce: string;
};
```

Rules:

- `vendorId` must identify the vendor.
- `servicePointId` must identify the physical or logical service point.
- `amount` must be zero or greater.
- `nonce` must be single-use and verified by the backend.
- The backend should reject expired, reused, malformed, or unknown nonces.

## Wallet API

Planned endpoints:

```http
POST /wallet/activation/verify
GET /wallet/me
GET /wallet/credentials
GET /wallet/payments
POST /wallet/presentations
POST /wallet/payments/authorize
```

### POST /wallet/activation/verify

Purpose: activate a student wallet from an activation code or issuer-provided enrollment flow.

Request:

```json
{
  "activationCode": "string",
  "deviceId": "string"
}
```

Response:

```json
{
  "student": {
    "id": "student-demo-001",
    "name": "Demo Student",
    "institution": "University of Cape Town"
  },
  "walletId": "wallet-001",
  "sessionToken": "opaque-token"
}
```

Security notes:

- `sessionToken` must be stored through the wallet secure-storage wrapper.
- Activation codes must be short-lived and single-use.

### GET /wallet/me

Purpose: fetch the current student profile and wallet summary.

Response:

```json
{
  "student": {
    "id": "student-demo-001",
    "name": "Demo Student",
    "institution": "University of Cape Town"
  },
  "wallet": {
    "availableBalance": "R 320.00",
    "lastVerification": "Library Cafe"
  }
}
```

### GET /wallet/credentials

Purpose: fetch credentials visible to the wallet.

Response:

```json
{
  "credentials": [
    {
      "id": "credential-demo-001",
      "holderName": "Demo Student",
      "issuer": "University of Cape Town",
      "programme": "Bachelor of Business Science",
      "status": "Active",
      "studentNumber": "VSKCAL001",
      "expiresAt": "2026-12-31"
    }
  ]
}
```

## Admin API

Planned endpoints:

```http
GET /admin/students
GET /admin/students/{studentId}
POST /admin/credentials
POST /admin/credentials/{credentialId}/suspend
POST /admin/credentials/{credentialId}/revoke
POST /admin/credentials/{credentialId}/renew
GET /admin/audit-events
```

Admin actions should create audit events with actor, action, target ID, timestamp, and reason.

## Vendor API

Planned endpoints:

```http
POST /verifier/presentations/verify
GET /vendor/service-points
GET /vendor/transactions
```

### POST /verifier/presentations/verify

Purpose: verify a QR payload or wallet presentation at a vendor service point.

Request:

```json
{
  "vendorId": "vendor-001",
  "servicePointId": "service-point-001",
  "amount": 42.5,
  "nonce": "single-use-nonce",
  "presentation": "opaque-wallet-presentation"
}
```

Response:

```json
{
  "status": "Approved",
  "reason": "Credential active",
  "transactionId": "payment-001"
}
```

Allowed statuses:

- `Approved`
- `Pending`
- `Declined`

## Error Shape

Use a consistent error response:

```json
{
  "error": {
    "code": "CREDENTIAL_SUSPENDED",
    "message": "Credential is suspended.",
    "requestId": "req-001"
  }
}
```

Apps should display friendly copy, log only safe metadata, and never log tokens or full credential presentations.
