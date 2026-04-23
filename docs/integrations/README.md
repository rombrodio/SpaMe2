# Integration docs

Reference material for the three payment providers used in Phase 4. Each
file is structured identically so an AI coding agent (or a new developer)
can load one or all three without re-learning the layout.

## Providers

| File | Provider | Transport | Role |
|---|---|---|---|
| [API_CardCom.md](./API_CardCom.md) | CardCom Low Profile | SOAP 1.1 over HTTPS | Hosted payment page, tokens, captures |
| [API_DTS.md](./API_DTS.md) | DTS-Knowledge benefit vouchers | JSON over HTTPS (form-encoded) | Unit-based voucher redemption |
| [API_VPay.md](./API_VPay.md) | Verifone VPay prepaid | SOAP 1.1 over HTTPS (via proxy) | Money-wallet voucher redemption |

Each doc includes:

1. **Mental model** — what the provider actually does.
2. **Endpoints + environments**.
3. **Authentication / network security** (VPay requires mTLS or IP
   allowlist; CardCom uses per-call username + password; DTS is plain
   HTTPS with a merchant ID).
4. **Every API method** with request / response shapes and realistic
   examples copied from the vendor's own docs where possible.
5. **Error-code tables** with suggested UI mappings.
6. **Idempotency rules** — quirks that matter if a customer retries.
7. **Our TypeScript wrapper shape** matching the
   `HostedPaymentProvider` / `PosMoneyVoucherProvider` /
   `PosBenefitVoucherProvider` interfaces in `src/lib/payments/types.ts`.
8. **Project-specific mapping** — how each provider's concepts land in
   our `payments` table columns.
9. **Open questions** to resolve with the vendor during onboarding.

## Implementation cross-reference

| Concept | CardCom | DTS | VPay |
|---|---|---|---|
| Main adapter | [src/lib/payments/cardcom.ts](../../src/lib/payments/cardcom.ts) | [src/lib/payments/dts.ts](../../src/lib/payments/dts.ts) | [src/lib/payments/vpay.ts](../../src/lib/payments/vpay.ts) |
| Mock | [src/lib/payments/mock.ts](../../src/lib/payments/mock.ts) | same | same |
| Unit tests | [src/lib/payments/__tests__/cardcom.test.ts](../../src/lib/payments/__tests__/cardcom.test.ts) | […/dts.test.ts](../../src/lib/payments/__tests__/dts.test.ts) | […/vpay.test.ts](../../src/lib/payments/__tests__/vpay.test.ts) |
| End-to-end flow exercised in | [e2e.test.ts](../../src/lib/payments/__tests__/e2e.test.ts) | same | same |

The shared orchestration layer that calls into the three adapters lives
in [src/lib/payments/engine.ts](../../src/lib/payments/engine.ts). Every
engine function writes an `audit_logs` row on state change.

## When to refer back to these docs

- Before changing any provider-facing code — the error-code tables keep
  the friendly-message UI mappings accurate.
- When an AI agent is generating new provider code — load the relevant
  `API_*.md` into context; it has the complete request/response shapes
  plus the specific gotchas the implementation layer relies on.
- During onboarding calls with the provider — the "Open questions"
  section of each doc is the checklist.

## Vendor source material

The original vendor PDFs + Postman collection live under
`vaucher_provder_api_documentation/` (not tracked — they're proprietary).
Our docs distil and translate those into the specific patterns our
backend uses.
