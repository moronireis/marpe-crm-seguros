/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly WA_BRIDGE_URL: string;
  readonly WA_BRIDGE_SECRET: string;
  readonly WEBHOOK_KEY: string;
  readonly META_WA_TOKEN: string;
  readonly META_WA_PHONE_NUMBER_ID: string;
  readonly META_WA_BUSINESS_ID: string;
  readonly UAZAPI_URL: string;
  readonly UAZAPI_TOKEN: string;
  readonly CORP_API_URL: string;
  readonly CORP_API_EMAIL: string;
  readonly CORP_API_PASSWORD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    profile?: {
      id: string;
      role: string;
      full_name: string;
      email: string;
    };
  }
}
