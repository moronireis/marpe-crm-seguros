// Backfill das mídias quebradas (issue #21, 17/07): mensagens com media_url do CDN
// do WhatsApp (expira + criptografado) ou nula são recuperadas via UazapiGO
// POST /message/download → persistidas no Storage → media_url atualizada.
// Irrecuperáveis: media_url=null + metadata.media_expired=true (UI mostra "expirada").
//
// Uso:  node --env-file=<env> scripts/backfill-media.mjs [--limit N] [--dry]
import { readFileSync, existsSync } from 'fs';

if (!process.env.PUBLIC_SUPABASE_URL && existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SB = process.env.PUBLIC_SUPABASE_URL;
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const UAZ = (process.env.UAZAPI_URL || '').trim();
const TOK = (process.env.UAZAPI_TOKEN || '').trim();
const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const LIMIT = parseInt((process.argv.find(a => a.startsWith('--limit')) || '').split('=')[1] || '2000');
const DRY = process.argv.includes('--dry');

const extFor = (ct) => ct.includes('jpeg') ? 'jpg' : ct.includes('png') ? 'png'
  : ct.includes('webp') ? 'webp' : ct.includes('ogg') ? 'ogg' : ct.includes('mpeg') ? 'mp3'
  : ct.includes('mp4') && ct.startsWith('audio') ? 'm4a' : ct.includes('mp4') ? 'mp4'
  : ct.includes('pdf') ? 'pdf' : 'bin';

// Coorte: CDN whatsapp.net OU nula (com wa_message_id), sem flag de expirada
const rows = [];
for (const filter of ['media_url=like.*whatsapp.net*', 'media_url=is.null']) {
  const r = await fetch(`${SB}/rest/v1/marpe_messages?select=id,contact_id,wa_message_id,metadata&content_type=in.(image,audio,video,document,sticker)&${filter}&wa_message_id=not.is.null&order=created_at.desc&limit=${LIMIT}`, { headers: h });
  rows.push(...await r.json());
}
const pending = rows.filter(m => !(m.metadata || {}).media_expired);
console.log(`Coorte: ${rows.length} mensagens, ${pending.length} a processar${DRY ? ' (DRY)' : ''}`);

let healed = 0, expired = 0, failed = 0;
for (const [i, msg] of pending.entries()) {
  if (i % 50 === 0 && i > 0) console.log(`  ...${i}/${pending.length} (ok ${healed} | exp ${expired} | err ${failed})`);
  try {
    const dl = await fetch(`${UAZ}/message/download`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', token: TOK },
      body: JSON.stringify({ id: msg.wa_message_id }),
    });
    const data = dl.ok ? await dl.json().catch(() => null) : null;

    if (!data?.fileURL) {
      expired++;
      if (!DRY) await fetch(`${SB}/rest/v1/marpe_messages?id=eq.${msg.id}`, {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ media_url: null, metadata: { ...(msg.metadata || {}), media_expired: true } }),
      });
      continue;
    }

    const fileRes = await fetch(data.fileURL);
    if (!fileRes.ok) { failed++; continue; }
    const ct = (data.mimetype || fileRes.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    const path = `${msg.contact_id}/${msg.wa_message_id}.${extFor(ct)}`;

    if (DRY) { healed++; continue; }

    // Upload com retry (RLS intermitente da Cloudfy)
    let uploaded = false;
    for (let t = 0; t < 3 && !uploaded; t++) {
      const up = await fetch(`${SB}/storage/v1/object/marpe-media/${path}`, {
        method: 'POST', headers: { ...h, 'Content-Type': ct, 'x-upsert': 'true' }, body: bytes,
      });
      uploaded = up.ok;
      if (!uploaded) await new Promise(r2 => setTimeout(r2, 300 * (t + 1)));
    }
    if (!uploaded) { failed++; continue; }

    await fetch(`${SB}/rest/v1/marpe_messages?id=eq.${msg.id}`, {
      method: 'PATCH', headers: h,
      body: JSON.stringify({ media_url: `${SB}/storage/v1/object/public/marpe-media/${path}`, media_mime: ct }),
    });
    healed++;
  } catch { failed++; }
}

console.log(`\nRESULTADO: recuperadas ${healed} | expiradas (marcadas) ${expired} | falhas ${failed}`);
