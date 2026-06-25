# Backend Auth Smoke Test

Run these checks **after** the owner has:
1. Set `ADMIN_SECRET` in Apps Script → Project Settings → Script Properties.
2. Redeployed the web app (new version).

Set two shell variables before running:
```
URL=https://script.google.com/macros/s/<YOUR_DEPLOYMENT_ID>/exec
SECRET=<the value you set for ADMIN_SECRET>
```

---

## Checks the assistant can run post-deploy (no secret needed — rejection checks only)

### a) Admin write with no secret → `unauthorized`

```bash
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '{"action":"setContent","content":{}}' | jq .
```
**Expected:** `{"ok":false,"reason":"unauthorized"}`

### b) Sensitive read (bookings) with no secret → `unauthorized`

```bash
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '{"action":"bookings"}' | jq .
```
**Expected:** `{"ok":false,"reason":"unauthorized"}`

### c) Open GET read now closed — bookings GET → no booking data

```bash
curl -s "$URL?action=bookings" | jq .
```
**Expected:** `{"error":"Unknown action"}` (the action is removed from doGet)

---

## Checks the owner runs (require `$SECRET`)

### d) `staffLogin` with the real secret → `role: admin`

```bash
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"staffLogin\",\"code\":\"$SECRET\"}" | jq .
```
**Expected:** `{"ok":true,"role":"admin"}`

### e) Authenticated `setContent` → `ok`

```bash
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"setContent\",\"secret\":\"$SECRET\",\"content\":{}}" | jq .
```
**Expected:** `{"ok":true}` (or similar success response — not `unauthorized`)

---

## Additional spot-checks (owner)

### f) `staffLogin` with a bad code → `bad-credentials`

```bash
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '{"action":"staffLogin","code":"wrongcode"}' | jq .
```
**Expected:** `{"ok":false,"reason":"bad-credentials"}`

### g) `staffLogin` before `ADMIN_SECRET` is set → `not-configured`

Only relevant if checked before setting the Script Property. After setting it, this check is no longer applicable.

### h) Public reads still work (no secret required)

```bash
# Coaches list — no pass field in output
curl -s "$URL?action=coaches" | jq '.coaches[0] | keys'
# Expected: keys do NOT include "pass"

# Version banner
curl -s "$URL?action=version" | jq '{version, auth}'
# Expected: {"version":"db-v19","auth":true}

# Availability
curl -s "$URL?action=availability&date=$(date +%Y-%m-%d)" | jq '.date'
```

### i) Customer-owned plan lookup still works (GET with email)

```bash
curl -s "$URL?action=plans&email=test@example.com" | jq .
```
**Expected:** Returns plans for that email (or empty list), not `unauthorized`.

### j) Plans GET with no email → `unauthorized`

```bash
curl -s "$URL?action=plans" | jq .
```
**Expected:** `{"ok":false,"reason":"unauthorized"}`
