---
name: Production Auth Credentials
description: Real admin email for Marpe CRM and procedure to reset password via Supabase Admin API
type: reference
---

Production auth user: admin@marpe.com.br (UUID: af0a093a-83e6-4838-9c28-8a6457ca1b48)

The credentials admin@admin.com / admin (provided by user in initial QA brief) are INCORRECT — that user does not exist.

**Password reset procedure (Supabase Admin API):**
```bash
curl -s -X PUT "https://weirdpigeon-supabase.cloudfy.live/auth/v1/admin/users/af0a093a-83e6-4838-9c28-8a6457ca1b48" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"password":"new-password-here"}'
```

**QA session 2026-07-01:** password was reset to `qa-test-2026` for testing. Original password unknown — must be reset by Marcel (admin) after QA.

**How to apply:** Before any future QA session requiring login, confirm credentials with the client or use the Admin API to set a temp password, then restore access after testing.
