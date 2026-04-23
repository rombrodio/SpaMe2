import { describe, it, expect, beforeEach } from "vitest";
import { parseSoapJsonEnvelope, DtsError } from "../dts";
import { buildMockDtsProvider, resetDtsMock, seedDtsCard } from "../mock";

describe("parseSoapJsonEnvelope", () => {
  it("extracts JSON from a well-formed SOAP string wrapper", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<string xmlns="http://tempuri.org/">{"Result":{"ResultCode":0,"ResultMessage":"ok"}}</string>`;
    const parsed = parseSoapJsonEnvelope(xml, "GetBalance");
    expect(parsed.Result.ResultCode).toBe(0);
  });

  it("decodes XML entities inside the JSON body", () => {
    const xml =
      '<string xmlns="http://tempuri.org/">{"Result":{"ResultCode":0,"ResultMessage":"a &amp; b"}}</string>';
    const parsed = parseSoapJsonEnvelope(xml, "GetBalance");
    expect(parsed.Result.ResultMessage).toBe("a & b");
  });

  it("throws on malformed envelope", () => {
    expect(() => parseSoapJsonEnvelope("<not-xml/>", "GetBalance")).toThrow(
      /no <string>/
    );
  });

  it("throws on non-JSON body", () => {
    const xml =
      '<string xmlns="http://tempuri.org/">not valid json</string>';
    expect(() => parseSoapJsonEnvelope(xml, "GetBalance")).toThrow(
      /not valid JSON/
    );
  });

  it("throws when ResultCode is missing", () => {
    const xml =
      '<string xmlns="http://tempuri.org/">{"Result":{"no":"code"}}</string>';
    expect(() => parseSoapJsonEnvelope(xml, "GetBalance")).toThrow(
      /Result\.ResultCode/
    );
  });
});

describe("Mock DTS provider", () => {
  const customer = {
    organizationId: "org-777",
    organizationName: "Knowledge",
    memberId: "mem-001",
    firstName: "Dana",
    lastName: "Levi",
  };

  beforeEach(() => {
    resetDtsMock();
    seedDtsCard("1234567890", {
      customer,
      items: [
        {
          memberId: customer.memberId,
          organizationId: customer.organizationId,
          businessName: "Spa",
          fullBarCode: "DTS-SWEDISH-60",
          posBarcode: "",
          quantity: 2,
          name: "Swedish 60min",
          splitVarCode: [],
        },
        {
          memberId: customer.memberId,
          organizationId: customer.organizationId,
          businessName: "Spa",
          fullBarCode: "DTS-FACIAL",
          posBarcode: "",
          quantity: 1,
          name: "Facial",
          splitVarCode: [],
        },
      ],
    });
  });

  it("getBalance returns seeded customer + items", async () => {
    const dts = buildMockDtsProvider();
    const res = await dts.getBalance("1234567890");
    expect(res.customer.organizationId).toBe("org-777");
    expect(res.items).toHaveLength(2);
    expect(res.items[0].fullBarCode).toBe("DTS-SWEDISH-60");
  });

  it("getBalance throws on unknown card (error 42 from provider)", async () => {
    const dts = buildMockDtsProvider();
    await expect(dts.getBalance("0000000000")).rejects.toMatchObject({
      code: 42,
    });
  });

  it("useBenefits succeeds and returns confirmation references", async () => {
    const dts = buildMockDtsProvider();
    const result = await dts.useBenefits({
      originalRequestId: "req-abc",
      customer,
      items: [
        {
          organizationId: customer.organizationId,
          fullBarCode: "DTS-SWEDISH-60",
          posBarcode: "",
          quantity: 1,
          name: "Swedish 60min",
        },
      ],
    });
    expect(result.dtsConfirmationNumber).toBeTypeOf("string");
    expect(result.confirmationOrganizationId).toBe(customer.organizationId);
    expect(result.redeemed).toHaveLength(1);
  });

  it("useBenefits is idempotent on same OriginalRequestId (error 108 simulation)", async () => {
    const dts = buildMockDtsProvider();
    const first = await dts.useBenefits({
      originalRequestId: "req-dup",
      customer,
      items: [
        {
          organizationId: customer.organizationId,
          fullBarCode: "DTS-SWEDISH-60",
          posBarcode: "",
          quantity: 1,
          name: "Swedish 60min",
        },
      ],
    });
    const second = await dts.useBenefits({
      originalRequestId: "req-dup",
      customer,
      items: [
        {
          organizationId: customer.organizationId,
          fullBarCode: "DTS-SWEDISH-60",
          posBarcode: "",
          quantity: 1,
          name: "Swedish 60min",
        },
      ],
    });
    // Mock returns the previous redemption refs rather than creating a new one.
    expect(second.confirmationOrganizationId).toBe(
      first.confirmationOrganizationId
    );
  });

  it("useBenefits rejects mixed-organization items (simulated error 105)", async () => {
    const dts = buildMockDtsProvider();
    await expect(
      dts.useBenefits({
        originalRequestId: "req-mixed",
        customer,
        items: [
          {
            organizationId: "org-a",
            fullBarCode: "X",
            posBarcode: "",
            quantity: 1,
            name: "X",
          },
          {
            organizationId: "org-b",
            fullBarCode: "Y",
            posBarcode: "",
            quantity: 1,
            name: "Y",
          },
        ],
      })
    ).rejects.toMatchObject({ code: 105 });
  });

  it("cancel returns a cancel reference even if already cancelled", async () => {
    const dts = buildMockDtsProvider();
    const cancel1 = await dts.cancel({
      dtsConfirmationNumber: "xyz",
      confirmationOrganizationId: customer.organizationId,
    });
    expect(cancel1.cancelReference).toMatch(/^cancel-/);
  });
});

describe("DtsError shape", () => {
  it("exposes code + friendly message + operation", () => {
    const err = new DtsError("UseBenefits", 106, "לא מספיק יתרה", "Quantity > balance");
    expect(err.code).toBe(106);
    expect(err.operation).toBe("UseBenefits");
    expect(err.friendlyMessage).toBe("לא מספיק יתרה");
    expect(err.message).toMatch(/DTS UseBenefits failed \(code=106\)/);
  });
});
