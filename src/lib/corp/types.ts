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
  // Next action (from /negocios_andamento list)
  prox_aten_data: string | null;        // "dd/mm/yyyy"
  prox_aten_hora: string | null;
  prox_aten_descricao: string | null;
  prox_aten_qtde_atrasadas: number | null;
  inivig: string | null;
  fimvig: string | null;
  produto_fimvig: string | null;
}

export interface CorpNegocioDetail {
  codigo: number;
  codfil: number;
  cliente: string;
  codcli: number;
  ramo: string;
  codram: number | null;
  codcia: number | null;
  codcamp: number | null;
  status: number;
  etapa: number;
  prioridade: number;
  tipo: number;
  seguradora: string | null;
  campanha: string | null;
  observacoes: string | null;
  // Produto atual
  produto_ja_possui: 'T' | 'F' | null;
  produto_seguradora: string | null;
  produto_fimvig: string | null;
  produto_numapo: string | null;
  // Valores
  val_premio: number;
  per_c: number;          // % comissão
  val_c: number;          // valor comissão
  campo_base_r: number;   // código do campo base do repasse
  per_r: number;          // % repasse
  val_r: number;          // valor repasse
  // Auditoria Corp
  usuinc: string | null;
  datinc: string | null;
  usualt: string | null;
  datalt: string | null;
  dtini_negociacao: string | null;
  codusu_responsavel: number | null;
  motivo_perda: string | null;
  // Próxima ação
  prox_aten_data: string | null;
  prox_aten_hora: string | null;
  prox_aten_descricao: string | null;
  // Histórico de atendimentos
  atendimentos: Array<{
    codigo: number;
    tipo_atendimento: string | null;
    data: string | null;
    hora: string | null;
    canal: number | null;
    datinc: string | null;
    usuinc: string | null;
    descricao: string | null;
    realizado: 'T' | 'F' | null;
    tipo: string | null;
  }>;
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

export interface CorpSeguradora {
  codigo: number;
  nome: string;
  abreviatura: string;
}

export interface CorpAgente {
  codigo: number;
  nome: string;
}

export interface CorpProfissao {
  codigo: number;
  profissao: string;
}

export interface CorpSinistro {
  codfil: number;
  nosnum: number;
  tipo: string;
  situacao: string;
  data_ocorrencia: string;
}
