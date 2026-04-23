# DTS-Knowledge — Benefit Vouchers ("שווה כסף") API Reference

> Provider: **DTS (Knowledge / נופשונית)** — `DtsPosServices` v2
> Source spec: `DtsPosSerivces 2025.pdf` (updated 08/05/2025) + `DtsPosServices V2 Postman Kit 2025.postman_collection`
> Transport: **HTTPS POST, `application/x-www-form-urlencoded`**, body carries a JSON blob inside the form field `Request`. Response is SOAP-wrapped but the payload is a JSON string.
> Purpose in this project: let customers redeem **benefit vouchers** issued by a DTS-managed loyalty club (e.g. "1× 60-min massage", "2× facial") against a spa booking.

---

## 1. Mental model

DTS is a **unit-based** voucher system, not a money wallet:

- A customer has a card (physical or digital) linked to a **DTS member** inside an **organization/club**.
- The card carries a list of **benefits** (items), each with a `FullBarCode` (DTS catalog SKU), a `PosBarcode` (optional — the merchant-side SKU), and a remaining `Quantity`.
- To redeem, our POS:
  1. Calls `GetBalance` to list the customer's available benefits.
  2. Lets staff/customer pick which items to redeem (array of `{FullBarCode, Quantity}`).
  3. Calls `UseBenefits` → receives a `DtsConfirmationNumber` + `ConfirmationOrganizationId`. **Persist both.**
  4. Later, if the booking is cancelled, calls `Cancel` (full) or `CancelByItems` (partial) using those two IDs.
- **No amounts** are involved. Our app must map each `services.id` (spa service) ↔ a DTS `FullBarCode` (or a merchant-side `PosBarcode`).
- **One redemption = one organization.** Cannot mix benefits from different clubs in one `UseBenefits` call (error `105`).

Contrast with VPay (see `API_VPay.md`), which is money-based.

---

## 2. Endpoint & environment

| Env | Base URL |
|---|---|
| Production | `https://dtsposservicesv2.dts.co.il/DtsPosServices.asmx` |

WSDL: append `?wsdl`.

> No separate staging URL is published. DTS operations issues a **test card** (with pre-loaded benefits) during onboarding — you test against production using that card.

Calls are **plain HTTPS** — no VPN, no client certificate required. Standard TLS only.

Each method is reachable at `POST /DtsPosServices.asmx/<MethodName>` with:
- `Content-Type: text/xml; charset=utf-8` (yes, even though the body is form-encoded — that's the Postman kit convention)
- Body: `application/x-www-form-urlencoded`, single field `Request` whose value is the JSON-encoded request object.

The response is SOAP-wrapped:

```xml
<?xml version="1.0" encoding="utf-8"?>
<string xmlns="http://tempuri.org/">{ ...JSON... }</string>
```

**Parse strategy:** extract the text content of `<string>` and `JSON.parse` it.

---

## 3. Authentication & identification

DTS does not use username/password or tokens. Identity is carried **inside the JSON body**:

| Field | Where | Purpose |
|---|---|---|
| `ForeignTerminal` | every request | Our merchant identifier. Format: `TS_<vendor-id>` (issued by DTS ops). |
| `TerminalNumber` | `UseBenefits` / `Cancel*` | Optional POS/terminal sub-identifier. Empty string `""` is valid. |
| `SearchString` | `GetBalance`, `GetHistoryService` | The customer's card number. Full or DTS's short form. |

DTS side identifies the merchant by the combination of (`ForeignTerminal`, originating IP). Make sure the egress IP of our Vercel proxy/host is registered with DTS — if missing, calls fail with error `101` (`עסק לא קיים`).

> **You MUST call `GetBalance` before any mutation** (`UseBenefits` / `Cancel`). DTS documents this explicitly — balance fetches establish customer context and expose the `MemberId` / `OrganizationId` needed downstream.

---

## 4. Common request/response envelope

### Request skeleton

```json
{
  "Request": {
    "ForeignTerminal": "TS_XXXX",
    "TerminalNumber": ""
    // endpoint-specific fields here
  }
  // top-level: Customer, Items, DtsConfirmationNumber, ConfirmationOrganizationId...
}
```

### Response skeleton

Every response contains:

```json
{
  "Result": {
    "ResultCode": 0,
    "ResultMessage": "ok",
    "ResultFriendlyMessage": "הפעולה הסתיימה בהצלחה"
  },
  "Customer": { ... },
  "DtsConfirmationNumber": null | "string",
  "ConfirmationOrganizationId": null | "string",
  "Items": null | [ ... ],
  "RealizationsHistoryItems": null | [ ... ]
}
```

- **Success iff** `Result.ResultCode === 0`. Anything else is an error — see §6.
- `ResultFriendlyMessage` is Hebrew and UI-safe.
- Different endpoints populate different subsets of `Customer`/`Items`/`DtsConfirmationNumber`/`RealizationsHistoryItems`.

### Customer object

```json
{
  "OrganizationId": "<clubId>",
  "OrganizationName": "<clubName>",
  "MemberId": "<customerIdInsideClub>",
  "FirstName": "...",
  "LastName": "..."
}
```

⚠️ **Critical rule from the spec:** when calling `UseBenefits` or `Cancel*`, send the `MemberId` / `OrganizationId` **from the `Items[]` entries returned by `GetBalance`**, not the top-level `Customer` object. The values can differ across items — each item belongs to the organization that issued it.

### Item object (balance & redemption)

```json
{
  "MemberId": "...",
  "OrganizationId": "...",
  "BusinessName": "<merchant-facing name>",
  "FullBarCode": "<DTS catalog SKU>",
  "PosBarcode": "<optional merchant SKU>",
  "Quantity": 1,
  "Name": "<short benefit name>",
  "SplitVarCode": [
    { "ChunkLine": "<long benefit name line 1>" },
    { "ChunkLine": "<long benefit name line 2>" }
  ]
}
```

---

## 5. API methods

### 5.1 `GetBalance` — identify customer + list redeemable benefits

**URL:** `POST /DtsPosServices.asmx/GetBalance`

**Request JSON:**
```json
{
  "Request": {
    "ForeignTerminal": "TS_XXXX",
    "SearchString": "<card number>"
  }
}
```

**Response JSON (success):**
```json
{
  "Result": { "ResultCode": 0, "ResultMessage": "ok", "ResultFriendlyMessage": "הפעולה הסתיימה בהצלחה" },
  "Customer": { "OrganizationId": "...", "OrganizationName": "...", "MemberId": "...", "FirstName": "...", "LastName": "..." },
  "DtsConfirmationNumber": null,
  "ConfirmationOrganizationId": null,
  "Items": [
    {
      "MemberId": "...",
      "OrganizationId": "...",
      "BusinessName": "...",
      "FullBarCode": "...",
      "PosBarcode": "",
      "Quantity": 4,
      "Name": "...",
      "SplitVarCode": [{ "ChunkLine": "..." }, { "ChunkLine": "..." }]
    }
  ],
  "RealizationsHistoryItems": null
}
```

- Items are grouped: one item per benefit type with `Quantity = N` for available count.
- Always call this first; store `Items[]` in-memory for the life of the redemption UI.
- `PosBarcode` is blank when DTS hasn't mapped the benefit to our side — use `FullBarCode` as the authoritative identifier.

### 5.2 `GetBalanceSplited` — same, but one item per redeemable unit

Functionally identical to `GetBalance`, except `Items[]` is "flattened": if a customer has 4× benefit X, you get 4 entries with `Quantity: 1` each instead of one entry with `Quantity: 4`. Convenience for POS UIs that render one row per redeemable unit. Same request shape, same identity fields.

Request/response shape: see `GetBalance`.

### 5.3 `UseBenefits` — redeem one or more benefits

**URL:** `POST /DtsPosServices.asmx/UseBenefits`

**Purpose:** consume one or more items. Must be invoked **at the moment of service delivery** (per the spec, "בעת אספקת המוצר או השירות ללקוח"). All items in one call must belong to the same `OrganizationId`.

**Request JSON:**
```json
{
  "Request": {
    "ForeignTerminal": "TS_XXXX",
    "TerminalNumber": "",
    "OriginalRequestId": "<our idempotency key>"
  },
  "Customer": {
    "OrganizationId": "<from GetBalance>",
    "OrganizationName": "<from GetBalance>",
    "MemberId": "<from GetBalance>",
    "FirstName": "...",
    "LastName": "..."
  },
  "DtsConfirmationNumber": null,
  "ConfirmationOrganizationId": null,
  "Items": [
    {
      "OrganizationId": "<from Items[].OrganizationId>",
      "FullBarCode": "<SKU>",
      "PosBarcode": "<merchant SKU or empty>",
      "Quantity": 1,
      "Name": "<short name>"
    }
  ]
}
```

Key fields:

| Field | Req | Notes |
|---|---|---|
| `Request.OriginalRequestId` | **M** | Idempotency key for this POS order. DTS uses it to ensure the same order is not redeemed twice. Use `payments.id` or `<payment_id>-<attempt>`. |
| `Customer.MemberId` / `OrganizationId` | **M** | Must be the values from `Items[]` returned by `GetBalance`, **not** from `Customer` returned by `GetBalance` (they can differ). |
| `Items[].OrganizationId` | **M** | Must match across all items. |
| `Items[].Quantity` | **M** | Integer ≥ 1. Spec forbids `0` (error `111`). |

**Response JSON (success):**
```json
{
  "Result": { "ResultCode": 0, "ResultMessage": "ok", "ResultFriendlyMessage": "הפעולה הסתיימה בהצלחה" },
  "Customer": { ... },
  "DtsConfirmationNumber": "<redemption reference>",
  "ConfirmationOrganizationId": "<organization that confirmed>",
  "Items": [
    {
      "OrganizationId": "...",
      "FullBarCode": "...",
      "PosBarcode": "",
      "Quantity": "<redeemed qty>",
      "Name": "...",
      "MemberId": "..."
    }
  ]
}
```

🔴 **You MUST persist `DtsConfirmationNumber` AND `ConfirmationOrganizationId`.** Both are required to later call `Cancel` / `CancelByItems`. Lose either one and the redemption is effectively unreversible through the API — you'd have to involve DTS ops.

### 5.4 `Cancel` — full cancel of a redemption

**URL:** `POST /DtsPosServices.asmx/Cancel`

**Purpose:** reverse **all items** of a prior `UseBenefits`, identified by its confirmation number.

**Request JSON:**
```json
{
  "Request": {
    "ForeignTerminal": "TS_XXXX",
    "TerminalNumber": ""
  },
  "DtsConfirmationNumber": "<from UseBenefits response>",
  "ConfirmationOrganizationId": "<from UseBenefits response>"
}
```

**Response JSON (success):**
```json
{
  "Result": { "ResultCode": 0, "ResultMessage": "ok", "ResultFriendlyMessage": "הפעולה הסתיימה בהצלחה" },
  "Customer": { "OrganizationId": null, "OrganizationName": null, "MemberId": null, "FirstName": null, "LastName": null },
  "DtsConfirmationNumber": "<cancel reference>",
  "ConfirmationOrganizationId": "<organizationId>",
  "Items": null,
  "RealizationsHistoryItems": null
}
```

- If the redemption was **already cancelled**, DTS returns `Result.ResultCode = 0` with the **original cancel reference** (idempotent-ish). Spec: _"במידה ומימוש ההטבה כבר בוטל המערכת תחזיר OK עם אסמכתת הביטול המקורית"_.
- `Cancel` returns new `DtsConfirmationNumber` for the cancel event — persist on `payments.webhook_payload` or a separate `payment_events` row.

### 5.5 `CancelByItems` — partial cancel of a redemption

**URL:** `POST /DtsPosServices.asmx/CancelByItems`

**Purpose:** reverse a subset of items (or partial quantities of one item) from a single prior redemption. Available since May 2025.

**Request JSON:**
```json
{
  "Request": {
    "ForeignTerminal": "TS_XXXX",
    "TerminalNumber": ""
  },
  "DtsConfirmationNumber": "<from UseBenefits>",
  "ConfirmationOrganizationId": "<from UseBenefits>",
  "Items": [
    {
      "OrganizationId": "<from Items[].OrganizationId>",
      "FullBarCode": "<SKU to cancel>",
      "Quantity": 1
    }
  ]
}
```

- Can only cancel items redeemed in **the same** `UseBenefits` transaction (same `DtsConfirmationNumber`).
- If the redemption was **already fully cancelled**, returns error `109` (`בוצע ביטול בעבר`).

**Response** is the same as `Cancel`.

### 5.6 `GetHistoryService` — last 48h of redemptions for a card

**URL:** `POST /DtsPosServices.asmx/GetHistoryService`

**Purpose:** fetch a customer's redemption history at our merchant for the **last 2 days**. Useful for retrieving `DtsConfirmationNumber` values if we lost our copy (edge case — don't rely on it as the primary store).

**Request JSON:**
```json
{
  "Request": {
    "ForeignTerminal": "TS_XXXX",
    "SearchString": "<card number>"
  }
}
```

**Response JSON (success):**
```json
{
  "Result": { "ResultCode": 0, "ResultMessage": "ok", "ResultFriendlyMessage": "הפעולה הסתיימה בהצלחה" },
  "Customer": { ... },
  "DtsConfirmationNumber": null,
  "ConfirmationOrganizationId": null,
  "Items": null,
  "RealizationsHistoryItems": [
    {
      "SplitVarCode": [...],
      "DtsConfirmationNumber": "<redemption ref>",
      "FullBarCode": "...",
      "BusinessName": "...",
      "Name": "...",
      "Quantity": 1,
      "PostBarCode": ""
    }
  ]
}
```

Note the **typo** in the response: `PostBarCode` (sic), not `PosBarcode`. Map accordingly in the client.

---

## 6. Error codes

On any non-zero `Result.ResultCode`, treat the response as a **failure** and do not retry blindly.

| Code | Spec text (Hebrew) | Meaning (English) | Suggested handling |
|---|---|---|---|
| `0` | בוצע בהצלחה | Success | — |
| `42` | כרטיס לא מוכר | Unknown card | Ask for different card. |
| `85` | חסר מזהה לביטול | Missing cancel reference | Fix request payload. |
| `100` | חסר מזהה בית עסק | Missing `ForeignTerminal` | Config error. |
| `101` | עסק לא קיים | Merchant does not exist | Wrong `ForeignTerminal` or IP not whitelisted. |
| `102` | עסק לא פעיל | Merchant inactive | Escalate to DTS ops. |
| `103` | פורמט ג'ייסון שגוי | Malformed JSON | Fix request payload. |
| `104` | אין פריטים למימוש | No items in request | Fix payload. |
| `105` | לא ניתן לממש מ-2 ארגונים במקביל | Items from 2 orgs in one call | Split into two separate redemptions. |
| `106` | הכמות למימוש גדולה מהיתרה | Requested qty > available | Re-call `GetBalance` and cap to available. |
| `107` | חסר מזהה בקשה | Missing `OriginalRequestId` | Fix payload. |
| `108` | בוצע מימוש בעבר | Already redeemed (idempotency hit on `OriginalRequestId`) | Treat as success; fetch refs via `GetHistoryService`. |
| `109` | בוצע ביטול בעבר | Already cancelled | Treat as success. |
| `110` | אישור הזמנה לא נמצא | Confirmation not found | Wrong `DtsConfirmationNumber` / `ConfirmationOrganizationId`. |
| `111` | לא ניתן לממש בכמות 0 | Quantity must be ≥ 1 | Fix payload. |
| `112` | לא נמצאה אסמכתא להזמנה | No reference for the order | Order never existed in DTS. |
| `223` | אין הזמנות למימוש | No redeemable orders | Customer has nothing to redeem here. |
| `999` | שגיאה כללית | Generic server error | Retry once with backoff; escalate. |

### User-facing mapping (suggested)

| Code(s) | UI action |
|---|---|
| 42, 101, 102 | "Voucher card not recognised — try another payment method." |
| 106 | Refresh balance, show what's actually redeemable. |
| 108 | Treat as idempotent success; pull prior refs from history. |
| 109, 110 | "This voucher has already been processed." |
| 105 | "Please redeem vouchers from one provider at a time." |
| 999 | "Temporary error — please try again in a moment." |

---

## 7. Idempotency — `OriginalRequestId`

- `UseBenefits` uses `OriginalRequestId` to dedupe.
- Must be **unique per logical redemption attempt**. If we retry the same payload with the same `OriginalRequestId`, DTS returns error `108` (`בוצע מימוש בעבר`) — meaning "already done, we stopped you from double-charging".
- Recommendation: set `OriginalRequestId = <payments.id>` when the payment row represents a single redemption, or `<payments.id>-<attempt>` if we plan to reissue with a new row on retry.
- **On network timeouts**, the safest move is to:
  1. Not issue a new `UseBenefits`.
  2. Immediately call `GetHistoryService` for the card.
  3. If the redemption is there (by matching `FullBarCode`/`Quantity` within seconds), persist its refs and mark `payments.status = succeeded`.
  4. If it's not there after a reasonable wait, retry `UseBenefits` with the **same** `OriginalRequestId`.

---

## 8. Our wrapper — recommended TypeScript shape

Target file: `src/lib/payments/dts.ts`.

```ts
type DtsCustomer = {
  organizationId: string;
  organizationName: string;
  memberId: string;
  firstName: string;
  lastName: string;
};

type DtsItem = {
  memberId: string;
  organizationId: string;
  businessName: string;
  fullBarCode: string;
  posBarcode: string;
  quantity: number;
  name: string;
  splitVarCode: string[];
};

interface DtsClient {
  getBalance(cardNumber: string): Promise<{
    customer: DtsCustomer;
    items: DtsItem[];
  }>;

  useBenefits(input: {
    originalRequestId: string;          // idempotency key = payments.id
    customer: Pick<DtsCustomer, 'organizationId' | 'organizationName' | 'memberId' | 'firstName' | 'lastName'>;
    items: Array<{
      organizationId: string;           // from getBalance().items[i].organizationId
      fullBarCode: string;
      posBarcode: string;
      quantity: number;
      name: string;
    }>;
  }): Promise<{
    dtsConfirmationNumber: string;      // persist on payments.provider_tx_id
    confirmationOrganizationId: string; // persist on payments.provider_cancel_ref
    redeemed: DtsItem[];
  }>;

  cancel(input: {
    dtsConfirmationNumber: string;
    confirmationOrganizationId: string;
  }): Promise<{ cancelReference: string }>;

  cancelByItems(input: {
    dtsConfirmationNumber: string;
    confirmationOrganizationId: string;
    items: Array<{ organizationId: string; fullBarCode: string; quantity: number }>;
  }): Promise<{ cancelReference: string }>;

  getHistoryService(cardNumber: string): Promise<{
    customer: DtsCustomer;
    history: Array<{
      dtsConfirmationNumber: string;
      fullBarCode: string;
      businessName: string;
      name: string;
      quantity: number;
      // note DTS returns "PostBarCode" (typo) — normalised here
      posBarcode: string;
    }>;
  }>;
}
```

Implementation rules:
- Use `fetch` with `application/x-www-form-urlencoded`. The single form field name is **`Request`** and its value is the **JSON-encoded** request object.
- Unwrap the response:
  ```ts
  const xml = await res.text();
  const match = xml.match(/<string[^>]*>([\s\S]*?)<\/string>/);
  const payload = JSON.parse(match![1]);
  ```
- Check `payload.Result.ResultCode === 0` before consuming anything else; otherwise throw a typed `DtsError(code, friendlyMessage)`.
- Timeout 15s; **no retries** on `UseBenefits` errors — only on transport failures, reusing the same `OriginalRequestId`.
- Always log the call `{method, originalRequestId, dtsConfirmationNumber, resultCode}` to `audit_logs` — **never** log the `SearchString` (card number).
- Validate inputs with Zod at the server-action boundary (see `src/lib/schemas/`).

---

## 9. Project-specific notes

- **Env vars:** `DTS_FOREIGN_TERMINAL` (our merchant ID, e.g. `TS_12345`), `DTS_BASE_URL` (allows staging override later).
- **IP allowlisting:** send DTS ops the egress IP(s) of the host that calls them (our Vercel proxy, if we route through one, or the Vercel IPs if not — unreliable). Without a registered IP, DTS may return `101`.
- **Service mapping table.** Add a DB table so we can translate our services → DTS SKUs:
  ```sql
  CREATE TABLE service_voucher_mappings (
    service_id   UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    provider     TEXT NOT NULL CHECK (provider IN ('dts','vpay')),
    provider_sku TEXT NOT NULL,
    PRIMARY KEY (service_id, provider, provider_sku)
  );
  ```
  For DTS, `provider_sku = FullBarCode`. Admin UI lets staff configure multiple SKUs per service (different clubs issue different codes for the same treatment).
- **DB fields on `payments`:**
  - `provider = 'dts'`
  - `method = 'voucher_dts'`
  - `provider_tx_id = <DtsConfirmationNumber>`
  - `provider_cancel_ref = <ConfirmationOrganizationId>` (DTS needs both to cancel — store both)
  - `invoice_number = <OriginalRequestId>` (UNIQUE)
  - `amount_ils = 0` or the imputed ILS value of the service (for reports; DTS does not provide a number).
  - `webhook_payload` — redacted copy of the DTS response (keep `Result`, `DtsConfirmationNumber`, `Items[]`; drop `Customer` PII beyond first name).
- **Cancellations route** through the existing `cancelBooking()` in `src/lib/scheduling/booking-engine.ts`. The engine reads `payments` for the booking, picks the correct provider adapter based on `provider`, and calls `cancel()` / `cancelByItems()`.
- **When to redeem:** DTS spec says redeem at the moment of service delivery. Business decision: call `UseBenefits` when the booking moves to `completed` (therapist marks done) — not at booking time — so we can reverse cleanly on no-shows. Until then, the slot is held with a 1 NIS credit-card hold (see the payments plan).
- **AI chatbot:** the allowed 6 tools **do not** include DTS calls. Voucher redemption is staff-mediated.

---

## 10. Open questions for DTS onboarding

1. Exact `ForeignTerminal` for our merchant, and whether we can use one test merchant and one production merchant.
2. Which IP(s) to whitelist — confirm whether `101` is raised for unknown IPs.
3. Will DTS issue us a test card with pre-loaded benefits? What does the customer's `MemberId` / `OrganizationId` look like?
4. Our `FullBarCode`/`PosBarcode` catalog mapping for each spa service. Who owns this mapping (DTS or us)?
5. Do they recommend calling `UseBenefits` at booking time (reserve) or at service completion (redeem)? Spec says completion — confirm this is acceptable for our flow.
6. SLA on `UseBenefits` (typical latency, timeout behaviour) so we can pick sensible client timeouts.
7. Are there any merchant-level daily or per-customer caps we should expect?

---

## 11. Reference glossary

| DTS term | In our codebase |
|---|---|
| `ForeignTerminal` | env `DTS_FOREIGN_TERMINAL` |
| `OriginalRequestId` | `payments.invoice_number` (= `payments.id` or derivative) |
| `DtsConfirmationNumber` | `payments.provider_tx_id` |
| `ConfirmationOrganizationId` | `payments.provider_cancel_ref` |
| `FullBarCode` | `service_voucher_mappings.provider_sku` (with `provider='dts'`) |
| `PosBarcode` | optional merchant SKU, not persisted unless DTS starts using it |
| `MemberId` | volatile per-request; **not** persisted in our `customers` table (we key customers by phone) |
