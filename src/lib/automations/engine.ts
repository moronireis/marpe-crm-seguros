import { createServerClient } from '../supabase-server';
import { sendWhatsAppText } from '../whatsapp/send';
import { interpolateVariables } from '../variables';

export interface TriggerEvent {
  type: 'deal_stage_change' | 'new_contact' | 'installment_due';
  deal_id?: string;
  contact_id?: string;
  stage_id?: string;
  funnel_id?: string;
  metadata?: Record<string, unknown>;
}

export async function runAutomations(event: TriggerEvent): Promise<void> {
  const sb = createServerClient();

  const { data: automations } = await sb
    .from('marpe_automations')
    .select('*')
    .eq('is_active', true)
    .eq('trigger_type', event.type);

  if (!automations?.length) return;

  for (const automation of automations) {
    const config = automation.trigger_config || {};

    // Filter by stage/funnel if configured
    if (event.type === 'deal_stage_change') {
      if (config.stage_id && config.stage_id !== event.stage_id) continue;
      if (config.funnel_id && config.funnel_id !== event.funnel_id) continue;
    }

    try {
      await executeAction(automation, event);

      await sb.from('marpe_automation_logs').insert({
        automation_id: automation.id,
        deal_id: event.deal_id || null,
        contact_id: event.contact_id || null,
        status: 'success',
        metadata: { event },
      });

      await sb.from('marpe_automations').update({
        execution_count: (automation.execution_count || 0) + 1,
        last_executed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', automation.id);

    } catch (e: any) {
      await sb.from('marpe_automation_logs').insert({
        automation_id: automation.id,
        deal_id: event.deal_id || null,
        contact_id: event.contact_id || null,
        status: 'error',
        error_message: e.message,
        metadata: { event },
      });
    }
  }
}

async function executeAction(automation: any, event: TriggerEvent): Promise<void> {
  const sb = createServerClient();
  const actionConfig = automation.action_config || {};

  switch (automation.action_type) {
    case 'send_whatsapp': {
      let contactId = event.contact_id;
      let dealData: any = null;

      if (event.deal_id) {
        const { data: deal } = await sb
          .from('marpe_deals')
          .select(`
            veiculo, placa, apolice, seguradora, premio, comissao_valor,
            ramo, produtor, vigencia_inicio, vigencia_fim, next_action,
            contact_id
          `)
          .eq('id', event.deal_id)
          .single();
        dealData = deal;
        if (!contactId) contactId = deal?.contact_id;
      }

      if (!contactId) throw new Error('No contact for event');

      const { data: contact } = await sb
        .from('marpe_contacts')
        .select('id, phone, name, email, city')
        .eq('id', contactId)
        .single();

      if (!contact?.phone) throw new Error('Contact has no phone number');

      const message = interpolateVariables(actionConfig.message || '', {
        contact,
        deal: dealData ?? undefined,
      });

      await sendWhatsAppText(contact.phone, message, contactId, {
        isAutomation: true,
        automationId: automation.id,
      });
      break;
    }

    case 'send_survey': {
      let contactId = event.contact_id;
      let dealData: any = null;

      if (event.deal_id) {
        const { data: deal } = await sb
          .from('marpe_deals')
          .select(`
            veiculo, placa, apolice, seguradora, premio, comissao_valor,
            ramo, produtor, vigencia_inicio, vigencia_fim, next_action,
            contact_id
          `)
          .eq('id', event.deal_id)
          .single();
        dealData = deal;
        if (!contactId) contactId = deal?.contact_id;
      }

      if (!contactId) throw new Error('No contact for event');

      const { data: contact } = await sb
        .from('marpe_contacts')
        .select('id, phone, name, email, city')
        .eq('id', contactId)
        .single();

      if (!contact?.phone) throw new Error('Contact has no phone number');

      const surveyQuestion =
        actionConfig.message ||
        '{{primeiro_nome}}, seu atendimento foi finalizado! De 1 a 5, como avalia nosso atendimento? Responda com o número.';

      const message = interpolateVariables(surveyQuestion, {
        contact,
        deal: dealData ?? undefined,
      });

      // Insert pending survey record BEFORE sending so the webhook can find it
      const { data: survey } = await sb
        .from('marpe_surveys')
        .insert({
          contact_id: contactId,
          deal_id: event.deal_id || null,
          automation_id: automation.id,
          question: surveyQuestion,
          status: 'pending',
        })
        .select('id')
        .single();

      await sendWhatsAppText(contact.phone, message, contactId, {
        isAutomation: true,
        automationId: automation.id,
      });

      // Log survey_id in metadata so the automation log is traceable
      if (survey?.id) {
        await sb.from('marpe_automation_logs').insert({
          automation_id: automation.id,
          deal_id: event.deal_id || null,
          contact_id: contactId,
          status: 'success',
          metadata: { event, survey_id: survey.id },
        });
      }
      break;
    }

    case 'create_activity': {
      if (event.deal_id) {
        await sb.from('marpe_deal_activities').insert({
          deal_id: event.deal_id,
          type: 'automation',
          description: actionConfig.description || `Automação: ${automation.name}`,
          metadata: { automation_id: automation.id },
        });
      }
      break;
    }

    default:
      throw new Error(`Unknown action type: ${automation.action_type}`);
  }
}
