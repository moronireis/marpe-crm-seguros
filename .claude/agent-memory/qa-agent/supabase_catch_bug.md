---
name: Supabase Builder .catch() Bug
description: Supabase JS v2 builder does not implement .catch() as a standard Promise — causes 500 on all write endpoints
type: feedback
---

Supabase JS v2 query builder does NOT implement `.catch()` as a standard Promise method.

Code like this crashes the Vercel serverless function:
```ts
await supabase.from('table').insert({...}).catch(() => {})
```

**Why:** The builder chain throws an unhandled exception when `.catch()` is called, which Vercel surfaces as HTTP 500 with an empty body. The primary operation (insert/update/delete) executes BEFORE the crash, so data IS persisted — the 500 is a response-serialization failure.

**How to apply:** Any time a POST/PATCH/DELETE endpoint returns 500 with empty body but data appears saved in DB — check for `.catch()` on Supabase builder calls. The fix is `.then(null, () => {})` or wrapping in try/catch with `const { error } = await supabase...`.

Known-fixed locations: webhook (commit ada5876).
Still broken as of 2026-07-01: src/pages/api/deals/[id].ts, src/pages/api/deals/[id]/notes.ts, src/pages/api/deals/[id]/documents.ts.
