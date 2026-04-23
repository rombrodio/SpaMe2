/**
 * Short-lived signed tokens for the /order/<token> finalization page.
 *
 * Token is the only credential customers have — no login, no cookies.
 * Claims carry just enough to look up the booking and payment server-side:
 *   - bid  = booking_id (UUID)
 *   - pid  = payment_id (optional; set once a payment row exists)
 *   - src  = where the customer came from (for analytics + deep-link back)
 *   - iat / exp = standard JWT timestamps
 *
 * HS256 with a repo-configured ORDER_TOKEN_SECRET. Default lifetime
 * matches the soft-hold window (15 min) + a 15-min grace for slow filler
 * = 30 min.
 */

import { SignJWT, jwtVerify, errors as joseErrors } from "jose";

const DEFAULT_TTL_SECONDS = 30 * 60;
const ISSUER = "spame2";
const AUDIENCE = "order-token";
const ALG = "HS256";

export type OrderTokenSource = "book" | "whatsapp" | "admin";

export interface OrderTokenClaims {
  /** Booking ID. */
  bid: string;
  /** Payment ID, set once a /order page spins up a payment row. */
  pid?: string;
  /** Entry path. */
  src: OrderTokenSource;
  iat?: number;
  exp?: number;
}

function getSecret(): Uint8Array {
  const raw = process.env.ORDER_TOKEN_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "ORDER_TOKEN_SECRET is missing or too short (need at least 32 characters). " +
        "Generate with: openssl rand -base64 48"
    );
  }
  return new TextEncoder().encode(raw);
}

export async function issueOrderToken(
  claims: Omit<OrderTokenClaims, "iat" | "exp">,
  opts: { ttlSeconds?: number } = {}
): Promise<string> {
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ bid: claims.bid, pid: claims.pid, src: claims.src })
    .setProtectedHeader({ alg: ALG, typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(getSecret());
}

export type VerifyOrderTokenResult =
  | { ok: true; claims: OrderTokenClaims }
  | { ok: false; reason: "expired" | "invalid" | "malformed" };

export async function verifyOrderToken(
  token: string
): Promise<VerifyOrderTokenResult> {
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "malformed" };
  }

  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALG],
    });

    const bid = payload.bid;
    const pid = payload.pid;
    const src = payload.src;

    if (typeof bid !== "string" || !bid) {
      return { ok: false, reason: "malformed" };
    }
    if (src !== "book" && src !== "whatsapp" && src !== "admin") {
      return { ok: false, reason: "malformed" };
    }
    if (pid !== undefined && typeof pid !== "string") {
      return { ok: false, reason: "malformed" };
    }

    return {
      ok: true,
      claims: {
        bid,
        pid,
        src,
        iat: payload.iat,
        exp: payload.exp,
      },
    };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return { ok: false, reason: "expired" };
    }
    if (
      err instanceof joseErrors.JWTInvalid ||
      err instanceof joseErrors.JWTClaimValidationFailed ||
      err instanceof joseErrors.JWSInvalid ||
      err instanceof joseErrors.JWSSignatureVerificationFailed
    ) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: false, reason: "malformed" };
  }
}
