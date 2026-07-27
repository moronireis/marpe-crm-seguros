import { createServerClient } from '../supabase-server';

/**
 * Resolve as credenciais da instância WhatsApp (UazapiGO).
 *
 * Por que existe (27/07): o token vivia SÓ em `import.meta.env.UAZAPI_TOKEN`.
 * Quando a Uazapi rotacionou os tokens do servidor, a instância da Marpe morreu
 * (401 "Invalid token") e a única forma de arrumar era um deploy novo — ninguém
 * conseguia reconectar o número pela plataforma.
 *
 * Agora o token pode ficar em `marpe_settings` (chave `wa_instance`), gravado pela
 * própria tela de Configurações. A env continua valendo como padrão/fallback, então
 * nada quebra em quem já estava rodando.
 *
 * Precedência: marpe_settings.wa_instance.token → UAZAPI_TOKEN (env).
 */

export const WA_INSTANCE_KEY = 'wa_instance';

export interface WaInstance {
  url: string;
  token: string;
  /** nome da instância no painel da Uazapi (só quando veio do banco) */
  name: string | null;
  /** de onde saiu o token — a tela mostra isso para o admin não se perder */
  source: 'settings' | 'env' | 'none';
}

// Cache curto de módulo: uma lambda quente atende várias mensagens em sequência e
// não faz sentido bater no banco em toda mensagem. 30s é suficiente para a troca
// de token refletir rápido sem custo por request.
let cache: { value: WaInstance; at: number } | null = null;
const TTL_MS = 30_000;

export function uazapiUrl(): string {
  // 27/07: a env do Vercel veio com um "\n" LITERAL no fim em outro projeto nosso —
  // e `\n` literal é `\` + `n`, que o .trim() não remove. Com a URL torta toda
  // chamada vira 405 Method Not Allowed e o diagnóstico despista. Limpa de vez.
  const raw = (import.meta.env.UAZAPI_URL || 'https://u4digital.uazapi.com');
  return String(raw).replace(/\\[rn]/g, '').trim().replace(/\/+$/, '');
}

/** Invalida o cache — chamar depois de gravar um token novo. */
export function clearInstanceCache() {
  cache = null;
}

export async function getInstance(): Promise<WaInstance> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const url = uazapiUrl();
  const envToken = (import.meta.env.UAZAPI_TOKEN || '').trim();
  let value: WaInstance = {
    url,
    token: envToken,
    name: null,
    source: envToken ? 'env' : 'none',
  };

  try {
    const sb = createServerClient();
    const { data } = await sb
      .from('marpe_settings')
      .select('value')
      .eq('key', WA_INSTANCE_KEY)
      .maybeSingle();

    const saved = (data?.value || {}) as { token?: string; name?: string };
    if (saved.token?.trim()) {
      value = { url, token: saved.token.trim(), name: saved.name || null, source: 'settings' };
    }
  } catch {
    // Banco indisponível: segue com a env. Melhor degradar do que derrubar o envio.
  }

  cache = { value, at: Date.now() };
  return value;
}

/** Atalho para quem só precisa do token. */
export async function getInstanceToken(): Promise<string> {
  return (await getInstance()).token;
}

/**
 * Consulta o status real da instância na Uazapi.
 * A Uazapi aceita o token por header OU query; usamos header (é o que as outras
 * plataformas nossas usam e o que funciona com token de instância).
 */
export async function fetchInstanceStatus(token: string): Promise<{
  ok: boolean;
  httpStatus: number;
  connected: boolean;
  phone: string | null;
  name: string | null;
  profilePic: string | null;
  message: string | null;
}> {
  try {
    const res = await fetch(`${uazapiUrl()}/instance/status`, {
      headers: { token },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => ({} as any));
    const live = body?.instance ?? body;
    return {
      ok: res.ok,
      httpStatus: res.status,
      connected: live?.status === 'connected',
      phone: live?.phoneNumber ?? live?.phone ?? (live?.owner || '').split('@')[0] ?? null,
      name: live?.profileName ?? null,
      profilePic: live?.profilePicUrl ?? null,
      message: body?.message ?? null,
    };
  } catch (e: any) {
    return { ok: false, httpStatus: 0, connected: false, phone: null, name: null, profilePic: null, message: e?.message || 'sem resposta' };
  }
}
