INSERT INTO public.marpe_funnels (id, name, description, sort_order) VALUES
  ('00000000-0000-0000-0001-000000000001', 'Vendas', 'Prospecção até emissão', 1),
  ('00000000-0000-0000-0001-000000000002', 'Renovações', 'Contratos vencendo', 2),
  ('00000000-0000-0000-0001-000000000003', 'Sinistros', 'Acompanhamento de sinistros', 3),
  ('00000000-0000-0000-0001-000000000004', 'Assistência 24h', 'Guincho e emergências', 4);

INSERT INTO public.marpe_funnel_stages (funnel_id, name, color, sort_order, is_terminal, terminal_type) VALUES
  ('00000000-0000-0000-0001-000000000001','Prospecção','#3B82F6',1,false,null),
  ('00000000-0000-0000-0001-000000000001','Cotação Enviada','#F59E0B',2,false,null),
  ('00000000-0000-0000-0001-000000000001','Aguardando Retorno','#8B5CF6',3,false,null),
  ('00000000-0000-0000-0001-000000000001','Proposta Transmitida','#06B6D4',4,false,null),
  ('00000000-0000-0000-0001-000000000001','Aguardando Emissão','#F97316',5,false,null),
  ('00000000-0000-0000-0001-000000000001','Emitido','#22C55E',6,true,'won'),
  ('00000000-0000-0000-0001-000000000001','Perdido','#EF4444',7,true,'lost'),
  ('00000000-0000-0000-0001-000000000002','60 dias','#F59E0B',1,false,null),
  ('00000000-0000-0000-0001-000000000002','30 dias','#EF4444',2,false,null),
  ('00000000-0000-0000-0001-000000000002','Contato Realizado','#3B82F6',3,false,null),
  ('00000000-0000-0000-0001-000000000002','Cotação Enviada','#8B5CF6',4,false,null),
  ('00000000-0000-0000-0001-000000000002','Renovado','#22C55E',5,true,'won'),
  ('00000000-0000-0000-0001-000000000002','Cancelado','#6B7280',6,true,'lost'),
  ('00000000-0000-0000-0001-000000000003','Pendente','#F59E0B',1,false,null),
  ('00000000-0000-0000-0001-000000000003','Aberto','#EF4444',2,false,null),
  ('00000000-0000-0000-0001-000000000003','Em Andamento','#3B82F6',3,false,null),
  ('00000000-0000-0000-0001-000000000003','Autorizado','#06B6D4',4,false,null),
  ('00000000-0000-0000-0001-000000000003','Concluído','#22C55E',5,true,'won'),
  ('00000000-0000-0000-0001-000000000004','Assistência Aberta','#EF4444',1,false,null),
  ('00000000-0000-0000-0001-000000000004','Prestador Acionado','#F59E0B',2,false,null),
  ('00000000-0000-0000-0001-000000000004','Prestador Chegou','#06B6D4',3,false,null),
  ('00000000-0000-0000-0001-000000000004','Finalizada','#22C55E',4,true,'won');

INSERT INTO public.marpe_loss_reasons (label, sort_order) VALUES
  ('Sem aceitação do risco',1),('Sem interesse',2),('Sem dinheiro',3),
  ('Sem contato (não responde)',4),('Renovou com outra corretora',5),
  ('Vendeu o veículo/imóvel',6),('Sem perfil',7),('Outro',8);

INSERT INTO public.marpe_templates (name, category, body, variables) VALUES
  ('Cotação pronta','comercial','#periodo_dia, #primeiro_nome! Sua cotação já está pronta. Posso enviar os detalhes agora?','{primeiro_nome,periodo_dia}'),
  ('Proposta transmitida','comercial','#periodo_dia, #primeiro_nome! Sua proposta de seguro #ramo foi transmitida para a #seguradora. Te aviso quando emitir.','{primeiro_nome,periodo_dia,ramo,seguradora}'),
  ('Boas-vindas','pos-venda','#periodo_dia, #primeiro_nome! Bem-vindo à Marpe Corretora! Pólice #apolice emitida. Assistência 24h: 0800-XXX-XXXX | Marpe: (55) 99912-0001.','{primeiro_nome,periodo_dia,apolice}'),
  ('Aviso de parcela','cobranca','#periodo_dia, #primeiro_nome! Lembrete: parcela do seguro #ramo vence em #vencimento, valor R$ #valor.','{primeiro_nome,periodo_dia,ramo,vencimento,valor}'),
  ('Guincho acionado','assistencia','#periodo_dia, #primeiro_nome! Guincho acionado. Previsão: ~40 min. Protocolo: #protocolo.','{primeiro_nome,periodo_dia,protocolo}'),
  ('Pesquisa satisfação','pos-venda','#periodo_dia, #primeiro_nome! Atendimento finalizado (protocolo #protocolo). De 1 a 10, como avalia nosso atendimento?','{primeiro_nome,periodo_dia,protocolo}'),
  ('Follow-up','comercial','#periodo_dia, #primeiro_nome! Dando continuidade sobre o seguro #ramo. Posso ajudar com alguma dúvida?','{primeiro_nome,periodo_dia,ramo}'),
  ('Aviso renovação','renovacao','#periodo_dia, #primeiro_nome! Seu seguro #ramo com a #seguradora vence em #vencimento. Vamos renovar?','{primeiro_nome,periodo_dia,ramo,seguradora,vencimento}');

UPDATE public.marpe_profiles SET role = 'admin', full_name = 'Admin' WHERE email = 'admin@marpe.com.br';
