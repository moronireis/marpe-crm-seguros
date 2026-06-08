-- =============================================
-- MARPE CRM SEGUROS — Seed: Default Funnels + Stages + Loss Reasons
-- =============================================

-- Funnel 1: Vendas
insert into public.funnels (id, name, description, sort_order) values
  ('00000000-0000-0000-0001-000000000001', 'Vendas', 'Fluxo de prospecção até emissão de pólice', 1);

insert into public.funnel_stages (funnel_id, name, color, sort_order, is_terminal, terminal_type) values
  ('00000000-0000-0000-0001-000000000001', 'Prospecção', '#3B82F6', 1, false, null),
  ('00000000-0000-0000-0001-000000000001', 'Cotação Enviada', '#F59E0B', 2, false, null),
  ('00000000-0000-0000-0001-000000000001', 'Aguardando Retorno', '#8B5CF6', 3, false, null),
  ('00000000-0000-0000-0001-000000000001', 'Proposta Transmitida', '#06B6D4', 4, false, null),
  ('00000000-0000-0000-0001-000000000001', 'Aguardando Emissão', '#F97316', 5, false, null),
  ('00000000-0000-0000-0001-000000000001', 'Emitido', '#22C55E', 6, true, 'won'),
  ('00000000-0000-0000-0001-000000000001', 'Perdido', '#EF4444', 7, true, 'lost');

-- Funnel 2: Renovações
insert into public.funnels (id, name, description, sort_order) values
  ('00000000-0000-0000-0001-000000000002', 'Renovações', 'Contratos com vigência vencendo', 2);

insert into public.funnel_stages (funnel_id, name, color, sort_order, is_terminal, terminal_type) values
  ('00000000-0000-0000-0001-000000000002', '60 dias', '#F59E0B', 1, false, null),
  ('00000000-0000-0000-0001-000000000002', '30 dias', '#EF4444', 2, false, null),
  ('00000000-0000-0000-0001-000000000002', 'Contato Realizado', '#3B82F6', 3, false, null),
  ('00000000-0000-0000-0001-000000000002', 'Cotação Enviada', '#8B5CF6', 4, false, null),
  ('00000000-0000-0000-0001-000000000002', 'Renovado', '#22C55E', 5, true, 'won'),
  ('00000000-0000-0000-0001-000000000002', 'Cancelado', '#6B7280', 6, true, 'lost');

-- Funnel 3: Sinistros
insert into public.funnels (id, name, description, sort_order) values
  ('00000000-0000-0000-0001-000000000003', 'Sinistros', 'Acompanhamento de sinistros e atendimentos', 3);

insert into public.funnel_stages (funnel_id, name, color, sort_order, is_terminal, terminal_type) values
  ('00000000-0000-0000-0001-000000000003', 'Pendente', '#F59E0B', 1, false, null),
  ('00000000-0000-0000-0001-000000000003', 'Aberto', '#EF4444', 2, false, null),
  ('00000000-0000-0000-0001-000000000003', 'Em Andamento', '#3B82F6', 3, false, null),
  ('00000000-0000-0000-0001-000000000003', 'Autorizado', '#06B6D4', 4, false, null),
  ('00000000-0000-0000-0001-000000000003', 'Concluído', '#22C55E', 5, true, 'won');

-- Funnel 4: Assistência 24h
insert into public.funnels (id, name, description, sort_order) values
  ('00000000-0000-0000-0001-000000000004', 'Assistência 24h', 'Guincho, troca de vidro, atendimentos de emergência', 4);

insert into public.funnel_stages (funnel_id, name, color, sort_order, is_terminal, terminal_type) values
  ('00000000-0000-0000-0001-000000000004', 'Assistência Aberta', '#EF4444', 1, false, null),
  ('00000000-0000-0000-0001-000000000004', 'Prestador Acionado', '#F59E0B', 2, false, null),
  ('00000000-0000-0000-0001-000000000004', 'Prestador Chegou', '#06B6D4', 3, false, null),
  ('00000000-0000-0000-0001-000000000004', 'Finalizada', '#22C55E', 4, true, 'won');

-- Default loss reasons
insert into public.loss_reasons (label, sort_order) values
  ('Sem aceitação do risco', 1),
  ('Sem interesse', 2),
  ('Sem dinheiro', 3),
  ('Sem contato (não responde)', 4),
  ('Renovou com outra corretora', 5),
  ('Vendeu o veículo/imóvel', 6),
  ('Sem perfil', 7),
  ('Outro', 8);
