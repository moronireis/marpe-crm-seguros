---
name: Marpe CRM Project Patterns
description: Stack, page scaffolding, CSS tokens, auth pattern, API conventions for marpe-crm-seguros
type: project
---

## Stack
- Astro (SSR, prerender: false on every page/API), React islands via client:load
- Tailwind CSS (utility classes used sparingly — mostly inline styles for components)
- Supabase via createServerClient() from src/lib/supabase-server
- Auth via requireAuth(locals) in API routes; middleware handles session/refresh automatically
- Build: `npm run build` → astro build → @astrojs/vercel adapter

## Page Pattern (Astro)
Every page is 4 lines:
```astro
---
import AppLayout from '../layouts/AppLayout.astro';
import SomeView from '../components/section/SomeView.tsx';
export const prerender = false;
---
<AppLayout title="Page Title" activeSection="section-id">
  <SomeView client:load />
</AppLayout>
```
activeSection values: 'inbox' | 'crm' | 'dashboard' | 'campanhas' | 'automacoes' | 'links' | 'config'

## Dynamic page routes
Nested directories: src/pages/contato/[id].astro → /contato/:id
Params available as Astro.params.id in frontmatter, passed as props to client component.

## CSS Design Tokens (global.css)
- --bg-primary: #060608, --bg-secondary: #0a0a10, --bg-card: #0f0f18
- --border: #1a1a2a, --border-accent: #242440
- --text-primary: #e8e8f0, --text-secondary: #7a7a96, --text-muted: #4a4a64
- --accent: #3B82F6, --accent-light: #60A5FA, --accent-dim: rgba(59,130,246,0.12)
- --green: #22c55e, --red: #ef4444, --amber: #f59e0b, --purple: #8b5cf6, --cyan: #06b6d4
- --sidebar-width: 56px
- Scrollbar: 4px, transparent track, --border thumb

## API Route Convention
All routes: import requireAuth + createServerClient. Check auth first, then operate.
PATCH allowed fields are whitelisted explicitly. Always return JSON with { data } or { error }.
Supabase joins use select() string syntax with nested table names in backtick blocks.

## Component inline-style convention
Components use inline styles almost exclusively (not Tailwind classes).
Style objects defined as `const s: Record<string, React.CSSProperties>` for reused styles.
Tab patterns use a function: `tab: (active: boolean) => ({ ... })`.

## Tables in DB (confirmed used)
marpe_contacts (tags: text[]), marpe_deals, marpe_funnel_stages, marpe_funnels,
marpe_deal_activities, marpe_messages (is_from_automation: bool, direction: inbound|outbound),
marpe_profiles, marpe_surveys, marpe_settings (key-value, added by migration-chatbot.sql)

## Settings store (marpe_settings)
Generic key-value table: { key: text PK, value: jsonb, updated_at: timestamptz }
Access via: sb.from('marpe_settings').select('value').eq('key', 'chatbot').maybeSingle()
Upsert via: sb.from('marpe_settings').upsert({ key, value, updated_at })
API: GET/PATCH /api/admin/chatbot-config

## Mobile Responsive Pattern
Components use `window.matchMedia('(max-width: 768px)')` with addEventListener for live breakpoint detection.
Pattern: `const [isMobile, setIsMobile] = useState(false)` + useEffect with mq.addEventListener('change', handler).
AppLayout.astro sidebar: hidden by default on mobile, slides in via `transform: translateX(-100%)` → `.open` class.
Hamburger button: `position: fixed; top: 10px; left: 10px; z-index: 200` — only visible at `@media (max-width: 768px)`.
Overlay div (#sidebar-overlay) catches outside clicks to close sidebar.
Main content on mobile: `display: block` (not flex) + `padding-top: 58px` for hamburger button clearance.
DealPanel mobile: `position: fixed; inset: 0; z-index: 150` (full-screen overlay instead of side panel).
InboxView mobile: `showList = !isMobile || !activeContactId` — list XOR chat (never both).
Back button in chat header on mobile — `setActiveContactId(null)` to return to list.

## WhatsApp QR Connection (polling pattern)
- API: GET /api/admin/whatsapp-qr → proxies UazapiGO /instance/qrcode?token=TOKEN
- POST /api/admin/whatsapp-qr { action: 'logout'|'restart' } → proxies /instance/logout or /restart
- Auth: requireAdmin (not requireAuth) — admin-only operations
- QR response normalization: handles raw base64, data URL prefix, image/Content-Type, nested data.qrcode/base64/pairingCode
- UI pattern: QrPhase state machine (idle→loading→showing→connected|error), 3 refs for poll/qrRefresh/countdown
- Polling: setInterval 3s on /whatsapp-status, stops when connected. QR auto-refresh every 28s.
- QR display requires white background (#ffffff) wrapper — QR codes don't scan on dark bg
- Countdown: color-coded green/amber/red, expires at 0 → error phase

## Chatbot (webhook pattern)
- is_from_automation=true on sendWhatsAppText opts → chatbot-sent messages
- Human takeover: if outbound message with is_from_automation=false exists in last 1h → skip
- Rate limit: if ANY outbound in last 24h → skip greeting
- Menu reply: check lastOutbound.is_from_automation=true before treating "1-5" as menu choice
- Tags added to contacts: 'auto_atendido' on greeting, plus interest tag on menu reply
- handleChatbot() takes SupabaseClient typed as SupabaseClient from @supabase/supabase-js
