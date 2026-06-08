import { createServerClient } from '../supabase-server';
import { listClientes, getCliente, listDocumentos, listNegociosAndamento, listRamos, listProdutores } from './client';

function formatPhone(ddd: number | null, numero: string | null): string | null {
  if (!numero) return null;
  const clean = String(numero).replace(/\D/g, '');
  if (!clean) return null;
  const prefix = ddd ? String(ddd) : '55';
  return `(${prefix}) ${clean}`;
}

function parseCorpDate(d: string | null): string | null {
  if (!d) return null;
  const parts = d.split('/');
  if (parts.length !== 3) return null;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export interface SyncResult {
  type: string;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function syncClientes(): Promise<SyncResult> {
  const sb = createServerClient();
  const result: SyncResult = { type: 'contacts', created: 0, updated: 0, skipped: 0, errors: [] };

  const { clientes } = await listClientes('');

  // Load ALL corp_sync contacts (paginated — Supabase default limit is 1000)
  const existingMap = new Map<string, string>();
  let page = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: rows } = await sb
      .from('marpe_contacts')
      .select('id, corp_id')
      .eq('source', 'corp_sync')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    for (const r of (rows || [])) existingMap.set(r.corp_id, r.id);
    if (!rows || rows.length < PAGE_SIZE) break;
    page++;
  }

  // Separate into existing (bulk update) and new (fetch detail + insert)
  const toUpdate: Array<{ id: string; name: string; phone: string | null; corp_id: string }> = [];
  const toInsert: typeof clientes = [];

  for (const c of clientes) {
    if (!c.nome || !c.nome.trim()) { result.skipped++; continue; }
    const corpId = String(c.codigo);
    if (existingMap.has(corpId)) {
      toUpdate.push({ id: existingMap.get(corpId)!, name: c.nome, phone: formatPhone(c.ddd, c.numero), corp_id: corpId });
    } else {
      toInsert.push(c);
    }
  }

  // Bulk-update existing in batches of 50 (parallel within batch)
  const BATCH = 50;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const batch = toUpdate.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(u => sb.from('marpe_contacts').update({ name: u.name, phone: u.phone }).eq('id', u.id))
    );
    for (const r of results) {
      if (r.error) result.errors.push(`Update: ${r.error.message}`);
      else result.updated++;
    }
  }

  // Insert new with detail (sequential — typically few new per day)
  for (const c of toInsert) {
    const phone = formatPhone(c.ddd, c.numero);
    const corpId = String(c.codigo);
    let detail;
    try { detail = await getCliente(c.codigo); } catch { result.skipped++; continue; }
    if (!detail) { result.skipped++; continue; }

    const { error } = await sb.from('marpe_contacts').insert({
      name: detail.nome,
      cpf_cnpj: detail.cpf_cnpj || null,
      email: detail.email || null,
      phone,
      city: detail.cidade || null,
      state: detail.estado || 'RS',
      birth_date: parseCorpDate(detail.datanas),
      profession: detail.profissao || null,
      marital_status: detail.estado_civil || null,
      corp_id: corpId,
      source: 'corp_sync',
      address: detail.enderecos?.[0] ? `${detail.enderecos[0].logradouro}, ${detail.enderecos[0].numero}` : null,
    });
    if (error) result.errors.push(`Insert ${c.codigo}: ${error.message}`);
    else result.created++;
  }

  return result;
}

export async function syncDocumentos(datini: string, datfim: string): Promise<SyncResult> {
  const sb = createServerClient();
  const result: SyncResult = { type: 'documents', created: 0, updated: 0, skipped: 0, errors: [] };

  const vendasFunnel = await sb.from('marpe_funnels').select('id').eq('name', 'Vendas').maybeSingle();
  if (!vendasFunnel.data?.id) { result.errors.push('Funnel Vendas not found'); return result; }

  const emitidoStage = await sb.from('marpe_funnel_stages').select('id')
    .eq('funnel_id', vendasFunnel.data.id).eq('name', 'Emitido').maybeSingle();
  if (!emitidoStage.data?.id) { result.errors.push('Stage Emitido not found'); return result; }

  let pag = 1;
  let total = 0;
  do {
    const { count, documentos } = await listDocumentos({ datini, datfim, pag, qtd_pag: 100 });
    total = count;

    for (const doc of documentos) {
      const corpDealId = `doc_${doc.codfil}_${doc.nosnum}`;
      const existing = await sb.from('marpe_deals').select('id').eq('corp_id', corpDealId).maybeSingle();

      const contact = await sb.from('marpe_contacts').select('id').eq('corp_id', String(doc.cliente_codigo)).maybeSingle();
      if (!contact.data?.id) { result.skipped++; continue; }

      const dealData = {
        contact_id: contact.data.id,
        funnel_id: vendasFunnel.data.id,
        stage_id: emitidoStage.data.id,
        title: `${doc.ramo} — ${doc.cliente}`,
        ramo: doc.ramo?.toLowerCase() || null,
        seguradora: doc.seguradora || null,
        apolice: doc.numapo || null,
        vigencia_inicio: parseCorpDate(doc.inivig),
        vigencia_fim: parseCorpDate(doc.fimvig),
        deal_type: 'prospeccao',
        corp_id: corpDealId,
      };

      if (existing.data?.id) {
        const { error } = await sb.from('marpe_deals').update(dealData).eq('id', existing.data.id);
        if (error) result.errors.push(`Update doc ${doc.nosnum}: ${error.message}`);
        else result.updated++;
      } else {
        const { error } = await sb.from('marpe_deals').insert(dealData);
        if (error) result.errors.push(`Insert doc ${doc.nosnum}: ${error.message}`);
        else result.created++;
      }
    }

    pag++;
  } while ((pag - 1) * 100 < total);

  return result;
}

export async function syncNegocios(): Promise<SyncResult> {
  const sb = createServerClient();
  const result: SyncResult = { type: 'negocios', created: 0, updated: 0, skipped: 0, errors: [] };

  const vendasFunnel = await sb.from('marpe_funnels').select('id').eq('name', 'Vendas').maybeSingle();
  if (!vendasFunnel.data?.id) { result.errors.push('Funnel Vendas not found'); return result; }

  const stages = await sb.from('marpe_funnel_stages').select('id, name, sort_order')
    .eq('funnel_id', vendasFunnel.data.id).order('sort_order');
  const prospeccaoStage = stages.data?.find(s => s.name === 'Prospecção');
  if (!prospeccaoStage) { result.errors.push('Stage Prospecção not found'); return result; }

  let pag = 1;
  let total = 0;
  do {
    const { count, negocios } = await listNegociosAndamento({ pag, qtd_pag: 100 });
    total = count;

    for (const neg of negocios) {
      const corpNegId = `neg_${neg.codfil}_${neg.codigo}`;
      const existing = await sb.from('marpe_deals').select('id').eq('corp_id', corpNegId).maybeSingle();

      const contact = await sb.from('marpe_contacts').select('id').eq('corp_id', String(neg.codcli)).maybeSingle();
      if (!contact.data?.id) { result.skipped++; continue; }

      const dealData = {
        contact_id: contact.data.id,
        funnel_id: vendasFunnel.data.id,
        stage_id: prospeccaoStage.id,
        title: `${neg.ramo || 'Negócio'} — ${neg.cliente}`,
        ramo: neg.ramo?.toLowerCase() || null,
        premio: neg.val_premio || null,
        comissao_valor: neg.val_c || null,
        deal_type: neg.tipo_neg?.toLowerCase()?.includes('renova') ? 'renovacao' : 'prospeccao',
        corp_id: corpNegId,
      };

      if (existing.data?.id) {
        const { error } = await sb.from('marpe_deals').update(dealData).eq('id', existing.data.id);
        if (error) result.errors.push(`Update neg ${neg.codigo}: ${error.message}`);
        else result.updated++;
      } else {
        const { error } = await sb.from('marpe_deals').insert(dealData);
        if (error) result.errors.push(`Insert neg ${neg.codigo}: ${error.message}`);
        else result.created++;
      }
    }

    pag++;
  } while ((pag - 1) * 100 < total);

  return result;
}

function todayStr(): string {
  return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function syncAll(): Promise<SyncResult[]> {
  const sb = createServerClient();
  const startedAt = new Date().toISOString();
  const results: SyncResult[] = [];

  // Sync window: last 60 days → today
  const datini = daysAgoStr(60);
  const datfim = todayStr();

  results.push(await syncClientes());
  results.push(await syncDocumentos(datini, datfim));
  results.push(await syncNegocios());

  // Log to marpe_corp_sync_log
  for (const r of results) {
    await sb.from('marpe_corp_sync_log').insert({
      sync_type: r.type,
      status: r.errors.length ? 'partial' : 'success',
      records_created: r.created,
      records_updated: r.updated,
      records_skipped: r.skipped,
      error_message: r.errors.length ? r.errors.slice(0, 5).join('; ') : null,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });
  }

  return results;
}
