import type { NextApiRequest } from "next";
export function getServerUser(req: NextApiRequest | Request): Promise<{ id: string; email: string | null; role: string; aud: string | null } | null>;
export function getServerUserWithFallback(req: NextApiRequest | Request, supabase: any): Promise<{ user: { id: string; email: string | null; role: string; aud: string | null } | null; error: string | null }>;
export function verifySupabaseJwt(token: string, secret: string): Promise<any>;
