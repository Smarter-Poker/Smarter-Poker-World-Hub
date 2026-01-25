/**
 * 🛡️ SMARTER POKER ESLint PLUGIN — NO DANGEROUS SUPABASE AUTH
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Custom ESLint rule that BLOCKS dangerous Supabase auth methods:
 * - supabase.auth.getUser()
 * - supabase.auth.getSession()
 * - supabase.auth.refreshSession()
 * 
 * These methods can throw AbortError and cause the 0/0/LV1 bug.
 * Use authUtils.ts instead!
 * 
 * ═══════════════════════════════════════════════════════════════════
 */

module.exports = {
    rules: {
        'no-dangerous-supabase-auth': {
            meta: {
                type: 'problem',
                docs: {
                    description: 'Disallow dangerous Supabase auth methods that can cause AbortError',
                    category: 'Possible Errors',
                    recommended: true,
                },
                messages: {
                    dangerousGetUser:
                        '🚫 FORBIDDEN: supabase.auth.getUser() can throw AbortError!\n' +
                        '   Use: import { getAuthUser } from "@/lib/authUtils"',
                    dangerousGetSession:
                        '🚫 FORBIDDEN: supabase.auth.getSession() can throw AbortError!\n' +
                        '   Use: import { getAuthUser } from "@/lib/authUtils"',
                    dangerousRefreshSession:
                        '🚫 FORBIDDEN: supabase.auth.refreshSession() can throw AbortError!\n' +
                        '   Use onAuthStateChange() for session updates instead.',
                },
                schema: [],
            },
            create(context) {
                const DANGEROUS_METHODS = {
                    'getUser': 'dangerousGetUser',
                    'getSession': 'dangerousGetSession',
                    'refreshSession': 'dangerousRefreshSession',
                };

                return {
                    // Match: supabase.auth.getUser(), supabase.auth.getSession(), etc.
                    CallExpression(node) {
                        const callee = node.callee;

                        // Check for member expression like x.y.z()
                        if (callee.type === 'MemberExpression') {
                            const property = callee.property;
                            const object = callee.object;

                            // Check if property is one of the dangerous methods
                            if (property.type === 'Identifier' && DANGEROUS_METHODS[property.name]) {
                                // Check if parent object is .auth (x.auth.getUser)
                                if (object.type === 'MemberExpression' &&
                                    object.property.type === 'Identifier' &&
                                    object.property.name === 'auth') {

                                    // EXCEPTION: Allow in AvatarContext.jsx (needs onAuthStateChange which is safe)
                                    // and in authUtils.ts itself
                                    const filename = context.getFilename();
                                    if (filename.includes('AvatarContext') && property.name === 'refreshSession') {
                                        // AvatarContext uses refreshSession inside onAuthStateChange callback (safe)
                                        // Check if we're inside onAuthStateChange callback context
                                        return;
                                    }
                                    if (filename.includes('authUtils')) {
                                        // authUtils is allowed - it's the safe wrapper
                                        return;
                                    }

                                    context.report({
                                        node,
                                        messageId: DANGEROUS_METHODS[property.name],
                                    });
                                }
                            }
                        }
                    },
                };
            },
        },
    },
};
