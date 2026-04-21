import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { issueOrderToken, verifyOrderToken } from "../jwt";

const ORIGINAL_SECRET = process.env.ORDER_TOKEN_SECRET;

beforeAll(() => {
  process.env.ORDER_TOKEN_SECRET =
    "test-secret-must-be-at-least-32-chars-long-aaaaa";
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.ORDER_TOKEN_SECRET;
  else process.env.ORDER_TOKEN_SECRET = ORIGINAL_SECRET;
});

describe("JWT for /order/<token>", () => {
  const bid = "11111111-1111-4111-8111-111111111111";

  it("round-trips claims (book source, no payment id yet)", async () => {
    const token = await issueOrderToken({ bid, src: "book" });
    const result = await verifyOrderToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.bid).toBe(bid);
      expect(result.claims.src).toBe("book");
      expect(result.claims.pid).toBeUndefined();
      expect(result.claims.iat).toBeTypeOf("number");
      expect(result.claims.exp).toBeTypeOf("number");
    }
  });

  it("round-trips with payment id", async () => {
    const pid = "22222222-2222-4222-8222-222222222222";
    const token = await issueOrderToken({ bid, pid, src: "whatsapp" });
    const result = await verifyOrderToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.pid).toBe(pid);
      expect(result.claims.src).toBe("whatsapp");
    }
  });

  it("rejects a tampered token as invalid", async () => {
    const token = await issueOrderToken({ bid, src: "book" });
    const tampered = token.slice(0, -4) + "AAAA";
    const result = await verifyOrderToken(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/invalid|malformed/);
  });

  it("rejects expired tokens", async () => {
    const token = await issueOrderToken(
      { bid, src: "book" },
      { ttlSeconds: 1 }
    );
    await new Promise((r) => setTimeout(r, 1100));
    const result = await verifyOrderToken(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("rejects empty / garbage tokens", async () => {
    expect((await verifyOrderToken("")).ok).toBe(false);
    expect((await verifyOrderToken("not.a.jwt")).ok).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const good = await issueOrderToken({ bid, src: "book" });

    const savedSecret = process.env.ORDER_TOKEN_SECRET!;
    process.env.ORDER_TOKEN_SECRET =
      "different-secret-also-at-least-32-chars-aaaaa";
    const result = await verifyOrderToken(good);
    process.env.ORDER_TOKEN_SECRET = savedSecret;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  });

  it("refuses to issue a token when the secret is too short", async () => {
    const savedSecret = process.env.ORDER_TOKEN_SECRET!;
    process.env.ORDER_TOKEN_SECRET = "tooShort";
    await expect(issueOrderToken({ bid, src: "book" })).rejects.toThrow(
      /ORDER_TOKEN_SECRET/
    );
    process.env.ORDER_TOKEN_SECRET = savedSecret;
  });

  it("rejects an unknown source claim as malformed", async () => {
    // Build a token with a bogus 'src' value by issuing with 'book' then
    // swapping — easiest path is to issue via jose directly.
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({ bid, src: "bogus" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("spame2")
      .setAudience("order-token")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(process.env.ORDER_TOKEN_SECRET!));

    const result = await verifyOrderToken(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });
});
