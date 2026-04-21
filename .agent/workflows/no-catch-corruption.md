# No Catch-Block Corruption

**MANDATORY for all agents performing automated refactoring, error-handling updates, or promise rejection handling.**

## Background

On April 21, 2026, an automated refactoring agent introduced systemic syntax corruption across 20+ files by collapsing `try/catch` blocks into single lines. This caused **17 consecutive failed Vercel deployments** and required hours of manual remediation.

## Prohibited Patterns

### ❌ NEVER collapse a catch block that contains logic

```javascript
// CORRUPTED — the return statement is orphaned outside the catch
} catch (e) { console.warn('error:', e); }
    return res.status(500).json({ error: e.message });
} finally {
```

### ❌ NEVER leave orphaned code after a collapsed catch

```javascript
// CORRUPTED — '= await getSupabase()' is orphaned after the catch closes
} catch (_joinErr) { console.warn('error:', _joinErr); } = await getSupabase()
    .from('table')
    .select('*');
```

### ❌ NEVER merge two separate promise chains into one

```javascript
// CORRUPTED — two separate RPC calls merged into one broken chain
getSupabase().rpc('increment_views', { id: data.id })
    .then(() => {})
    .catch(e => { console.warn(e); })
            .eq('id', data.id)
            .then(() => {})
            .catch(e => console.warn(e));
    });
```

## Correct Patterns

### ✅ Multi-line catch with logic

```javascript
} catch (e) {
    console.warn('[component] Query error:', e?.message || e);
    return res.status(500).json({ success: false, error: e.message });
} finally {
    // cleanup
}
```

### ✅ Catch with fallback query

```javascript
} catch (_joinErr) {
    console.warn('[component] FK join failed, falling back:', _joinErr?.message);
    const { data, error } = await getSupabase()
        .from('table')
        .select('id, name');
    if (error) throw error;
}
```

### ✅ One-liner catch ONLY when there's no logic to preserve

```javascript
// OK — this catch truly has no logic beyond the warning
} catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
```

## Rules for Agents

1. **NEVER refactor catch blocks into one-liners** if they contain:
   - `return` statements
   - Variable assignments (`const { data } = ...`)
   - Fallback queries
   - Re-throws (`throw e`)
   - `finally` blocks after them

2. **ALWAYS verify syntax** after modifying try/catch blocks:
   ```bash
   node -c path/to/file.js
   ```

3. **ALWAYS check that brace depth is balanced** after any automated edit to a file containing try/catch blocks.

4. The pre-push hook (CHECK 5 + CHECK 9) will catch these, but agents should self-validate BEFORE committing.

## Detection Commands

```bash
# Find collapsed catches with orphaned assignments
grep -rn 'catch.*console\.warn.*} = await' --include='*.js' --include='*.jsx'

# Find collapsed catches with stray semicolons
grep -rn 'catch.*console\.warn.*};$' --include='*.js' --include='*.jsx'

# Verify all .js files parse correctly
find pages/ src/ -name '*.js' -exec node -c {} \;
```
