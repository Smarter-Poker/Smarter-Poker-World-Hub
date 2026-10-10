import type { NextApiRequest } from "next";
export function getServerUser(req: NextApiRequest | Request, options?: { verifySession?: (user: any, token: string) => Promise<"alive" | "revoked" | "unknown"> }): Promise<{ id: string; email: string | null; role: string; aud: string | null } | null>;
export function getServerUserWithFallback(req: NextApiRequest | Request, supabase: any, options?: { verifySession?: (user: any, token: string) => Promise<"alive" | "revoked" | "unknown"> }): Promise<{ user: { id: string; email: string | null; role: string; aud: string | null } | null; error: string | null; status?: number }>;
export function verifySupabaseJwt(token: string, secret: string): Promise<any>;
