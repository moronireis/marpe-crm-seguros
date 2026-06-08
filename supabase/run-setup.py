#!/usr/bin/env python3
"""Execute setup-completo.sql against Supabase pg/query endpoint."""
import urllib.request, json, ssl, sys, os

ctx = ssl.create_default_context()
base = 'https://weirdpigeon-supabase.cloudfy.live'
key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzM3Njg1MTYsImV4cCI6MTgwNTMwNDUxNn0.Hziwx8ocWnFVLHvt5DhT8nTkL2XVMa58ofjL-0hCMxw'

def run_sql(sql):
    data = json.dumps({'query': sql}).encode()
    req = urllib.request.Request(f'{base}/pg/query', data=data, headers={
        'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'
    })
    try:
        resp = urllib.request.urlopen(req, context=ctx)
        return True, resp.read().decode()[:200]
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        return False, f'{e.code}: {body}'

# Read SQL file
sql_path = os.path.join(os.path.dirname(__file__), 'setup-completo.sql')
with open(sql_path) as f:
    full_sql = f.read()

# Split by semicolons and execute one statement at a time
# (WAF may block large payloads)
statements = []
current = []
for line in full_sql.split('\n'):
    stripped = line.strip()
    if stripped.startswith('--'):
        continue
    current.append(line)
    if stripped.endswith(';'):
        stmt = '\n'.join(current).strip()
        if stmt and stmt != ';':
            statements.append(stmt)
        current = []

# Handle remaining
if current:
    stmt = '\n'.join(current).strip()
    if stmt:
        statements.append(stmt)

print(f'Found {len(statements)} statements to execute')
ok_count = 0
err_count = 0

for i, stmt in enumerate(statements):
    # Skip empty
    if not stmt.strip() or stmt.strip() == ';':
        continue
    success, result = run_sql(stmt)
    label = stmt[:60].replace('\n', ' ')
    if success:
        ok_count += 1
        print(f'  [{i+1}/{len(statements)}] OK: {label}...')
    else:
        err_count += 1
        print(f'  [{i+1}/{len(statements)}] ERR: {label}...')
        print(f'    -> {result}')

print(f'\nDone: {ok_count} OK, {err_count} errors')

# Now set admin role
print('\nSetting admin role...')
ok, res = run_sql("UPDATE public.marpe_profiles SET role = 'admin', full_name = 'Admin' WHERE email = 'admin@marpe.com.br'")
print(f'  Admin role: {"OK" if ok else "ERR"} {res}')
