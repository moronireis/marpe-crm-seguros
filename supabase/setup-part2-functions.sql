CREATE OR REPLACE FUNCTION public.marpe_is_admin()
RETURNS boolean AS $func$
  SELECT EXISTS (SELECT 1 FROM public.marpe_profiles WHERE id = auth.uid() AND role = 'admin');
$func$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.marpe_update_updated_at()
RETURNS trigger AS $func$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.marpe_handle_new_user()
RETURNS trigger AS $func$
BEGIN INSERT INTO public.marpe_profiles (id, full_name, email) VALUES (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email); RETURN new; END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS marpe_on_auth_user_created ON auth.users;
CREATE TRIGGER marpe_on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.marpe_handle_new_user();

CREATE TRIGGER IF NOT EXISTS trg_mc_upd BEFORE UPDATE ON public.marpe_contacts FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();
CREATE TRIGGER IF NOT EXISTS trg_mf_upd BEFORE UPDATE ON public.marpe_funnels FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();
CREATE TRIGGER IF NOT EXISTS trg_md_upd BEFORE UPDATE ON public.marpe_deals FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();
CREATE TRIGGER IF NOT EXISTS trg_mws_upd BEFORE UPDATE ON public.marpe_whatsapp_sessions FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();
CREATE TRIGGER IF NOT EXISTS trg_mt_upd BEFORE UPDATE ON public.marpe_templates FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();
CREATE TRIGGER IF NOT EXISTS trg_ma_upd BEFORE UPDATE ON public.marpe_automations FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();
CREATE TRIGGER IF NOT EXISTS trg_mcmp_upd BEFORE UPDATE ON public.marpe_campaigns FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();
CREATE TRIGGER IF NOT EXISTS trg_mi_upd BEFORE UPDATE ON public.marpe_installments FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();
CREATE TRIGGER IF NOT EXISTS trg_mp_upd BEFORE UPDATE ON public.marpe_profiles FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();
