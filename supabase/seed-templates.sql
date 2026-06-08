-- =============================================
-- MARPE CRM SEGUROS — Seed: Default Quick Reply Templates
-- Variables: #primeiro_nome, #periodo_dia, #veiculo, #seguradora,
--            #protocolo, #franquia, #valor, #vencimento, #apolice
-- =============================================

insert into public.templates (name, category, body, variables) values
(
  'Cotação pronta',
  'comercial',
  '#periodo_dia, #primeiro_nome! Sua cotação já está pronta. Posso enviar os detalhes agora?',
  '{primeiro_nome,periodo_dia}'
),
(
  'Proposta transmitida',
  'comercial',
  '#periodo_dia, #primeiro_nome! Sua proposta de seguro #ramo foi transmitida com sucesso para a #seguradora. Assim que a pólice for emitida, te aviso.',
  '{primeiro_nome,periodo_dia,ramo,seguradora}'
),
(
  'Boas-vindas (pólice emitida)',
  'pos-venda',
  '#periodo_dia, #primeiro_nome! Seja bem-vindo à Marpe Corretora de Seguros! Sua pólice #apolice já foi emitida. Em caso de emergência: Assistência 24h da seguradora: 0800-XXX-XXXX | Assistência Marpe: (55) 99912-0001. Estamos à disposição!',
  '{primeiro_nome,periodo_dia,apolice}'
),
(
  'Aviso de parcela',
  'cobranca',
  '#periodo_dia, #primeiro_nome! Lembrete: sua parcela do seguro #ramo vence em #vencimento, no valor de R$ #valor. Qualquer dúvida, estamos à disposição.',
  '{primeiro_nome,periodo_dia,ramo,vencimento,valor}'
),
(
  'Guincho acionado',
  'assistencia',
  '#periodo_dia, #primeiro_nome! Seu guincho foi acionado. Previsão de chegada: aproximadamente 40 minutos. Protocolo: #protocolo. Qualquer problema, nos avise.',
  '{primeiro_nome,periodo_dia,protocolo}'
),
(
  'Prestador a caminho',
  'assistencia',
  '#primeiro_nome, o prestador já foi acionado e está a caminho. Protocolo: #protocolo. Te manteremos informado.',
  '{primeiro_nome,protocolo}'
),
(
  'Serviço agendado',
  'assistencia',
  '#periodo_dia, #primeiro_nome! Seu serviço foi agendado. Oficina: #oficina. Franquia: R$ #franquia. Protocolo: #protocolo. Qualquer dúvida, estamos à disposição.',
  '{primeiro_nome,periodo_dia,oficina,franquia,protocolo}'
),
(
  'Pesquisa de satisfação',
  'pos-venda',
  '#periodo_dia, #primeiro_nome! Seu atendimento foi finalizado (protocolo #protocolo). De 1 a 10, como avalia o nosso atendimento? Sua opinião é muito importante para nós.',
  '{primeiro_nome,periodo_dia,protocolo}'
),
(
  'Follow-up sem resposta',
  'comercial',
  '#periodo_dia, #primeiro_nome! Tudo bem? Estou dando continuidade ao nosso contato sobre o seguro #ramo. Posso te ajudar com alguma dúvida?',
  '{primeiro_nome,periodo_dia,ramo}'
),
(
  'Aviso de renovação',
  'renovacao',
  '#periodo_dia, #primeiro_nome! Seu seguro #ramo com a #seguradora vence em #vencimento. Vamos renovar? Posso preparar uma cotação atualizada para você.',
  '{primeiro_nome,periodo_dia,ramo,seguradora,vencimento}'
);
