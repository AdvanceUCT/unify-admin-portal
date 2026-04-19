# UNIFY API Contracts

Status: draft. Last updated: 2026-04-19.

These contracts describe how the student wallet, admin portal, vendor portal, and future backend should talk. They are not final backend implementation requirements yet.

Primary source alignment: `BA Innovation.docx` defines the prototype as a simulated university credential ecosystem using W3C Verifiable Credentials, AnonCreds, Credo, DIDComm, Hyperledger Indy, BCovrin, Indy VDR, and simulated wallet payments.

## General Rules

- Use JSON over HTTPS.
- Use ISO 8601 timestamps for machine-readable dates.
- Use stable string IDs for students, credentials, vendors, service points, and transactions.
- Do not send secrets in QR payloads.
- Do not trust client-provided credential status without backend verification.
- Return typed error codes that the apps can map to clear user-facing messages.
- Treat all payments as simulated unless a later decision explicitly adds a real payment provider.
- Do not write personally identifiable information to Hyperledger Indy or BCovrin.

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
type CredentialLifecycleState =
  | "Pending"
  | "Issuing"
  | "Offered"
  | "Active"
  | "Suspended"
  | "Revoked"
  | "Expired"
  | "Renewed";

type StudentCredential = {
  id: string;
  holderName: string;
  issuer: string;
  faculty?: string;
  programme: string;
  enrolmentStatus: "Registered" | "Suspended" | "Withdrawn" | "Graduated";
  lifecycleState: CredentialLifecycleState;
  studentNumber: string;
  validFrom: string;
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

## Student VC Schema

The minimum student VC attributes from the BA document are:

- Student number.
- Name.
- Faculty or programme.
- Enrolment status.
- Validity period.

The VC should support selective disclosure so a student can prove facts such as active enrolment without revealing unnecessary personal details.

## Service-Point QR Payload

The current wallet scaffold validates service-point QR payloads with an explicit purpose:

```ts
type QrPayload = {
  type: "payment" | "verification";
  vendorId: string;
  servicePointId: string;
  amount?: number;
  nonce: string;
};
```

Rules:

- `type` distinguishes simulated wallet payment from service-point credential verification.
- `vendorId` must identify the vendor.
- `servicePointId` must identify the physical or logical service point.
- `amount` is required for `payment` and must be zero or greater.
- `amount` is omitted for `verification`.
- `nonce` must be single-use and verified by the backend.
- The backend should reject expired, reused, malformed, or unknown nonces.
- QR codes may also be used later for credential activation invitations or proof requests; those should use their own typed payloads rather than overloading the service-point payload.

## Wallet API

Planned endpoints:

```http
POST /wallet/activation/verify
GET /wallet/me
GET /wallet/credentials
GET /wallet/payments
POST /wallet/top-ups/link
POST /wallet/presentations
POST /wallet/payments/authorize
```

### POST /wallet/activation/verify

Purpose: activate a student wallet from an activation code or issuer-provided enrollment flow.

Request:

```json
{
  "activationCode": "string",
  "invitationId": "string",
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
- The final holder/wallet agent should receive and store credentials through Credo and Aries Askar.

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
      "faculty": "Commerce",
      "programme": "Bachelor of Business Science",
      "enrolmentStatus": "Registered",
      "lifecycleState": "Active",
      "studentNumber": "VSKCAL001",
      "validFrom": "2026-01-01",
      "expiresAt": "2026-12-31"
    }
  ]
}
```

### POST /wallet/top-ups/link

Purpose: generate a simulated external top-up link or QR code that a funder can use in the proof-of-concept.

Request:

```json
{
  "studentId": "student-demo-001",
  "amount": 100
}
```

Response:

```json
{
  "topUpId": "topup-001",
  "shareUrl": "https://example.test/top-up/topup-001",
  "expiresAt": "2026-09-01T12:00:00Z"
}
```

## Admin API

Planned endpoints:

```http
GET /admin/students
GET /admin/students/{studentId}
POST /admin/credentials
POST /admin/credentials/batch-issue
POST /admin/credentials/{credentialId}/suspend
POST /admin/credentials/{credentialId}/reinstate
POST /admin/credentials/{credentialId}/revoke
POST /admin/credentials/{credentialId}/renew
GET /admin/vendors
POST /admin/vendors/{vendorId}/approve
POST /admin/rules/eligibility
GET /admin/audit-events
```

Admin actions should create audit events with actor, action, target ID, timestamp, and reason.

### POST /admin/credentials/batch-issue

Purpose: issue a batch of simulated student VCs. The BA document sets the MVP target at a minimum of 100 student VCs in one run.

Request:

```json
{
  "cohortId": "simulated-2026-cohort",
  "limit": 100
}
```

Response:

```json
{
  "batchId": "batch-001",
  "status": "Queued",
  "requestedCount": 100
}
```

## Vendor API

Planned endpoints:

```http
POST /vendor/qr/payment
POST /vendor/qr/verification
POST /verifier/presentations/verify
GET /vendor/service-points
GET /vendor/transactions
```

### POST /vendor/qr/payment

Purpose: generate a QR code payload for a simulated student wallet payment.

Response payload shape:

```json
{
  "type": "payment",
  "vendorId": "vendor-001",
  "servicePointId": "library-cafe",
  "amount": 42.5,
  "nonce": "single-use-nonce"
}
```

### POST /vendor/qr/verification

Purpose: generate a QR code payload for student VC verification at a service point.

Response payload shape:

```json
{
  "type": "verification",
  "vendorId": "vendor-001",
  "servicePointId": "main-library",
  "nonce": "single-use-nonce"
}
```

### POST /verifier/presentations/verify

Purpose: verify a QR payload or wallet presentation at a vendor service point.

Request:

```json
{
  "vendorId": "vendor-001",
  "servicePointId": "service-point-001",
  "type": "verification",
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

## Identity / SSI Service Contracts

These contracts are backend/internal service boundaries. They should be implemented in the future backend or identity service, not directly in the three frontend repos.

```http
POST /identity/schemas/student-vc
POST /identity/issuer/credentials
POST /identity/issuer/credential-offers
POST /identity/verifier/proof-requests
POST /identity/verifier/proofs/verify
GET /identity/ledger/status
```

Responsibilities:

- Register student VC schemas and credential definitions through Indy VDR.
- Issue AnonCreds credentials using the Credo issuer agent.
- Send credential offers through DIDComm.
- Verify proofs using the Credo verifier agent.
- Check revocation registry state from Hyperledger Indy/BCovrin.
- Keep all PII off-ledger.

## Audit Events

All credential lifecycle, verification, and simulated payment events should be logged.

```ts
type AuditEvent = {
  id: string;
  eventType:
    | "CredentialIssued"
    | "CredentialRenewed"
    | "CredentialSuspended"
    | "CredentialReinstated"
    | "CredentialRevoked"
    | "CredentialVerified"
    | "PaymentApproved"
    | "PaymentDeclined";
  actorId: string;
  targetId: string;
  servicePointId?: string;
  vendorId?: string;
  result: "Success" | "Failure" | "Pending";
  occurredAt: string;
  reason?: string;
};
```

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
