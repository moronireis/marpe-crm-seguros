import type { CorpLoginResponse, CorpCliente, CorpClienteDetail, CorpDocumento, CorpNegocio, CorpNegocioDetail, CorpRamo, CorpProdutor, CorpSeguradora, CorpAgente, CorpProfissao, CorpAnexo } from './types';

const CORP_URL = import.meta.env.CORP_API_URL || 'https://api.corpnuvem.com';
const CORP_EMAIL = import.meta.env.CORP_API_EMAIL || '';
const CORP_PASSWORD = import.meta.env.CORP_API_PASSWORD || '';
const CODFIL = 1;

let _token: string | null = null;
let _tokenExpiry: number = 0;

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry) return _token;

  // S0 (22/07): o /login da Corp oscila (500 intermitente desde 21/07) — 3 tentativas
  // com backoff antes de desistir, para o sync não morrer numa falha passageira.
  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${CORP_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: CORP_EMAIL, senha: CORP_PASSWORD, aplicacao: 0 }),
    }).catch((e: any) => ({ ok: false, status: 0, json: async () => ({ message: String(e?.message || e) }) } as Response));

    if (res.ok) {
      const data = await res.json() as CorpLoginResponse;
      _token = data.token;
      // Token expires in 3 days per API, refresh after 2 days
      _tokenExpiry = Date.now() + 2 * 24 * 60 * 60 * 1000;
      return _token;
    }
    const err = await res.json().catch(() => ({}));
    lastErr = String((err as any).message || res.status);
    if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
  }
  throw new Error(`Corp login failed: ${lastErr}`);
}

async function corpFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getToken();
  const url = new URL(`${CORP_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    headers: { 'Authorization': token, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Corp API ${path} failed: ${(err as any).message || res.status}`);
  }

  return res.json() as Promise<T>;
}

// ===== CLIENTES =====

export async function listClientes(texto = ''): Promise<{ count: number; clientes: CorpCliente[] }> {
  const data = await corpFetch<{ header: { count: number }; clientes: CorpCliente[] }>('/lista_clientes', { texto });
  return { count: data.header.count, clientes: data.clientes || [] };
}

export async function getCliente(codigo: number): Promise<CorpClienteDetail | null> {
  const data = await corpFetch<{ header: { count: number }; cliente: CorpClienteDetail[] }>('/cliente', {
    codfil: String(CODFIL), codigo: String(codigo),
  });
  return data.cliente?.[0] || null;
}

// ===== DOCUMENTOS / POLICES =====

export async function listDocumentos(opts: {
  datini: string; datfim: string; pag?: number; qtd_pag?: number;
}): Promise<{ count: number; documentos: CorpDocumento[] }> {
  const data = await corpFetch<{ header: { count: number }; documentos: CorpDocumento[] }>('/documentos', {
    ordem: 'nosnum', qtd_pag: String(opts.qtd_pag || 100), pag: String(opts.pag || 1),
    periodo: 'datinc', datini: opts.datini, datfim: opts.datfim, codfil: String(CODFIL),
  });
  return { count: data.header?.count || 0, documentos: data.documentos || [] };
}

export async function getDocumento(nosnum: number): Promise<any> {
  return corpFetch('/documento', { codfil: String(CODFIL), nosnum: String(nosnum) });
}

// ===== RENOVACOES =====

export async function listRenovacoes(opts: {
  dt_ini: string; dt_fim: string; pag?: number; qtd_pag?: number;
}): Promise<{ count: number; renovacoes: any[] }> {
  const data = await corpFetch<any>('/renovacoes', {
    dt_ini: opts.dt_ini, dt_fim: opts.dt_fim, qtd_pag: String(opts.qtd_pag || 100),
    pag: String(opts.pag || 1), ordem: 'nosnum', orientacao: 'asc', texto: '',
    cancelado: 'F', resgates: 'F',
  });
  return { count: data.header?.count || 0, renovacoes: data.renovacoes || [] };
}

// ===== NEGOCIOS =====

export async function listNegociosAndamento(opts?: {
  pag?: number; qtd_pag?: number; texto?: string;
}): Promise<{ count: number; negocios: CorpNegocio[] }> {
  const data = await corpFetch<any>('/negocios_andamento', {
    dtini: '', dtfim: '', texto: opts?.texto || '',
    qtd_pag: String(opts?.qtd_pag || 100), pag: String(opts?.pag || 1),
    ordem: 'codigo', orientacao: 'desc', status: 'all', calculo: 't',
  });
  return { count: data.header?.count || 0, negocios: data.negocios || data.negocios_andamento || [] };
}

// Retorna null quando o Corp responde 404 "Nenhum negócio encontrado." (probe 15/07:
// mesma resposta para código inexistente e para negócio DELETADO — é a confirmação
// de exclusão usada pela reconciliação). Qualquer outro erro (401/5xx/rede) propaga:
// erro transitório NUNCA pode ser lido como "negócio não existe".
export async function getNegocio(codigo: number): Promise<CorpNegocioDetail | null> {
  try {
    const data = await corpFetch<{ header: { count: number }; negocio: CorpNegocioDetail[] }>('/negocio', {
      codfil: String(CODFIL), codigo: String(codigo),
    });
    return data.negocio?.[0] || null;
  } catch (e) {
    if (String(e).includes('Nenhum negócio encontrado')) return null;
    throw e;
  }
}

// ===== ANEXOS =====
// GET-only no Corp (OPTIONS: GET apenas — não há upload via API).
// As URLs retornadas são S3 pré-assinadas e expiram: buscar na hora do uso, nunca persistir.
// Sem anexos o Corp responde 404 {"message":"Nenhum anexo encontrado..."} — tratado como lista vazia.

export async function getClienteAnexos(codigo: number): Promise<CorpAnexo[]> {
  try {
    const data = await corpFetch<{ header: { count: number }; anexos: CorpAnexo[] }>('/cliente_anexos', {
      codfil: String(CODFIL), codigo: String(codigo),
    });
    return data.anexos || [];
  } catch (e) {
    if (String(e).includes('Nenhum anexo')) return [];
    throw e;
  }
}

export async function getNegocioAnexos(codigo: number): Promise<CorpAnexo[]> {
  try {
    // #36 (23/07): a resposta vem na chave "negocio_anexos" (não "anexos" como no
    // /cliente_anexos) — o E2E de 09/07 só cobriu negócio SEM anexos (404) e o
    // parse errado passou despercebido: a aba mostrava "parte não pôde ser carregada"
    const data = await corpFetch<{ header: { count: number }; negocio_anexos?: CorpAnexo[]; anexos?: CorpAnexo[] }>('/negocio_anexos', {
      codfil: String(CODFIL), codigo: String(codigo),
    });
    return data.negocio_anexos || data.anexos || [];
  } catch (e) {
    if (String(e).includes('Nenhum anexo')) return [];
    throw e;
  }
}

// ===== SINISTROS =====

export interface CorpSinistro {
  codfil: number; nosnum: number; tipo: string | null; cia: string | null;
  ramo: string | null; codigo: number; numapo: string | null; numend: string | null;
  item: number; valavi: number | null; valind: number | null; segurado: string | null;
  numsin: string | null; datavi: string | null; datoco: string | null; datenc: string | null;
  situacao: string | null; placa: string | null; franquia: number | null;
  responsavel: string | null; oficina: string | null; tipo_atendimento: string | null;
  descricao: string | null; observacoes: string | null; proxima_agenda: string | null;
  agendamento: string | null;
}

// situacao='a' é o único valor validado (probe 17/07: 'p' → 404); sem sinistros
// no período o Corp também responde 404 — tratado como lista vazia.
export async function listSinistros(opts: {
  data_inicial: string; data_final: string;
}): Promise<{ sinistros: CorpSinistro[] }> {
  try {
    const data = await corpFetch<any>('/sinistros', {
      tipo_sinistro: 'a', data_inicial: opts.data_inicial, data_final: opts.data_final,
      tipo_data: 'oco', situacao: 'a', qtd_pag: '100', pagina: '1',
    });
    return { sinistros: data.sinistros || [] };
  } catch (e) {
    if (String(e).includes('404') || String(e).toLowerCase().includes('nenhum')) return { sinistros: [] };
    throw e;
  }
}

// ===== RAMOS =====

export async function listRamos(): Promise<CorpRamo[]> {
  const data = await corpFetch<{ header: { count: number }; ramos: CorpRamo[] }>('/ramos');
  return data.ramos || [];
}

// ===== PRODUTORES =====

export async function listProdutores(): Promise<CorpProdutor[]> {
  const data = await corpFetch<{ header: { count: number }; produtores: CorpProdutor[] }>('/produtores', {
    texto: '', codage: '1',
  });
  return data.produtores || [];
}

// ===== SEGURADORAS =====

export async function listSeguradoras(): Promise<CorpSeguradora[]> {
  const data = await corpFetch<{ header: { count: number }; seguradoras: CorpSeguradora[] }>('/seguradoras', {
    codfil: String(CODFIL),
  });
  return data.seguradoras || [];
}

// ===== AGENTES =====

export async function listAgentes(): Promise<CorpAgente[]> {
  const data = await corpFetch<{ header: { count: number }; agentes: CorpAgente[] }>('/agentes', {
    codfil: String(CODFIL),
  });
  return data.agentes || [];
}

// ===== PROFISSOES =====

export async function listProfissoes(): Promise<CorpProfissao[]> {
  const data = await corpFetch<{ header: { count: number }; profissoes: CorpProfissao[] }>('/profissoes', {
    codfil: String(CODFIL),
  });
  return data.profissoes || [];
}

// ===== WRITE OPERATIONS =====
// Payload shapes discovered 2026-07-08 via disposable-record tests (POST → GET → DELETE).
// The validator rejects unknown fields, so only send keys listed here.

async function corpWrite<T>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: Record<string, any>): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${CORP_URL}${path}`, {
    method,
    headers: { 'Authorization': token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Corp ${method} ${path} failed: ${(err as any).message || res.status}`);
  }
  return res.json() as Promise<T>;
}

// POST /cliente persists ONLY: nome, pessoa, cpf_cnpj, datanas, sexo.
// Email/telefone/endereço have their own sub-resource endpoints; observacoes and
// estado_civil return 500 on POST (Corp-side limitation).
export async function createCliente(data: {
  nome: string; pessoa?: 'F' | 'J'; cpf_cnpj?: string; datanas?: string; sexo?: string;
}): Promise<number> {
  const body: Record<string, any> = { nome: data.nome };
  if (data.pessoa) body.pessoa = data.pessoa;
  if (data.cpf_cnpj) body.cpf_cnpj = data.cpf_cnpj;
  if (data.datanas) body.datanas = data.datanas; // accepts dd/mm/yyyy and yyyy-mm-dd
  if (data.sexo) body.sexo = data.sexo;
  const res = await corpWrite<{ codigo: number }>('/cliente', 'POST', body);
  return res.codigo;
}

export async function deleteCliente(codigo: number): Promise<void> {
  await corpWrite(`/cliente?codfil=${CODFIL}&codigo=${codigo}`, 'DELETE');
}

// tipo 'R' = Residencial (dropdown padrão do Corp); padrao 'T' marca como principal
export async function createTelefone(opts: {
  codcli: number; ddd: number; numero: string; tipo?: string; padrao?: 'T' | 'F';
}): Promise<void> {
  await corpWrite('/telefone', 'POST', {
    padrao: opts.padrao || 'T', codcli: opts.codcli, tipo: opts.tipo || 'R',
    ddd: opts.ddd, numero: opts.numero,
  });
}

export async function createEndereco(opts: {
  codcli: number; cep?: string; logradouro?: string; numero?: number; complemento?: string;
  bairro?: string; cidade?: string; estado?: string; tipo?: string; padrao?: 'T' | 'F';
}): Promise<void> {
  const body: Record<string, any> = { padrao: opts.padrao || 'T', codcli: opts.codcli, tipo: opts.tipo || 'R' };
  if (opts.cep) body.cep = opts.cep;
  if (opts.logradouro) body.logradouro = opts.logradouro;
  if (opts.numero != null) body.numero = opts.numero;
  if (opts.complemento) body.complemento = opts.complemento;
  if (opts.bairro) body.bairro = opts.bairro;
  if (opts.cidade) body.cidade = opts.cidade;
  if (opts.estado) body.estado = opts.estado;
  await corpWrite('/endereco', 'POST', body);
}

export async function createEmail(opts: { codcli: number; email: string; padrao?: 'T' | 'F' }): Promise<void> {
  await corpWrite('/email', 'POST', { padrao: opts.padrao || 'T', codcli: opts.codcli, email: opts.email });
}

// POST /negocio: field names match the GET response (garbage fields → generic 500,
// these names → "Negócio não inserido"), but the insert itself fails Corp-side for
// every payload — including exact mirrors of records created in the Corp UI.
// Awaiting Agia's payload spec. Callers gate this behind the marpe_settings key
// corp_write_negocio ({ enabled: false } until Agia answers).
// Campos obrigatórios descobertos por bissecção 2026-07-09 (doc oficial Postman
// documenter.getpostman.com/view/33455116/2sAYkBrLmi): sem etapa/status/prioridade/
// datinc/datalt/campo_base_r o Corp responde 500 "Negócio não inserido".
// Resposta de sucesso: 201 { message: "Negócio inserido.", codigo_negocio }.
export async function createNegocio(payload: Record<string, any>): Promise<number> {
  const brt = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }); // "09/07/2026, 16:33"
  const [datalt, hora] = brt.split(', ');
  const res = await corpWrite<{ message: string; codigo_negocio: number }>('/negocio', 'POST', {
    etapa: 1,
    status: 0,
    prioridade: 3,
    datinc: `${datalt} ${hora}`,
    datalt,
    campo_base_r: 5,
    ...payload,
  });
  if (!res.codigo_negocio) throw new Error(`Corp POST /negocio sem codigo_negocio: ${JSON.stringify(res)}`);
  return res.codigo_negocio;
}

// ===== PRODUCAO =====

export async function listProducao(opts: {
  dt_ini: string; dt_fim: string;
}): Promise<any> {
  return corpFetch('/producao', {
    texto: '', dt_ini: opts.dt_ini, dt_fim: opts.dt_fim,
    ordem: 'inivig', orientacao: 'asc', so_renovados: 't', so_emitidos: 'x',
  });
}

// ===== BI =====

export async function getDocumentosBi(opts: {
  datini: string; datfim: string;
}): Promise<any> {
  return corpFetch('/documentos_bi', {
    datini: opts.datini, datfim: opts.datfim, data: 'INIVIG', tipo_doc: 'TODOS',
  });
}
