# VPay (Verifone) — Prepaid Multi-Wallet API Reference

> Provider: **Verifone Israel — "רב-ארנק" / VPay PosProxy**
> Source spec: `VPay_PosProxy_Prepaid API_v3.4.pdf` (version 3.4, October 2020)
> Transport: **SOAP 1.1 over HTTPS**
> Purpose in this project: allow customers to pay for spa bookings with a prepaid stored-value card that holds an **ILS balance**.

This document is the single source of truth for integrating VPay inside this repo. If something here contradicts the PDF, the PDF wins — but please update this file.

---

## 1. Mental model

VPay is a **money-based** prepaid system:

- A customer has a physical/virtual card with 16-digit number + 3-digit CVV.
- Each card holds one or more **accounts (wallets)** with an **ILS balance**.
- The POS (our app) can:
  - Look up the balance (`GetBalance`)
  - Deduct money from the card (`Withdraw`)
  - Reverse a deduction (`CancelWithdraw`)
  - Top up the card (`Deposit` / `CancelDeposit`) — usually **not** used by us, only by issuers
- Partial redemption is supported: if the card balance is lower than the amount due, we withdraw the balance and collect the remainder via another method (credit card / cash).

Contrast with DTS (see `API_DTS.md`), which is **unit-based** (vouchers = items, not money).

---

## 2. Endpoints & environments

Both environments expose the **same SOAP service** under the path `/ws/vpayposproxy.asmx`.

| Env | Base URL |
|---|---|
| Staging | `https://stgvpay.verifone.co.il/ws/vpayposproxy.asmx` |
| Production | `https://vpay.verifone.co.il/ws/vpayposproxy.asmx` |

SOAP namespaces used in all examples:
- `soapenv` = `http://schemas.xmlsoap.org/soap/envelope/`
- `tem` = `http://tempuri.org/`

WSDL URL (append `?wsdl` to either base URL).

---

## 3. Network security (⚠️ critical for Vercel deployment)

**VPay requires one of the following for the transport to be accepted:**

1. **IP/VPN** — the calling host must be inside an IP range Verifone has whitelisted, or reach the server through a VPN tunnel, OR
2. **Client certificate (mTLS)** — a `.pfx` / `.pem` certificate that Verifone issues during provisioning. The client must present it on every call, and the cert's **Thumbprint** is listed in the `.config` on Verifone's side.

**Implication for our stack:**
Vercel serverless functions do **not** provide static egress IPs and cannot load a client certificate into their runtime reliably. Therefore:

- Run a **thin HTTPS proxy** on a host we control (e.g. Fly.io / Railway / a DigitalOcean droplet) that:
  - Has a static IP (for IP-allowlist) **and/or** loads the Verifone client cert.
  - Exposes a small REST API to our Vercel backend (auth via shared HMAC secret or mTLS).
  - Forwards requests as SOAP to VPay, parses the response, returns JSON to Vercel.
- Our backend (`src/lib/payments/vpay.ts`) talks to this proxy, never to VPay directly.
- Env vars: `VPAY_PROXY_URL`, `VPAY_PROXY_HMAC_SECRET`, `VPAY_CLIENT_PROVIDER_ID`, `VPAY_TERMINAL_ID`, `VPAY_ENV` (`staging|production`).

Never log request bodies for VPay endpoints — they contain card number + CVV. Scrub from Sentry.

---

## 4. Common request/response conventions

### Response envelope (generic)

Every response is a SOAP envelope that contains a typed `*Result` body:

```xml
<Response<T>>
  <Body>...</Body>                    <!-- only on Succeeded -->
  <ResponseStatus>Succeeded</ResponseStatus>
  <Error>...</Error>                   <!-- only on Failed -->
  <ActionReference>1004425188</ActionReference> <!-- server-side ref -->
</Response<T>>
```

| Field | Meaning |
|---|---|
| `ResponseStatus` | `Succeeded`, `Failed`, or `PartiallySucceeded` (bulk ops only). |
| `Body` | Operation-specific payload when the call succeeded. |
| `Error` | Populated only when `Failed`. See `ErrorModel` below. |
| `ActionReference` | **Server-generated ID**. Persist it. Required to cancel a Withdraw or Deposit later. |

### ErrorModel

| Field | Type | Notes |
|---|---|---|
| `Message` | string(255) | System-log message (English/Hebrew). |
| `FriendlyMessage` | string(255) | Display-safe Hebrew message. |
| `Code` | int | See §8 — error codes. |
| `InnerException` | ErrorModel | Optional nested error. |
| `ProposedHandling` / `ProposedHandlingCode` | string / int | Optional: server suggestion on how to recover. |

### Common request fields

These appear on most methods (`GetBalance`, `Withdraw`, `CancelWithdraw`, `Deposit`, `CancelDeposit`):

| Field | Type | Req | Notes |
|---|---|---|---|
| `TerminalUniqueIdentifier` | string(50) | **M** | Our terminal/POS ID (from Verifone provisioning). |
| `Swiped` | bool | **M** | `false`/`0` when we keyed the card manually (our case). `true` for magstripe/track2. |
| `CardNumber` | string(40) | **M** | Manual: `CCCCCCCCCCCCCCCC` (no CVV appended in VPay; CVV is a separate field in their terminal flow, see §5.1). Swiped: raw Track2 **without** `;`, `?`, `,`. |
| `CurrencyCode` | int32 | **M** | ISO-4217 numeric. **ILS = `376`**. |
| `POSDate` | string(24) | **M** | POS clock at send time, RFC-3339 (e.g. `2020-10-04T15:50:02.941Z`). |
| `ClientProviderID` | int32 | **M** | Our provider ID issued by Verifone. |
| `InvoiceNumber` | string(40) | O | **Use it.** Enables the server-side 24h double-check (§6). Must be unique per attempt per card per terminal. |
| `TransactionIdentifier` | string(20) | **M** for money ops | Value returned by `CreateTransaction`. |
| `CommitProtocol` | enum | O | `SinglePhaseCommit` (default) or `TwoPhaseCommit`. We use single-phase. |
| `BusinessDate` | string(24) | O | POS business day, RFC-3339. For end-of-day reconciliation. |
| `TrainingMode` | bool | O | `true` = sandbox call that does not mutate real balances. Use in staging where possible. |
| `TotalAmount` | decimal(8,2) | O | Total amount of the whole payment (may be larger than `Amount` if splitting). |
| `ExtraData` | list<KeyValuePair<string,object>> | O | Freeform metadata. Put our `booking_id` and `payment_id` here for forensic audit. |

RFC-3339 example: `2026-04-21T10:30:00.000Z` (UTC). Server is strict about format.

---

## 5. API methods

### 5.1 `CreateTransaction()` — start a server-side transaction

**Purpose:** get a `TransactionIdentifier` that binds subsequent operations together. Call this **first** for every withdraw/deposit.

**Request:** no body parameters.

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:tem="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:CreateTransaction/>
  </soapenv:Body>
</soapenv:Envelope>
```

**Response `Body` (Transaction):**

| Field | Type | Notes |
|---|---|---|
| `Status` | enum `TransactionStatuses` | e.g. `Created`. |
| `CreateDate` | string(24) | RFC-3339. |
| `Identifier` | string(20) | Pass as `TransactionIdentifier` on subsequent calls. |

```xml
<CreateTransactionResult>
  <Body>
    <Status>Created</Status>
    <CreateDate>2020-10-04T15:50:02.941Z</CreateDate>
    <Identifier>1004423210</Identifier>
    <DumpStatus>Created</DumpStatus>
  </Body>
  <ResponseStatus>Succeeded</ResponseStatus>
</CreateTransactionResult>
```

### 5.2 `GetBalance(BalanceModelReq)` — query card balance

**Purpose:** return the total + per-account balances on a card for this terminal's retailer chain. Call before a Withdraw if partial redemption may be needed.

**Request fields** (`BalanceModelReq`): `TerminalUniqueIdentifier`, `Swiped`, `CurrencyCode`, `CardNumber`, `POSDate`, `ClientProviderID` (all Mandatory). `ExtraData` and `CommitProtocol` are optional. No `TransactionIdentifier` needed.

> **CVV handling** (per PDF §1.3): manual card entry uses 16 digits + 3 CVV. The CVV is validated server-side. If a card has no CVV, send `000`. Some integrations concatenate `CardNumber+CVV` in the `CardNumber` field; verify with Verifone during onboarding which shape they expect.

```xml
<tem:GetBalance>
  <tem:request>
    <tem:CardNumber>8010019852923235</tem:CardNumber>
    <tem:TerminalUniqueIdentifier>99999999</tem:TerminalUniqueIdentifier>
    <tem:Swiped>0</tem:Swiped>
    <tem:CurrencyCode>376</tem:CurrencyCode>
    <tem:POSDate>2020-10-04T15:50:02.941Z</tem:POSDate>
    <tem:ClientProviderID>3200</tem:ClientProviderID>
    <tem:CommitProtocol>SinglePhaseCommit</tem:CommitProtocol>
  </tem:request>
</tem:GetBalance>
```

**Response `Body` (BalanceModel):**

| Field | Type | Notes |
|---|---|---|
| `Accounts` | list<AccountModel> | Each wallet applicable to the retailer chain. |
| `Balance` | decimal(8,2) | **Total** across applicable accounts. |
| `CardNumber` | string(16) | Partial/masked card number. |
| `Issuer` / `Series` / `Batch` | string | Issuer metadata. |
| `Track2` | string | Opaque token for subsequent calls. |

`AccountModel`:

| Field | Type | Notes |
|---|---|---|
| `Id` | int64 | Internal account ID. |
| `Name` | string(30) | Account label. |
| `DefinitionID` | int32 | Account definition (used on `Deposit`). |
| `Balance` | decimal(8,2) | Balance in the account. |
| `CurrencyCode` | int32 | ISO-4217. |
| `ValidFrom` / `ValidThru` | string(24) | RFC-3339. |
| `State` | enum | `Active`, etc. |

### 5.3 `GetCardsBalances(BalanceModelReq)` — balances for a temp-card cluster

Same shape as `GetBalance` but returns `List<BalanceModel>` — all cards tied to a temporary card. Rarely needed in our flow.

### 5.4 `Withdraw(WithdrawModelRequest)` — deduct money

**Purpose:** the actual charge. Requires a `TransactionIdentifier` from `CreateTransaction`.

**Required fields:** `TerminalUniqueIdentifier`, `Swiped`, `CardNumber`, `Amount` (decimal(6,2), in ILS), `CurrencyCode=376`, `POSDate`, `ClientProviderID`, `TransactionIdentifier`.
**Recommended fields:** `InvoiceNumber` (enables 24h double-check), `TotalAmount`, `BusinessDate`, `ExtraData`.

```xml
<tem:Withdraw>
  <tem:request>
    <tem:Amount>1</tem:Amount>
    <tem:CardNumber>8010019852923235</tem:CardNumber>
    <tem:CurrencyCode>376</tem:CurrencyCode>
    <tem:TerminalUniqueIdentifier>99999999</tem:TerminalUniqueIdentifier>
    <tem:POSDate>2020-10-04T21:12:02.087Z</tem:POSDate>
    <tem:InvoiceNumber>1004425188</tem:InvoiceNumber>
    <tem:Swiped>0</tem:Swiped>
    <tem:TransactionIdentifier>1004425188</tem:TransactionIdentifier>
    <tem:CommitProtocol>SinglePhaseCommit</tem:CommitProtocol>
    <tem:ClientProviderID>3200</tem:ClientProviderID>
    <tem:TotalAmount>1</tem:TotalAmount>
    <tem:BusinessDate>2020-10-04T21:12:02.087Z</tem:BusinessDate>
    <tem:TrainingMode>0</tem:TrainingMode>
  </tem:request>
</tem:Withdraw>
```

**Response `Body` (BalanceModel):** updated balances after the withdraw.
**Envelope also carries `<ActionReference>` — persist this.** It is the Withdraw reference used to cancel later.

```xml
<WithdrawResult>
  <Body>
    <CardNumber>8010019852923235</CardNumber>
    <Accounts>...</Accounts>
    <Balance>59.00000</Balance>
  </Body>
  <ResponseStatus>Succeeded</ResponseStatus>
  <ActionReference>1004425188</ActionReference>
</WithdrawResult>
```

**Partial redemption** (PDF §3.4 note): if the card balance is lower than the amount, the business rule is to:
1. Call `GetBalance` first,
2. If `Balance < Amount`, withdraw `Balance` only (sending `Amount = Balance`) and collect the difference via another method.

### 5.5 `CancelWithdraw(CancelWithdrawRequest)` — refund a withdraw

**Purpose:** reverse a prior `Withdraw`, fully or partially. Partial cancel supported since v3.4.

**Required fields:** `TerminalUniqueIdentifier`, `Swiped`, `CardNumber`, `WithdrawReference` (the `ActionReference` from the Withdraw), `Amount` (how much to return — may be ≤ original), `CurrencyCode`, `POSDate`, `ClientProviderID`, `TransactionIdentifier`.
**Recommended:** `InvoiceNumber`, `CancelType` (`ByReference` or `ByExternalInvoiceNumber`), `CancelledInvoiceNumber` (if cancelling by our invoice), `Reason` (enum `CancelWithdrawReason` e.g. `Compensation`), `TotalAmount`, `BusinessDate`.

```xml
<tem:CancelWithdraw>
  <tem:request>
    <tem:CardNumber>8010019852923235</tem:CardNumber>
    <tem:TerminalUniqueIdentifier>99999999</tem:TerminalUniqueIdentifier>
    <tem:POSDate>2020-10-04T21:23:33.033Z</tem:POSDate>
    <tem:CancelledInvoiceNumber>1004425204</tem:CancelledInvoiceNumber>
    <tem:Amount>1</tem:Amount>
    <tem:CancelType>ByReference</tem:CancelType>
    <tem:Swiped>0</tem:Swiped>
    <tem:CurrencyCode>376</tem:CurrencyCode>
    <tem:TransactionIdentifier>1004425204</tem:TransactionIdentifier>
    <tem:CommitProtocol>SinglePhaseCommit</tem:CommitProtocol>
    <tem:CreatedBy>Rafi</tem:CreatedBy>
    <tem:Reason>Compensation</tem:Reason>
    <tem:ClientProviderID>3200</tem:ClientProviderID>
    <tem:TotalAmount>1</tem:TotalAmount>
    <tem:WithdrawReference>1004425188</tem:WithdrawReference>
    <tem:InvoiceNumber>1004425204</tem:InvoiceNumber>
    <tem:IsDuplicate>0</tem:IsDuplicate>
    <tem:BusinessDate>2020-10-04T21:23:33.033Z</tem:BusinessDate>
    <tem:TrainingMode>0</tem:TrainingMode>
  </tem:request>
</tem:CancelWithdraw>
```

Response includes updated `BalanceModel` and a new `<ActionReference>` (the cancel's own ref).

### 5.6 `Deposit(DepositRequest)` — top up a card

**Purpose:** add money to a predefined account on the card. **Only used when the club config allows POS-side deposits** — typically not part of the spa booking flow. Document for completeness.

Required fields: all common fields + `Amount`, `AccountDefinitionId` (from `GetBalance` → `AccountModel.DefinitionID`), `TransactionIdentifier`.

Response: `BalanceModel` + `ActionReference` (needed to cancel the deposit).

### 5.7 `CancelDeposit(CancelDepositRequest)` — reverse a deposit

Full cancel only (no partial cancel for deposits). Mandatory: `DepositReference` (the deposit's `ActionReference`) and all common fields + `TransactionIdentifier`.

---

## 6. Idempotency: the 24h "Double Check"

The server automatically rejects duplicate transactions based on the tuple:

```
(InvoiceNumber, CardNumber[16], TerminalUniqueIdentifier, POSDate within last 24h, Amount)
```

- If any earlier call within the last 24h matches **all** of these, the server returns an error instead of re-executing.
- **This only works if we send `InvoiceNumber`.** Always send it.
- **Generate `InvoiceNumber` as the `payments.id` (UUID) concatenated with an attempt counter**, e.g. `<payment_id>-1`, `<payment_id>-2`. Store the `InvoiceNumber` on `payments.invoice_number` (unique index).
- Safe retry rule: on **network timeouts** (no response from server), retry with the **same `InvoiceNumber`**. The server will deduplicate. Never retry a `Withdraw` with a new `InvoiceNumber` if you're unsure whether the prior call completed.

---

## 7. Survivability (PDF §3.9)

- The official .NET DLL supports multiple base URLs in its `vPay.config`; if one is unreachable, it tries the next. We don't use the DLL — our Node client should implement the same pattern when we have failover URLs.
- Timeout errors are generated client-side when the request never reached the server; in that case, **the server has nothing to deduplicate** and it's safe to retry with the same `InvoiceNumber`.

---

## 8. Error codes (PDF §3.10)

Response status is dichotomic: `Succeeded` or `Failed`. On `Failed`, read `Error.Code` and `Error.FriendlyMessage`.

### 1xx — Communication
| Code | Meaning |
|---|---|
| 105 | Communication failure (network/timeout). |

### 4xx — Client
| Code | Meaning |
|---|---|
| 401 | Invalid request. |
| 402 | CVV does not match card number. |
| 403 | Card number too short. |
| 404 | Negative charge amount. |
| 405 | Invalid `ClientProviderID`. |
| 406 | Cancel reference not sent. |
| 407 | I/O error. |
| 408 | Operation cancelled by user. |

### 5xx — Server
| Code | Meaning |
|---|---|
| 501 | Unspecified error. |
| 502 | Method not implemented. |
| 503 | Server could not persist changes. |
| 504 | No action found for the given reference. |
| 505 | Reference already cancelled. |

### 6xx — Terminal
| Code | Meaning |
|---|---|
| 601 | Operation not allowed for this terminal. |
| 602 | Terminal inactive. |
| 603 | Branch inactive. |
| 604 | Chain inactive. |
| 606 | Terminal amount limit reached. |
| 607 | Terminal count limit reached. |
| 608 | Operation too soon after the previous one (rate-limit). |

### 8xx — Card
| Code | Meaning |
|---|---|
| 801 | Card does not exist. |
| 802 | Card inactive. |
| 803 | Card expired. |
| 804 | Card not accepted on this retailer chain. |
| 805 | Balance on card is lower than the requested redemption. |
| 806 | Illegal card. |
| 807 | Card has no default loading wallet. |
| 808 | Single-load amount exceeded (`{amount} {currency}`). |
| 809 | Account cap reached (`{currentAmount} {currency}`; can load up to `{amount2} {currency2}`). |
| 810 | Card cannot be activated on server. |
| 811 | Card balance is lower than the cancel amount. |
| 812 | Cancel amount exceeds the actually-redeemed amount (`{amount}{currency}`). |
| 813 | Balance enquiry: card has no accounts. |
| 814 | Card is blocked. |
| 815 | Currency mismatch (`{currency1}` vs `{currency2}`). |
| 816 | Operation already performed (Double-Check hit — §6). |
| 817 | Card amount limit reached. |
| 818 | Card operation-count limit reached. |
| 819 | Operation too soon after the previous one on this card. |
| 820 | Code expired. |

### User-facing mapping (suggested)

| Server code(s) | UI action |
|---|---|
| 402, 403, 802, 803, 806, 814 | Ask customer to use a different card. |
| 805 | Offer partial redemption + credit-card top-up. |
| 808, 809, 817, 818, 819 | Ask to try again later; escalate to staff. |
| 816 | Swallow silently — the original call already succeeded; fetch state from `payments`. |
| 105, 501, 503, 601–604 | "Payment temporarily unavailable"; staff should take a different payment. |

---

## 9. Our wrapper — recommended TypeScript shape

Target file: `src/lib/payments/vpay.ts`. Talks **only** to the VPay proxy, not to VPay directly.

```ts
// Pseudo-types
type VPayBalance = {
  cardNumberMasked: string;
  balanceAgorot: number;              // parsed from decimal ILS → agorot (×100, integer)
  accounts: Array<{
    id: string;
    name: string;
    definitionId: number;
    balanceAgorot: number;
    currencyCode: 376;
    validFrom: string;
    validThru: string;
    state: 'Active' | string;
  }>;
};

interface VPayClient {
  createTransaction(): Promise<{ transactionId: string }>;
  getBalance(input: {
    cardNumber: string;
    cvv: string;
  }): Promise<VPayBalance>;
  withdraw(input: {
    transactionId: string;
    cardNumber: string;
    cvv: string;
    amountAgorot: number;
    invoiceNumber: string;  // stable per payment attempt
    bookingId: string;
    paymentId: string;
  }): Promise<{ actionReference: string; balanceAfter: VPayBalance }>;
  cancelWithdraw(input: {
    transactionId: string;
    cardNumber: string;
    withdrawReference: string;
    amountAgorot: number;
    invoiceNumber: string;
    reason: 'Compensation' | 'CustomerRequest' | 'Other';
    paymentId: string;
  }): Promise<{ actionReference: string; balanceAfter: VPayBalance }>;
}
```

Wrap each method in:
- **Zod schemas** at the boundary (card number = digits only, length 8–40; CVV = 3 digits).
- **Timeout** of 20s; **no retry** on `Withdraw` network errors — surface to caller; staff reconciles.
- **Audit log** on every call with `provider='vpay'`, action type, and reference, using the existing `writeAuditLog`.
- Convert all amounts to **agorot (integer)** before touching our DB; VPay speaks decimal ILS.
- Mask card number in all logs (first 6 + last 4).

---

## 10. Project-specific notes

- **Currency:** always `376` (ILS). The rest of our app stores amounts as **agorot** (integers); multiply by 0.01 on send, and on receive multiply `Decimal(8,2)` ILS → agorot via `Math.round(value * 100)`.
- **Timezone:** RFC-3339 timestamps. Use UTC `Z` suffix to avoid ambiguity. Our scheduling engine runs in `Asia/Jerusalem` but VPay doesn't care about TZ as long as RFC-3339 is valid.
- **ExtraData:** attach `{ booking_id, payment_id, customer_phone_last4 }` for post-hoc audits — Verifone support can echo it back during escalations.
- **Training mode:** set `TrainingMode = true` in staging whenever possible — lets us exercise full flows without mutating real card balances.
- **DB fields (`payments` table):**
  - `provider = 'vpay'`
  - `method = 'voucher_vpay'`
  - `provider_tx_id = <WithdrawActionReference>`
  - `provider_cancel_ref = <WithdrawActionReference>` (same for VPay; it's what CancelWithdraw needs)
  - `invoice_number = <our stable invoice>` (UNIQUE)
  - `card_last4 = last 4 of card number`
  - `webhook_payload` — store a redacted copy of the raw response for audit (no CVV, masked card).

---

## 11. Open questions to resolve during provisioning

Track these with Verifone ops; don't guess:

1. Exact `ClientProviderID` and `TerminalUniqueIdentifier` for staging + production.
2. Whether they want CVV concatenated into `CardNumber` or expect it via a separate `CVV` field (some Verifone flavours differ here).
3. List of IP addresses we'll egress from → they whitelist, OR the client-cert issuance process.
4. Whether partial cancels are enabled for our terminal (some merchants are capped).
5. Whether we have any `AccountDefinitionId` assigned for deposits (unlikely for us).
6. How they want us to populate `BusinessDate` (daily boundary hour).

---

## 12. Reference glossary

| VPay term | In our codebase |
|---|---|
| `TransactionIdentifier` | transient, kept for the duration of a single withdraw/cancel flow; do not persist beyond the attempt |
| `ActionReference` | `payments.provider_tx_id` **and** `payments.provider_cancel_ref` |
| `InvoiceNumber` | `payments.invoice_number` (unique; derived from `payments.id` + attempt counter) |
| `CardNumber` | never persisted; only `card_last4` is kept |
| `Amount` (decimal ILS) | converted to agorot (int) for `payments.amount_ils` |
| `ClientProviderID` | env var `VPAY_CLIENT_PROVIDER_ID` |
| `TerminalUniqueIdentifier` | env var `VPAY_TERMINAL_ID` |
