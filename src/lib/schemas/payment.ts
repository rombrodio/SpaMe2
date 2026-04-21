import { z } from "zod";
import {
  PAYMENT_METHODS,
  PAYMENT_ROLES,
  PAYMENT_STATUSES,
  VOUCHER_PROVIDERS,
} from "@/lib/payments/types";

const uuidFormat = z.string().uuid("Invalid UUID");

const israeliPhone = z
  .string()
  .trim()
  .regex(
    /^(\+972|972|0)(5\d|[23489])\d{7,8}$/,
    "Invalid Israeli phone number"
  );

// Enum schemas mirroring src/lib/payments/types.ts
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const paymentRoleSchema = z.enum(PAYMENT_ROLES);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const voucherProviderSchema = z.enum(VOUCHER_PROVIDERS);

export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;
export type PaymentRoleInput = z.infer<typeof paymentRoleSchema>;

// ── Initiate payment (all methods share this entry point) ──

export const initiatePaymentSchema = z.object({
  booking_id: uuidFormat,
  method: paymentMethodSchema,
});
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

// ── Voucher lookups (step 1 of voucher redemption on /order) ──

export const lookupVoucherBalanceSchema = z.object({
  booking_id: uuidFormat,
  provider: voucherProviderSchema,
  card_number: z
    .string()
    .trim()
    .min(8, "Card number too short")
    .max(40, "Card number too long")
    .regex(/^\d+$/, "Card number must be digits only"),
  cvv: z
    .string()
    .regex(/^\d{3,4}$/, "CVV must be 3 or 4 digits")
    .optional(), // required for vpay, unused for dts
});
export type LookupVoucherBalanceInput = z.infer<
  typeof lookupVoucherBalanceSchema
>;

// ── Voucher redemption (step 2) ──

export const redeemDtsVoucherSchema = z.object({
  booking_id: uuidFormat,
  card_number: z
    .string()
    .trim()
    .min(8)
    .max(40)
    .regex(/^\d+$/),
  // Which items from the balance list to redeem. Each entry identifies a
  // benefit by (organizationId, fullBarCode) and carries a positive qty.
  items: z
    .array(
      z.object({
        organization_id: z.string().min(1),
        full_bar_code: z.string().min(1),
        pos_barcode: z.string().default(""),
        quantity: z.number().int().positive(),
        name: z.string().min(1),
      })
    )
    .min(1, "Pick at least one voucher item"),
});
export type RedeemDtsVoucherInput = z.infer<typeof redeemDtsVoucherSchema>;

export const redeemVpayVoucherSchema = z.object({
  booking_id: uuidFormat,
  card_number: z
    .string()
    .trim()
    .min(8)
    .max(40)
    .regex(/^\d+$/),
  cvv: z.string().regex(/^\d{3,4}$/),
  // For partial redemptions the caller may choose to withdraw less than the
  // booking price; the remainder must be collected via another method.
  amount_agorot: z.number().int().positive(),
});
export type RedeemVpayVoucherInput = z.infer<typeof redeemVpayVoucherSchema>;

// ── Cash flows ──

export const markCashReceivedSchema = z.object({
  booking_id: uuidFormat,
  amount_agorot: z.number().int().nonnegative(),
});
export type MarkCashReceivedInput = z.infer<typeof markCashReceivedSchema>;

// ── Penalty ──

export const applyCancellationFeeSchema = z.object({
  booking_id: uuidFormat,
  // Staff may override the computed fee (e.g. as a goodwill gesture).
  override_fee_agorot: z.number().int().nonnegative().optional(),
});
export type ApplyCancellationFeeInput = z.infer<
  typeof applyCancellationFeeSchema
>;

// ── Browser-direct /book → contact form ──

export const bookContactSchema = z.object({
  service_id: uuidFormat,
  therapist_id: uuidFormat,
  start_at: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
      "Must be a valid datetime (YYYY-MM-DDTHH:MM)"
    ),
  full_name: z.string().trim().min(2, "Please enter your name").max(120),
  phone: israeliPhone,
  email: z
    .string()
    .trim()
    .email("Invalid email")
    .max(240)
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type BookContactInput = z.infer<typeof bookContactSchema>;

// ── Inline edits on /order/[token] ──

export const updateOrderDetailsSchema = z.object({
  booking_id: uuidFormat,
  full_name: z.string().trim().min(2).max(120).optional(),
  email: z
    .string()
    .trim()
    .email()
    .max(240)
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type UpdateOrderDetailsInput = z.infer<typeof updateOrderDetailsSchema>;

// ── Admin: service-voucher mappings ──

export const upsertVoucherMappingSchema = z.object({
  service_id: uuidFormat,
  provider: voucherProviderSchema,
  provider_sku: z.string().trim().min(1).max(64),
});
export type UpsertVoucherMappingInput = z.infer<
  typeof upsertVoucherMappingSchema
>;

export const deleteVoucherMappingSchema = z.object({
  service_id: uuidFormat,
  provider: voucherProviderSchema,
  provider_sku: z.string().trim().min(1).max(64),
});
export type DeleteVoucherMappingInput = z.infer<
  typeof deleteVoucherMappingSchema
>;
