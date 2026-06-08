import type { CorpLoginResponse, CorpCliente, CorpClienteDetail, CorpDocumento, CorpNegocio, CorpRamo, CorpProdutor } from './types';

const CORP_URL = import.meta.env.CORP_API_URL || 'https://api.corpnuvem.com';
const CORP_EMAIL = import.meta.env.CORP_API_EMAIL || '';
const CORP_PASSWORD = import.meta.env.CORP_API_PASSWORD || '';
const CODFIL = 1;

let _token: string | null = null;
let _tokenExpiry: number = 0;

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const res = await fetch(`${CORP_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: CORP_EMAIL, senha: CORP_PASSWORD, aplicacao: 0 }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Corp login failed: ${(err as any).message || res.status}`);
  }

  const data = await res.json() as CorpLoginResponse;
  _token = data.token;
  // Token expires in 3 days per API, refresh after 2 days
  _tokenExpiry = Date.now() + 2 * 24 * 60 * 60 * 1000;
  return _token;
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

export async function getNegocio(codigo: number): Promise<any> {
  return corpFetch('/negocio', { codfil: String(CODFIL), codigo: String(codigo) });
}

// ===== SINISTROS =====

export async function listSinistros(opts: {
  data_inicial: string; data_final: string;
}): Promise<{ sinistros: any[] }> {
  const data = await corpFetch<any>('/sinistros', {
    tipo_sinistro: 'a', data_inicial: opts.data_inicial, data_final: opts.data_final,
    tipo_data: 'oco', situacao: 'p', qtd_pag: '100', pagina: '1',
  });
  return { sinistros: data.sinistros || [] };
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
