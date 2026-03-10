import { z } from 'zod';

// ═════════════════════════════════════════════════════════
// ORB-1 (The Bank) API Contracts
// Strict payload validation for cross-domain integration.
// ═════════════════════════════════════════════════════════

const UUIDSchema = z.string().uuid();
const AmountSchema = z.number().int().positive().max(100_000_000);
const NoteSchema = z.string().max(200).optional();

export const BuyInRequestSchema = z.object({
    clubId: UUIDSchema,
    chipAmount: AmountSchema,
});

export const RequestCashoutRequestSchema = z.object({
    clubId: UUIDSchema,
    amount: AmountSchema,
    note: NoteSchema,
});

export const TransferChipsRequestSchema = z.object({
    clubId: UUIDSchema,
    toUserId: UUIDSchema,
    amount: AmountSchema,
    note: NoteSchema,
});

export const CancelCashoutRequestSchema = z.object({
    cashoutId: UUIDSchema,
});

export const LeaveClubRequestSchema = z.object({
    clubId: UUIDSchema,
});

export const RakebackRequestSchema = z.object({
    clubId: UUIDSchema,
    action: z.enum(['open', 'close', 'claim']),
});

export const TableChipsRequestSchema = z.object({
    clubId: UUIDSchema,
    tableId: UUIDSchema,
    userId: UUIDSchema,
    action: z.enum(['lock', 'unlock', 'rebuy']),
    amount: AmountSchema,
});

// All POST requests to ORB-1 must include this header
export const Orb1HeadersSchema = z.object({
    'x-idempotency-key': UUIDSchema,
    authorization: z.string().startsWith('Bearer '),
});
