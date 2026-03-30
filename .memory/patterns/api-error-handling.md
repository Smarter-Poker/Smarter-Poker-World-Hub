# Pattern: API Error Handling

**Type:** Code Pattern
**Used In:** All API route handlers

## The Pattern

```javascript
export default async function handler(req, res) {
  try {
    // Rate limiting for mutative methods
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    // Method check
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Business logic here...
    try {
      // Inner try for business-specific errors
      // ...
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('[EndpointName] Error:', error.message || error);
      return res.status(500).json({ success: false, error: 'Human-readable error message' });
    }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }
}
```

## Key Elements

1. **Outer try/catch**: Catches unexpected errors (import failures, middleware crashes)
2. **Rate limiting**: Applied to mutative methods via `applyRateLimit` from `src/lib/apiRateLimit`
3. **Method check**: Early return for wrong HTTP method
4. **Inner try/catch**: Business logic with domain-specific error messages
5. **`res.headersSent` guard**: Prevents double-response crashes
6. **Consistent response shape**: Always `{ success: boolean, error?: string, ...data }`
7. **Console.error with tag**: `[EndpointName]` prefix for log filtering

## Anti-Patterns to Avoid

- Never let errors bubble unhandled (causes Vercel function crash)
- Never use `.single()` when row might not exist — use `.maybeSingle()`
- Never return raw error objects to client (information leakage)
