# CardCom — Hosted Payment API Reference

> Provider: **CardCom (קארדקום)**, Israeli payment gateway (Shva-connected).
> Products used in this project: **Low Profile** hosted payment page (IFRAME / redirect) and its status endpoints.
> Transport: **SOAP 1.1/1.2 over HTTPS** (CardCom also exposes newer REST/JSON wrappers; we standardise on SOAP which is the documented, stable contract).
> Purpose in this project:
> 1. Accept **full credit-card payment** for a spa booking (`credit_card_full`).
> 2. Accept a small **credit-card hold** (~1 NIS) as a no-show deterrent when the customer intends to pay the rest in cash at reception (`credit_card_hold`).
>
> Source references used: `secure.cardcom.solutions/service.asmx` WSDL, `secure.cardcom.solutions/Interface/BillGoldService.asmx` WSDL, and CardCom's public developer portal (`cardcom.solutions/developers`).
>
> **⚠️ A few fields below (response codes, webhook signature mechanism, handling of `IndicatorUrl` retries) are not fully documented publicly. They are clearly flagged as _"confirm during onboarding"_ throughout this doc — don't guess; ask CardCom support.**

---

## 1. Mental model

CardCom's primary product for web checkout is the **Low Profile** hosted payment page:

1. Our backend calls `CreateLowProfileDeal` with the amount, return URLs, and some metadata. CardCom returns a `LowProfileCode` (a GUID) and a `url` — the hosted page URL.
2. We redirect the customer to that `url` (or embed it as an IFRAME). The customer enters card details **on CardCom's page** — card data never touches our servers. This keeps us out of PCI scope.
3. The customer completes 3-D Secure (if enabled), and CardCom:
   - Redirects them to our `SuccessRedirectUrl` (query string includes `lowprofilecode`, `ReturnValue`, and some transaction metadata), and
   - Issues a **server-to-server POST** to our `IndicatorUrl` (the webhook) with the authoritative result.
4. On webhook receipt, we call **`GetLowProfileIndicator(LowProfileCode)`** to fetch the full signed transaction state, verify it, and update `payments`/`bookings`.

Important properties:

- **Async.** Unlike VPay/DTS, we don't make a synchronous charge call. The customer drives the flow.
- **Idempotent by `LowProfileCode`.** Each hosted-page session has a single GUID; polling or webhooks for the same GUID always describe the same deal.
- **`ReturnValue` round-trips.** Any string we pass in the request comes back in the success redirect query string and in the indicator response. We use it to carry our `payment_id`.
- **Holds vs. charges.** CardCom's hosted page does not expose a pure "authorization-only" primitive in the Low Profile API. A true pre-auth requires the `SuspendDealOnly` operation or the shva-level `J2` validation. For the 1 NIS hold pattern, we use `BillOnly` with `SumToBill = 1` — a real capture, kept as a no-show fee or refunded. **Confirm at onboarding** whether CardCom will provision `J2`/suspend-only for our terminal.

---

## 2. Endpoints & environments

CardCom runs the same production service under two DNS aliases; either works. No public staging exists — test with a **test terminal** (different `terminalnumber`/`username`) that CardCom issues during onboarding.

| Thing | URL |
|---|---|
| Primary SOAP service (most methods) | `https://secure.cardcom.solutions/Interface/BillGoldService.asmx` |
| Alternate `Service` service (superset, includes `CreateLowProfileDeal` + `GetLowProfileIndicator`) | `https://secure.cardcom.solutions/service.asmx` |
| Alternate host (same endpoints, different DNS) | `https://secure.cardcom.co.il/...` |
| WSDL | append `?wsdl` to any of the above |
| Developer portal | https://www.cardcom.solutions/developers |

Both `Service` and `BillGoldService` expose `CreateLowProfileDeal` and `GetLowProfileIndicator` — the fields are the same, so the choice is cosmetic. We use `BillGoldService` because it also exposes `LowProfileChargeToken`, `RevokeLowProfileDeal`, and `GetDealInfo` that we need.

CardCom operates entirely over **public HTTPS** — no VPN, no client certificate required. This is the key operational advantage over VPay.

---

## 3. Authentication

CardCom auth is per-call, carried inside the SOAP body:

| Field | Notes |
|---|---|
| `terminalnumber` / `TerminalNumber` | Integer. Our merchant terminal number (issued by CardCom). |
| `username` / `UserName` | String. The **API username** (not the admin login email). Usually looks like a short alphanumeric handle. |
| `UserPassword` | Required on `BillGoldService` methods like `GetDealInfo`. Not required on `CreateLowProfileDeal`. |

Environment variables (add to `.env.local`):

```
CARDCOM_BASE_URL=https://secure.cardcom.solutions
CARDCOM_TERMINAL_NUMBER=<int>
CARDCOM_API_USERNAME=<string>
CARDCOM_API_PASSWORD=<string>           # only for server-to-server methods
CARDCOM_WEBHOOK_SHARED_SECRET=<string>  # we choose this; see §7
CARDCOM_RETURN_URL_BASE=https://<our-domain>
```

---

## 4. Primary method — `CreateLowProfileDeal`

**Purpose:** create a hosted payment page session. Returns a URL to redirect (or IFRAME) the customer to.

**Endpoint:** `POST /service.asmx` or `POST /Interface/BillGoldService.asmx` with `SOAPAction: "http://cardcom.co.il/CreateLowProfileDeal"`.

### 4.1 Request fields we actually use

The WSDL lists ~60 optional fields (invoice lines, Google Pay button design, Apple Pay, Bit, suspended deals, CSS, AVS, multi-currency, etc.). The minimal set for our two use cases:

| Field | Type | Req | Notes |
|---|---|---|---|
| `terminalnumber` | int | **M** | `CARDCOM_TERMINAL_NUMBER`. |
| `username` | string | **M** | `CARDCOM_API_USERNAME`. |
| `lowprofileParams.Operation` | enum | **M** | See §4.2. For us: `BillOnly` (charge) or `SuspendDealOnly` (if CardCom enables pre-auth on our terminal). |
| `lowprofileParams.SumToBill` | decimal | **M** | Amount in **ILS (decimal)**, e.g. `1.00` for the 1 NIS hold, `350.00` for a full service. Convert from agorot: `amount_agorot / 100`. |
| `lowprofileParams.CoinID` or `CoinISOName` | int / string | O | Currency. ILS (`ISO 376`, name `ILS`) is the default for Israeli terminals. Set explicitly to `1` (CardCom's internal ILS coin id) or `"ILS"` to be safe. |
| `lowprofileParams.Language` (alias: `Languge`, sic) | string | O | `he` / `en`. Default matches the terminal's settings. |
| `lowprofileParams.SuccessRedirectUrl` | string | **M** | Our success callback, e.g. `{CARDCOM_RETURN_URL_BASE}/payments/return?status=success`. CardCom appends query-string params on redirect. |
| `lowprofileParams.ErrorRedirectUrl` | string | **M** | Called on failure. |
| `lowprofileParams.CancelUrl` | string | O | Called when the customer clicks "cancel" on the hosted page. |
| `lowprofileParams.IndicatorUrl` | string | **M for us** | **Server-to-server webhook** URL, e.g. `{CARDCOM_RETURN_URL_BASE}/api/webhooks/cardcom`. CardCom POSTs here once it has a final result, regardless of whether the customer's browser successfully reached the success redirect. This is our source of truth. |
| `lowprofileParams.ReturnValue` | string(50+) | **M for us** | Arbitrary string round-tripped back to us. **Use our `payments.id` UUID.** |
| `lowprofileParams.ProductName` | string | O | Short description shown on the hosted page and invoice. e.g. `"Spa booking — Swedish 60min"`. |
| `lowprofileParams.MaxNumOfPayments` / `MinNumOfPayments` / `DefaultNumOfPayments` | int | O | Instalment caps. For the 1 NIS hold, set both to `1` to force a single payment. |
| `lowprofileParams.HideCVV` | bool | O | Should remain `false` for card-present charges. |
| `lowprofileParams.HideCreditCardUserId` | bool | O | Hebrew-ID field (תעודת זהות). Usually `false`. |
| `lowprofileParams.ThreeDSecureState` | enum | O | `Auto` (recommended), `Enabled`, `Disabled`. |
| `lowprofileParams.CardOwnerName` / `CardOwnerPhone` / `CardOwnerEmail` | string | O | Prefill values. We pass our customer's name/phone; email optional. |
| `lowprofileParams.IsCreateInvoice` | bool | O | If the merchant has "חשבונית ירוקה" enabled, set `true` and supply `InvoiceHead` + `InvoiceLines` to generate a tax invoice automatically. **Confirm with the spa whether they want this on V1.** |
| `lowprofileParams.APILevel` | int | O | Set to `10` or `11` for the richer indicator schema (exposes `CustomEFields`, `ShvaResponce.Uid`, etc.). We use **10**. |
| `lowprofileParams.ExternalMerchantId` | string | O | Another round-tripped field. Some merchants use it; we use `ReturnValue` instead — don't set both. |
| `lowprofileParams.CSSUrl` | string | O | URL to a stylesheet the hosted page loads. Only if we want custom branding. |

### 4.2 `Operation` enum

| Value | Purpose |
|---|---|
| `BillOnly` | Charge only. Our default for full payment and the 1 NIS hold. |
| `BillAndCreateToken` | Charge + create a reusable card token. Useful if we ever want to charge the same card again without the customer re-entering it. Not needed for V1. |
| `CreateTokenOnly` | Tokenise a card without charging. For stored-card flows; not used in V1. |
| `SuspendDealOnly` | Create a **suspended deal** = pre-authorization that can be activated later via `SuspendedDealActivateOne`. Cleanest match for "hold the card, capture on treatment completion", **if CardCom enables this for our terminal.** Confirm at onboarding. |
| `Do3DSAndSubmit` | Run 3DS without charging; rarely used by us. |
| `UpdateBillingInfo` | Update stored card info; not used in V1. |
| `ABDebt` / `DocuemntPay` | Special document-pay/debt flows; not used in V1. |

> **Typo alert:** the WSDL genuinely spells it `DocuemntPay` (sic). If you ever use it, type the typo. We don't use it.

### 4.3 Request — full SOAP 1.1 example (our `BillOnly` with 1 NIS hold)

```xml
POST /Interface/BillGoldService.asmx HTTP/1.1
Host: secure.cardcom.solutions
Content-Type: text/xml; charset=utf-8
SOAPAction: "http://cardcom.co.il/CreateLowProfileDeal"

<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CreateLowProfileDeal xmlns="http://cardcom.co.il/">
      <terminalnumber>123456</terminalnumber>
      <username>api_user</username>
      <lowprofileParams>
        <Operation>BillOnly</Operation>
        <ReturnValue>11111111-2222-3333-4444-555555555555</ReturnValue>  <!-- payments.id -->
        <SumToBill>1.00</SumToBill>
        <CoinISOName>ILS</CoinISOName>
        <Language>he</Language>
        <SuccessRedirectUrl>https://spame2.app/payments/return?r=success</SuccessRedirectUrl>
        <ErrorRedirectUrl>https://spame2.app/payments/return?r=error</ErrorRedirectUrl>
        <CancelUrl>https://spame2.app/payments/return?r=cancel</CancelUrl>
        <IndicatorUrl>https://spame2.app/api/webhooks/cardcom</IndicatorUrl>
        <ProductName>Spa booking hold — Swedish 60min</ProductName>
        <MinNumOfPayments>1</MinNumOfPayments>
        <MaxNumOfPayments>1</MaxNumOfPayments>
        <DefaultNumOfPayments>1</DefaultNumOfPayments>
        <ThreeDSecureState>Auto</ThreeDSecureState>
        <APILevel>10</APILevel>
        <CardOwnerName>ישראל ישראלי</CardOwnerName>
        <CardOwnerPhone>+972521234567</CardOwnerPhone>
        <IsCreateInvoice>false</IsCreateInvoice>
      </lowprofileParams>
    </CreateLowProfileDeal>
  </soap:Body>
</soap:Envelope>
```

### 4.4 Response

```xml
<CreateLowProfileDealResult>
  <ResponseCode>0</ResponseCode>           <!-- 0 = success; any other = failure -->
  <Description>Success</Description>
  <LowProfileCode>a1b2c3d4-...-abc</LowProfileCode>
  <LowProfileVersion>10</LowProfileVersion>
  <BaseUrl>https://secure.cardcom.solutions</BaseUrl>
  <url>https://secure.cardcom.solutions/external/lowProfileCheckout/....</url>
  <PayPalUrl>...</PayPalUrl>               <!-- optional, if PayPal enabled -->
  <BitUrl>...</BitUrl>                     <!-- optional, if Bit enabled -->
  <GooglePayUrl>...</GooglePayUrl>         <!-- optional -->
</CreateLowProfileDealResult>
```

Response usage:

- On `ResponseCode === 0`:
  - **Persist** `LowProfileCode` on `payments.provider_tx_id` (it's the stable handle for this deal).
  - **Redirect** the customer to `url` (or IFRAME it).
- On `ResponseCode !== 0`: log `Description`, mark `payments.status = 'failed'`, surface a friendly error.

---

## 5. Customer journey & return URLs

When the customer finishes (or abandons) the hosted page, CardCom:

1. **Redirects the browser** to one of `SuccessRedirectUrl` / `ErrorRedirectUrl` / `CancelUrl`. Some parameters are appended to the query string (varies by merchant config; `lowprofilecode`, `ReturnValue`, `DealResponse`, `Operation`, `Token`, etc.). These are **not** trustworthy on their own — a user could tamper with the URL. Treat them as hints, not truth.
2. **POSTs** to our `IndicatorUrl` (§7). **This is the authoritative signal.**
3. Regardless of either, we can always **pull state** via `GetLowProfileIndicator` (§6).

Our rule: the browser redirect displays a "please wait" page; we wait for the `payments.status` to be updated by the webhook (or, if that hasn't landed after N seconds, we poll `GetLowProfileIndicator` ourselves). Only then do we show the final state.

---

## 6. Status retrieval — `GetLowProfileIndicator`

**Purpose:** authoritative query of "what happened on this LowProfile deal?" Use it:

- After the webhook fires, to verify + fetch full data.
- As a **fallback poll** if the webhook never arrives (after, say, 2 minutes).
- Manually from admin UI to re-check state.

**Endpoint:** `POST /service.asmx` or `POST /Interface/BillGoldService.asmx` with `SOAPAction: "http://cardcom.co.il/GetLowProfileIndicator"`.

### Request

```xml
<GetLowProfileIndicator xmlns="http://cardcom.co.il/">
  <terminalnumber>123456</terminalnumber>
  <username>api_user</username>
  <LowProfileCode>a1b2c3d4-...-abc</LowProfileCode>
</GetLowProfileIndicator>
```

### Response

```xml
<GetLowProfileIndicatorResult>
  <ResponseCode>0</ResponseCode>
  <Description>Success</Description>
  <Indicator>
    <Terminal_Number>123456</Terminal_Number>
    <RowID>...</RowID>
    <lowprofilecode>a1b2c3d4-...-abc</lowprofilecode>
    <Operation>2</Operation>                  <!-- numeric code for the enum -->
    <ProssesEndOK>1</ProssesEndOK>            <!-- 1 = flow completed successfully -->
    <DealRespone>0</DealRespone>              <!-- 0 = Shva-side success -->
    <InternalDealNumber>999888</InternalDealNumber>  <!-- the CardCom transaction id -->
    <TokenResponse>0</TokenResponse>
    <Token>...</Token>
    <TokenExDate>MMYY or YYYYMMDD</TokenExDate>
    <CardValidityYear>26</CardValidityYear>
    <CardValidityMonth>11</CardValidityMonth>
    <CardOwnerID>...</CardOwnerID>
    <SuspendedDealResponseCode>0</SuspendedDealResponseCode>
    <SuspendedDealId>0</SuspendedDealId>
    <SuspendedDealGroup>0</SuspendedDealGroup>
    <InvoiceResponseCode>0</InvoiceResponseCode>
    <InvoiceNumber>0</InvoiceNumber>
    <InvoiceType>0</InvoiceType>
    <TokenApprovalNumber>...</TokenApprovalNumber>
    <ReturnValue>11111111-2222-3333-4444-555555555555</ReturnValue>  <!-- our payments.id -->
    <OperationResponse>0</OperationResponse>
    <NumOfPayments>1</NumOfPayments>
    <IsRevoked>false</IsRevoked>
    <IsLowProfileDeal24HRevoked>false</IsLowProfileDeal24HRevoked>
    <CoinId>1</CoinId>
    <CardOwnerEmail>...</CardOwnerEmail>
    <CardOwnerName>...</CardOwnerName>
    <CardOwnerPhone>...</CardOwnerPhone>
    <AccountId>...</AccountId>
    <ForeignAccountNumber>...</ForeignAccountNumber>
    <SiteUniqueId>...</SiteUniqueId>
  </Indicator>
  <ShvaResponce>
    <HaveRecipient>true</HaveRecipient>
    <CardNumber5>123456****1234</CardNumber5>   <!-- masked; use last 4 -->
    <Tokef30>11/28</Tokef30>
    <Sum36>100</Sum36>                          <!-- ⚠ amount in agorot (integer) -->
    <ApprovalNumber71>1234567</ApprovalNumber71>
    <CardOwnerName>...</CardOwnerName>
    <CardToken>...</CardToken>
    <DealDate>2026-04-21T10:30:00</DealDate>
    <TerminalNumber>123456</TerminalNumber>
    <InternalDealNumber>999888</InternalDealNumber>
    <Uid>unique-shva-uid</Uid>
    ...
  </ShvaResponce>
  <CustomEFields>
    <Field1>...</Field1>
    ...
  </CustomEFields>
</GetLowProfileIndicatorResult>
```

### Fields we care about

| Field | Meaning | Our use |
|---|---|---|
| `ResponseCode` (top-level) | Did the indicator call succeed | Must be `0`. |
| `Indicator.ProssesEndOK` | `1` if the customer finished the flow | Must be `1` for success. |
| `Indicator.DealRespone` | Shva-side charge result. `0` = approved | Must be `0` for a completed charge. |
| `Indicator.OperationResponse` | Overall operation result | `0` = success. |
| `Indicator.InternalDealNumber` | CardCom's transaction ID | Persist on `payments.provider_internal_deal_id`. |
| `Indicator.ReturnValue` | Our `payments.id` (UUID) | **Must match** what we sent; otherwise reject as spoofed. |
| `Indicator.IsRevoked` | `true` if we revoked the LP deal | Reject as cancelled. |
| `Indicator.IsLowProfileDeal24HRevoked` | `true` if CardCom auto-revoked after 24h | Reject as expired. |
| `Indicator.Token` / `TokenExDate` | Card token if Operation had token creation | Ignore unless using `BillAndCreateToken`. |
| `ShvaResponce.Sum36` | Amount **in agorot (int)** | Verify against `payments.amount_ils`. |
| `ShvaResponce.CardNumber5` | Masked card (e.g. `4580-****-****-1234`) | Extract last 4 → `payments.card_last4`. |
| `ShvaResponce.ApprovalNumber71` | Shva approval number | Persist for reconciliation. |
| `ShvaResponce.InternalDealNumber` | Should match `Indicator.InternalDealNumber` | Sanity check. |
| `ShvaResponce.DealDate` | Transaction timestamp | Persist on `payments.paid_at` (normalise TZ). |

### Validation rule of thumb (what makes a "successful" payment)

```
Indicator.ResponseCode === 0
  && Indicator.ProssesEndOK === 1
  && Indicator.DealRespone === 0
  && Indicator.OperationResponse === 0
  && Indicator.ReturnValue === <our payments.id>
  && ShvaResponce.Sum36 === <payments.amount_ils (agorot)>
  && Indicator.IsRevoked === false
  && Indicator.IsLowProfileDeal24HRevoked === false
```

Anything less → **reject**, mark payment as failed/suspicious, log in audit trail.

---

## 7. Webhook — `IndicatorUrl`

> ⚠️ CardCom's public docs describe the webhook for **invoice/document** events thoroughly (see `support.cardcom.solutions`), but the specifics of **the LowProfile `IndicatorUrl` POST body format, headers, and signing** are not fully published. The fields below match what integrations typically observe, but **verify during onboarding**. Common behaviours:

### Delivery characteristics

- CardCom POSTs to our `IndicatorUrl` after the hosted page finishes.
- Content-Type is usually `application/x-www-form-urlencoded` (classic ASP.NET style). Parse accordingly.
- Fields commonly include: `lowprofilecode`, `ResponseCode`, `Operation`, `ReturnValue`, `InternalDealNumber`, `Terminal_Number`, `Sum`, `NumOfPayments`, `CardOwnerName`, `CardOwnerEmail`, `CardOwnerPhone`, `Token`, `TokenExDate`, some `Field1..Field25` echoes.
- **Retries:** if our endpoint returns non-2xx, CardCom retries a limited number of times with backoff. **Confirm exact retry policy and timeout with CardCom** at onboarding.

### Authenticity — how to know it's really CardCom

CardCom's public docs don't describe an HMAC-SHA256 webhook signature for the LowProfile indicator (unlike Stripe/GitHub). Our options, in order of preference:

1. **Shared-secret in URL** (weakest, but simple). Include a long random token in the `IndicatorUrl` path or query, e.g. `.../api/webhooks/cardcom/<secret>`. Compare to `process.env.CARDCOM_WEBHOOK_SHARED_SECRET` using `crypto.timingSafeEqual`. Rotate on leakage.
2. **Verify by pull-through.** Even if the POST looks legit, **always re-fetch state via `GetLowProfileIndicator`** before changing `payments.status`. This is the single best defence: an attacker can't fake the GUID + our API credentials. Do this **unconditionally**.
3. **IP allowlist.** Ask CardCom for their indicator-sending IP range, allow only those at the edge (Vercel middleware). CardCom historically publishes these on request.
4. **Check if HMAC is offered now.** CardCom has been expanding its developer portal; during onboarding ask if they offer a per-terminal HMAC signature for webhooks. If yes, use it.

### Handler outline (`src/app/api/webhooks/cardcom/route.ts`)

```ts
export async function POST(req: NextRequest) {
  // 1. Shared-secret check (path segment or header)
  // 2. Parse x-www-form-urlencoded body
  // 3. Extract LowProfileCode and ReturnValue (= payments.id)
  // 4. Load the payment row by id; reject if not found OR if LowProfileCode mismatch
  // 5. Call getLowProfileIndicator(LowProfileCode) — pull-through verification
  // 6. Apply validation rule from §6; on success:
  //      payments.status = 'succeeded'
  //      payments.provider_internal_deal_id = Indicator.InternalDealNumber
  //      payments.paid_at = ShvaResponce.DealDate
  //      payments.card_last4 = last 4 of ShvaResponce.CardNumber5
  //      payments.webhook_payload = redacted copy
  //    then update bookings.status based on payments.role
  //      (capture → confirmed; hold → confirmed_with_cash_due)
  // 7. Write audit_log row
  // 8. Return 200 OK quickly (<3s); CardCom may retry on timeout
}
```

All DB writes inside the handler use the **service-role** Supabase client (see `src/lib/supabase/admin.ts`), since the caller is not authenticated.

**Idempotency:** a webhook may arrive twice. Key on `LowProfileCode` + `ReturnValue`; if the payment is already `succeeded` and matches, return 200 without reprocessing. Never double-confirm a booking.

---

## 8. Secondary methods

### 8.1 `RevokeLowProfileDeal` — cancel an unused / unfinished hosted-page session

Endpoint: `POST /Interface/BillGoldService.asmx`, `SOAPAction: "BillGoldService/RevokeLowProfileDeal"`.

**Use cases:**
- Customer closed the browser without paying → their 24h window is still open. Revoke to mark it dead in our system and free UI state.
- Admin cancels the booking before payment — revoke the LowProfile session so the customer can't still complete it.

Request:

```xml
<RevokeLowProfileDeal xmlns="BillGoldService">
  <TerminalNumber>int</TerminalNumber>
  <UserName>string</UserName>
  <UserPassword>string</UserPassword>
  <LowProfileCode>guid</LowProfileCode>
</RevokeLowProfileDeal>
```

Response returns a `ResponseCode` (0 = success). After revoke, `GetLowProfileIndicator.Indicator.IsRevoked` becomes `true`.

> Note: this **cannot** refund an already-charged deal. For that, see §8.3.

### 8.2 `GetDealInfo` — fetch an existing Shva transaction (up to 6 months back)

Endpoint: `POST /Interface/BillGoldService.asmx`, `SOAPAction: "BillGoldService/GetDealInfo"`.

Request:

```xml
<GetDealInfo xmlns="BillGoldService">
  <TerminalNumber>int</TerminalNumber>
  <UserName>string</UserName>
  <UserPassword>string</UserPassword>
  <InternalDealNumber>long</InternalDealNumber>
  <AddFailedDeals>false</AddFailedDeals>
</GetDealInfo>
```

Returns up to ~35 Shva fields (`ExtShvaParams`), same shape as what `GetLowProfileIndicator` exposes under `ShvaResponce`. Useful for reconciliation tools / admin dashboards but not required for the basic flow.

### 8.3 Refunds

CardCom **does not expose refunds** on the LowProfile service directly. Two common paths:

1. **Manual refund** via the merchant dashboard (`merchant.cardcom.co.il`). Simple, fine for low volume.
2. **API refund** via `LowProfileSimpleCharge` called with a **negative `SumToBill`** (some merchants use this) or via a dedicated credit-card service method on a different asmx. This varies by terminal provisioning — **confirm with CardCom onboarding** which refund method your terminal supports, and update this doc.

Our initial implementation: refunds are manual from the dashboard. Record refunds as a separate `payments` row with `role='refund'`, `amount_ils` negative, `paid_at` = dashboard timestamp. Add API refunds in a follow-up once we confirm the method.

### 8.4 `LowProfileChargeToken` — reuse a stored card

If we ever start tokenising cards (operation `BillAndCreateToken` on prior deal), this method lets us charge again without the hosted page. Fields: `TerminalNumber`, `UserName`, `APILevel`, plus an `OperationInfo` block with the `Token`, `CardValidityYear/Month`, `Sum`, `NumOfPayments`. Not used in V1 — document once we add stored-card support.

### 8.5 `SuspendedDealActivateOne` — capture a suspended deal

Only relevant if CardCom enables `SuspendDealOnly` for our terminal (our cleanest "hold" option). Takes `SuspendedDealId` (from the indicator) and activates it into a real charge.

---

## 9. Response codes — quick reference

CardCom uses integer response codes throughout. `0 = success` across the board. Non-zero values are described in plain text in the `Description` field of the response.

Common codes we see in practice (compiled from CardCom documentation + community reports — **treat the exact list as informational; always log `Description` verbatim**):

| Code | Meaning (general) |
|---|---|
| `0` | Success. |
| `1–35` | Shva-level card refusals (`Status1` from Shva maps to these). E.g. decline, insufficient funds, card blocked, wrong CVV. User-facing message should be generic "Card was declined". |
| `57` | 3D Secure failed / customer did not complete. |
| `66` | Deal cancelled by user. |
| `400` / `401` / `403` | Invalid request / invalid credentials / terminal not authorised for this operation. Config error. |
| `500` / `502` / `503` | CardCom-side server error. Retry with backoff. |
| `700`+ | Validation of request params (invalid amount, invalid currency, malformed URLs, etc.). Fix the request. |
| `900`+ | Invoice-module errors when `IsCreateInvoice=true`. |

> **Confirm during onboarding.** Ask CardCom ops for their current `CardComErrorCodes.pdf` (they maintain a living spreadsheet). Drop the authoritative mapping into this doc under a `§9.1 Full code table` section once you have it.

### User-facing mapping (suggested)

| Code group | UI action |
|---|---|
| 1–35 | "Your card was declined. Please try another card." |
| 57 | "3-D Secure verification failed. Please try again." |
| 66 | Show cancelled state; let them retry. |
| 400/401/403/700+ | "Payment temporarily unavailable. Please contact support." (These indicate bugs on our side — log loudly.) |
| 500/502/503 | "Payment service is busy. Please try again in a moment." |

---

## 10. The two flows concretely

### 10.1 `credit_card_full` — full charge

```
createBooking() → booking.status = 'pending_payment'
↓
initiateCreditCardPayment(booking_id, role='capture')
  → insert payments row: {id, method: 'credit_card_full', role: 'capture',
                          amount_ils: <full>, status: 'pending'}
  → CardCom.createLowProfileDeal({
      Operation: 'BillOnly',
      SumToBill: amount_ils / 100,
      ReturnValue: payments.id,
      IndicatorUrl: ".../api/webhooks/cardcom",
      SuccessRedirectUrl/ErrorRedirectUrl/CancelUrl: ".../payments/return?...",
    })
  → persist LowProfileCode on payments.provider_tx_id
  → return hosted-page URL
↓
Customer pays on CardCom
↓
CardCom POSTs our IndicatorUrl
↓
Webhook handler verifies via GetLowProfileIndicator
  → payments.status = 'succeeded'
  → bookings.status = 'confirmed'
  → audit_log
```

### 10.2 `credit_card_hold` — 1 NIS hold, cash at reception

Same flow as 10.1, but with these deltas:

```
initiateCreditCardPayment(booking_id, role='hold')
  → insert payments row: {id, method: 'credit_card_hold', role: 'hold',
                          amount_ils: <hold_agorot>, status: 'pending'}
  → bookings.cash_due_agorot = <service_price - hold>
  → CardCom.createLowProfileDeal({
      Operation: 'BillOnly',              // or SuspendDealOnly if provisioned
      SumToBill: <hold_agorot> / 100,      // e.g. 1.00
      MinNumOfPayments: 1, MaxNumOfPayments: 1, DefaultNumOfPayments: 1,
      ProductName: "Booking confirmation fee",
      ReturnValue: payments.id,
      ...
    })
↓
Webhook verifies → payments.status='succeeded'
  → bookings.status = 'confirmed'         // but cash_due_agorot > 0 on the booking
↓
At treatment completion: therapist marks completed
  → server action: markCashReceived(booking_id)
    → insert payments row: {method: 'cash_at_reception', role: 'remainder_cash',
                            amount_ils: bookings.cash_due_agorot, status: 'succeeded'}
    → bookings.cash_due_agorot = 0
```

Cancellation policy for `credit_card_hold`:
- **Late cancel / no-show:** keep the 1 NIS. `payments.status` stays `succeeded`, `bookings.status='no_show'`.
- **In-policy cancel:** refund the 1 NIS manually from the CardCom dashboard (or via API refund once we confirm the method); insert a `role='refund'` row with negative `amount_ils`.

---

## 11. Project-specific mapping to our schema

Proposed fields for the `payments` table migration (beyond the existing shape in `supabase/migrations/00008_payments.sql`):

| Column | Value for CardCom |
|---|---|
| `provider` | `'cardcom'` |
| `method` | `'credit_card_full'` or `'credit_card_hold'` |
| `role` | `'capture'`, `'hold'`, `'refund'`, `'remainder_cash'` |
| `provider_tx_id` | `LowProfileCode` (GUID) |
| `provider_internal_deal_id` | `InternalDealNumber` (long) — added for CardCom |
| `card_last4` | last 4 of `ShvaResponce.CardNumber5` |
| `invoice_number` | **not used** for CardCom (they issue their own invoice). Leave null or stash CardCom's `InvoiceNumber` if `IsCreateInvoice=true`. |
| `payment_page_url` | `url` returned by `CreateLowProfileDeal` |
| `webhook_payload` | redacted dump of indicator response (remove any PAN data beyond last 4) |
| `paid_at` | `ShvaResponce.DealDate` (convert to UTC) |

### Audit log

Every CardCom state change goes through `writeAuditLog` in `src/lib/audit.ts`. Record:
- `createLowProfileDeal` start (with `LowProfileCode`)
- Webhook received
- Indicator verified (success / rejection reason)
- Revoke / refund

### AI chatbot

From the 6 approved tools in `CLAUDE.md`, only `create_payment_link` interacts with CardCom. The tool:
- Is a thin wrapper around `initiateCreditCardPayment(booking_id, role)`.
- Returns the `url` from CardCom.
- Does **not** accept amounts or card data from the chatbot — role + booking_id only.
- Never exposes `LowProfileCode` or tokens to the user.

---

## 12. Open questions to resolve with CardCom ops

Track these with their account manager; don't assume:

1. Exact `TerminalNumber` + `UserName` + `Password` for test and production.
2. Whether `SuspendDealOnly` (pre-auth) is enabled on our terminal. If yes, switch the hold flow to it — cleaner than capture-and-refund.
3. Authoritative list of **response codes** and their categorisation (get their current `ErrorCodes` doc).
4. Exact **IndicatorUrl** POST shape: content-type, field names, encoding, retry count and timeout.
5. Whether they offer an **HMAC signature** for the webhook. If yes, what header/secret mechanism.
6. **IP range** CardCom uses to POST the indicator (for firewall/edge allowlisting).
7. **Refund method** supported on our terminal — dashboard only, or API (`LowProfileSimpleCharge` with negative sum, or a dedicated refund service).
8. Whether `APILevel=10` vs `APILevel=11` makes a difference we care about.
9. Whether Bit / Google Pay / Apple Pay are enabled on our terminal (affects optional URLs returned by `CreateLowProfileDeal`).
10. Invoice module (`IsCreateInvoice=true`) — do we use it for V1, or is the spa issuing invoices in a separate system?

---

## 13. Our wrapper — recommended TypeScript shape

Target file: `src/lib/payments/cardcom.ts`. Implements the `HostedPaymentProvider` interface (see `docs/integrations/API_VPay.md` for sibling interfaces).

```ts
export interface CardComClient {
  createLowProfileDeal(input: {
    paymentId: string;              // → ReturnValue
    amountAgorot: number;
    operation: 'BillOnly' | 'SuspendDealOnly' | 'BillAndCreateToken' | 'CreateTokenOnly';
    productName: string;
    language?: 'he' | 'en';
    customer: { name: string; phone?: string; email?: string };
    urls: {
      success: string;
      error: string;
      cancel: string;
      indicator: string;            // our webhook
    };
    singlePayment?: boolean;        // forces min=max=1
    threeDS?: 'Auto' | 'Enabled' | 'Disabled';
  }): Promise<{
    lowProfileCode: string;
    url: string;
    bitUrl?: string;
    googlePayUrl?: string;
    paypalUrl?: string;
  }>;

  getLowProfileIndicator(lowProfileCode: string): Promise<LowProfileIndicator>;

  revokeLowProfileDeal(lowProfileCode: string): Promise<{ revoked: true }>;

  getDealInfo(internalDealNumber: number): Promise<DealInfo>;
}

export type LowProfileIndicator = {
  responseCode: number;
  description: string;
  indicator: {
    lowProfileCode: string;
    operation: number;
    processEndOK: 0 | 1;
    dealResponse: number;
    operationResponse: number;
    internalDealNumber: number;
    returnValue: string;            // our paymentId
    token?: string;
    tokenExpiry?: string;
    cardValidityYear?: string;
    cardValidityMonth?: string;
    isRevoked: boolean;
    isLowProfileDeal24HRevoked: boolean;
    invoiceNumber?: number;
    cardOwnerName?: string;
    cardOwnerEmail?: string;
    cardOwnerPhone?: string;
  };
  shva: {
    sumAgorot: number;              // Sum36
    cardMasked: string;             // CardNumber5
    cardLast4: string;              // derived
    approvalNumber: string;
    dealDate: string;               // ISO
    internalDealNumber: number;
    uid: string;
  };
};
```

Implementation rules:
- SOAP client: a small `fetch`-based helper that accepts an operation name and a params object, emits SOAP 1.1, and parses the response XML with a lightweight parser (e.g. `fast-xml-parser`). No DI.
- **Always pull-through verify via `getLowProfileIndicator` in the webhook handler.** Never trust the POST body alone.
- Amounts: convert `agorot → ILS decimal` when sending (`/100`, `.toFixed(2)`), convert `Sum36 (agorot int) → our agorot int` when reading.
- Timeouts: 15s for `CreateLowProfileDeal`, 10s for indicator.
- Retries: only on **5xx** or network failures. Never retry `CreateLowProfileDeal` without generating a new `payments.id` (which means new `ReturnValue`); otherwise the next deal for the same `payments.id` could confuse indicator queries.
- Redaction: log only `LowProfileCode`, `InternalDealNumber`, and `card_last4`. Never log full card numbers, CVV, or PAN-adjacent data (CardCom doesn't send CVV to us anyway, but be defensive).

---

## 14. Reference glossary

| CardCom term | In our codebase |
|---|---|
| `LowProfileCode` (GUID) | `payments.provider_tx_id` |
| `InternalDealNumber` (long) | `payments.provider_internal_deal_id` |
| `ReturnValue` | `payments.id` (our UUID) |
| `Operation` enum | `payments.method` + `payments.role` |
| `SumToBill` (ILS decimal) | `payments.amount_ils` (agorot int) ÷ 100 |
| `IndicatorUrl` | env `CARDCOM_RETURN_URL_BASE` + `/api/webhooks/cardcom` |
| `terminalnumber` / `username` | env `CARDCOM_TERMINAL_NUMBER` / `CARDCOM_API_USERNAME` |
| `Token` (GUID) | (future) `payments.card_token` if we ever store cards |
| Suspended deal | (future) `payments.role='hold'` with `method='credit_card_hold'`, if we switch to `SuspendDealOnly` |
