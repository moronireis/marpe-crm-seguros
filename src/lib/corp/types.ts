export interface CorpLoginResponse {
  codigo: number;
  nome: string;
  login: string;
  email: string;
  codfil: number;
  token: string;
}

export interface CorpCliente {
  codigo: number;
  nome: string;
  ddd: number;
  numero: string;
}

export interface CorpClienteDetail {
  codfil: number;
  codigo: number;
  nome: string;
  ativo: string;
  cpf_cnpj: string | null;
  datanas: string | null;
  pessoa: string;
  sexo: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  vigente: boolean;
  observacoes: string;
  profissao: string | null;
  estado_civil: string | null;
  enderecos: Array<{
    codfil: number;
    codigo: number;
    logradouro: string;
    numero: number;
    complemento: string;
    bairro: string;
    cep: string;
    cidade: string;
    estado: string;
  }>;
}

export interface CorpDocumento {
  codfil: number;
  nosnum: number;
  tipdoc: string;
  seguradora: string;
  ramo: string;
  cliente_codigo: number;
  cliente: string;
  inivig: string;
  fimvig: string;
  numapo: string;
  numend: string;
  sin_situacao: number;
  cancelado: string;
}

export interface CorpNegocio {
  codfil: number;
  codigo: number;
  codcli: number;
  cliente: string;
  status: number;
  prioridade: number;
  tipo: number;
  tipo_neg: string;
  ramo: string;
  val_premio: number;
  val_c: number;
}

export interface CorpRamo {
  codigo: number;
  nome: string;
  abreviatura: string;
}

export interface CorpProdutor {
  codigo: number;
  nome: string;
}

export interface CorpSinistro {
  codfil: number;
  nosnum: number;
  tipo: string;
  situacao: string;
  data_ocorrencia: string;
}
