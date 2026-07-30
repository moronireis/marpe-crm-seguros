/**
 * Relatório da integração Corp (Agia) — fonte única da "aba de atenção".
 *
 * Auditoria de 30/07/2026, medida contra a API real e os dados de produção.
 * Consumido pelo painel em Configurações > Corp e espelhado em
 * RELATORIO-CORP-API.md (versão para o e-mail à Agger/Agia).
 *
 * Regra de manutenção: mudou o comportamento da API ou entrou resposta da
 * Agia → atualizar AQUI e no RELATORIO-CORP-API.md no mesmo commit.
 */

export type IntegrationState = 'ok' | 'parcial' | 'nosso' | 'agia';

export interface IntegrationItem {
  area: string;
  /** ok = sincroniza · parcial = sincroniza com limitação · nosso = falta implementar do nosso lado · agia = bloqueado pela API do Corp */
  state: IntegrationState;
  detail: string;
}

export const AUDIT_DATE = '30/07/2026';

export const INTEGRATION_MATRIX: IntegrationItem[] = [
  // ── Sincronizando ──────────────────────────────────────────────────────────
  { area: 'Clientes (Corp → CRM)', state: 'ok',
    detail: '2.7 mil clientes com vínculo. Sync diurno de 30 em 30 min + noturno completo. Cliente criado no Corp aparece no CRM no ciclo seguinte.' },
  { area: 'Clientes (CRM → Corp)', state: 'ok',
    detail: 'Novo Cliente grava no Corp na hora (cliente + telefone + endereço + e-mail) e edição reflete via PATCH. Estado civil e escolaridade vão num segundo passo automático — o POST do Corp recusa esses campos (comportamento deles, contornado).' },
  { area: 'Negócios em andamento (Corp → CRM)', state: 'ok',
    detail: 'Lista + detalhe de 30 em 30 min, com reconciliação de exclusões. Criação pelo CRM grava no Corp na hora (dual-write).' },
  { area: 'Apólices / documentos', state: 'ok',
    detail: '4,4 mil apólices sincronizadas (funil Vendas + histórico do cliente).' },
  { area: 'Sinistros', state: 'parcial',
    detail: 'Leitura sincronizada (funil Sinistros). Gravar sinistro no Corp não tem rota confirmada na API — registrado manualmente fica só no CRM.' },
  { area: 'Renovações', state: 'parcial',
    detail: 'A rota /renovacoes da API responde erro 500 em todas as variações testadas (30/07) — pedido de correção formalizado. Contorno em produção: o funil Renovações é derivado das apólices sincronizadas com vigência vencendo em até 60 dias.' },
  { area: 'Atendimentos do Corp na linha do tempo', state: 'ok',
    detail: 'Histórico de atendimentos de cada negócio aparece na aba Atividades do card.' },
  { area: 'Anexos (download)', state: 'ok',
    detail: 'Anexos de cliente e de negociação do Corp listados e baixáveis na aba Documentos (links renovados a cada abertura).' },
  { area: 'Fotos e conversas do WhatsApp', state: 'ok',
    detail: 'Não é Corp, mas compõe o cadastro: contatos, fotos e conversas sincronizam via instância conectada.' },

  // ── Sincroniza com limitação (causa: API do Corp) ─────────────────────────
  { area: 'Próxima ação — data', state: 'agia',
    detail: 'A API devolve a data de REGISTRO do atendimento, não o agendamento que a tela do Corp mostra (ex.: negócio 7512 — tela 22/07 vs API 09/07). Não existe campo de agendamento em rota nenhuma (medido em 300 atendimentos: zero datas futuras).' },
  { area: 'Próxima ação — descrição', state: 'parcial',
    detail: 'O campo próprio vem sempre vazio na API. Recuperamos o texto cruzando com os atendimentos do negócio — cobre quem tem descrição registrada (~1/3). O restante depende da correção da Agia.' },
  { area: 'Campanha do negócio (nome)', state: 'agia',
    detail: 'A API só devolve o código (codcamp) — não existe lista de campanhas nem o nome resolvido. O CRM usa os códigos e o Corp resolve o rótulo na tela dele.' },
  { area: 'Produtor e agente POR NEGÓCIO', state: 'agia',
    detail: 'A grade "Produtores" da tela de Negociação não é exposta pela API — nenhum campo de produtor/agente vem no negócio.' },
  { area: 'Responsável pelo negócio (nome)', state: 'agia',
    detail: 'A API devolve só o código do usuário (codusu_responsavel). Não existe rota de usuários para resolver o nome.' },
  { area: 'Repasse por produtor/agente', state: 'agia',
    detail: 'Os parâmetros de repasse (base de cálculo e forma, por produtor) não têm rota — o CRM calcula pelos percentuais do negócio, sem a tabela por produtor.' },

  // ── Não sincroniza (bloqueado pela API do Corp) ────────────────────────────
  { area: 'Edição de NEGÓCIO (CRM → Corp)', state: 'agia',
    detail: 'PUT /negocio responde erro 500 em todas as variações, inclusive com o payload completo que o POST aceita. Criação funciona; edição não. É o bloqueio nº 1 do bidirecional.' },
  { area: 'Gravar próxima ação / atendimento (CRM → Corp)', state: 'agia',
    detail: 'POST /atendimento responde erro 500 em todas as variações testadas.' },
  { area: 'Dados bancários do cliente', state: 'agia',
    detail: 'A aba "Dados Bancários" do Corp não é exposta pela API (nem leitura). O CRM mantém a própria aba, sem espelho no Corp.' },
  { area: 'Envio de anexos (CRM → Corp)', state: 'agia',
    detail: 'As rotas de anexos são só leitura (upload não existe). Anexos enviados pelo CRM ficam no CRM.' },
  { area: 'Cadastros: canais de venda, grupos de produtores, bancos', state: 'agia',
    detail: 'Não existem rotas (testadas 4 variações de nome cada). O código do canal (codcanal) até aparece dentro do documento, mas sem a lista para resolver o nome.' },
  { area: 'Cadastros: escrita de seguradoras / ramos / produtores / agentes', state: 'agia',
    detail: 'A API não tem criação/edição/exclusão desses cadastros — por isso o módulo Cadastros do CRM é consulta. CRUD sincronizado só quando a Agia expuser as rotas.' },
  { area: 'Detalhe dos cadastros (tipo da seguradora, tipo do ramo, etc.)', state: 'agia',
    detail: 'As rotas devolvem só código/nome/abreviatura — os campos que a tela do Corp mostra (Tipo, CEP, ramo multi…) não vêm.' },

  // ── Não sincroniza ainda (nosso lado — planejado) ──────────────────────────
  { area: 'Parcelas / vencimentos das apólices', state: 'nosso',
    detail: 'DESCOBERTA de 30/07: o detalhe do documento TEM o array de parcelas (vencimento, valor, quitação). Dá para sincronizar — planejado para a próxima leva (alimenta lembretes de cobrança).' },
  { area: 'Endossos (usar o último endosso da apólice)', state: 'nosso',
    detail: 'A rota /documento_endossos existe e nunca foi consumida. Planejado.' },
  { area: 'Dados complementares do cliente no sync (profissão, estado civil, endereço)', state: 'nosso',
    detail: 'O sync de clientes usa a listagem (código, nome, telefone). O detalhe individual tem mais campos — enriquecimento incremental planejado.' },
  { area: 'Negócios finalizados (histórico completo)', state: 'nosso',
    detail: 'A rota /negocios_finalizados existe e não é consumida — hoje o CRM marca "fora de andamento" na reconciliação. Importação do histórico é melhoria futura.' },
];

/** Pendências formalizadas para a Agger/Agia (SOLICITACAO-AGIA-API.md) */
export const AGIA_PENDENCIAS: string[] = [
  '1. PUT /negocio — especificação do payload (hoje: erro 500 em toda variação). Destrava a edição de negócios pelo CRM.',
  '2. POST /atendimento — especificação do payload (hoje: erro 500). Destrava gravar a próxima ação no Corp.',
  '3. GET /renovacoes — corrigir o erro 500 (testado em 30/07 com todas as combinações de parâmetros).',
  '4. Próxima ação: expor a DATA AGENDADA (a tela mostra; a API só devolve a data de registro) e corrigir a descrição que vem sempre vazia.',
  '5. Rota de usuários (código → nome) para resolver o responsável pela negociação.',
  '6. Produtores/agente vinculados à negociação (grade "Produtores" da tela).',
  '7. Lista de campanhas (código + nome) e das bases de cálculo de repasse.',
  '8. Rotas de canais de venda, grupos de produtores e bancos (não existem).',
  '9. Parâmetros de repasse por produtor (base de cálculo e forma).',
  '10. Dados bancários do cliente (leitura) e envio de anexos (upload) — hoje inexistentes na API.',
  '11. Versão detalhada dos cadastros (seguradoras/ramos/produtores/agentes) com os campos da tela — hoje só código, nome e abreviatura.',
  '12. Escrita dos cadastros (criar/editar/excluir seguradoras, ramos, produtores, agentes) para o módulo Cadastros do CRM sincronizar de volta.',
];
