// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  security: {
    checkOrigin: false
  },
  // maxDuration 300s: the nightly Corp full sync (corp-sync) fetches ~200 negocio
  // details + thousands of upserts and can exceed the 60s default.
  adapter: vercel({ maxDuration: 300 }),
  vite: {
    plugins: [tailwindcss()]
  },
  integrations: [react()]
});
