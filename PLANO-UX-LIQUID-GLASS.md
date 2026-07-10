# Plano UX/UI — Liquid Glass Redesign — Marpe CRM

Last updated: 2026-07-10
Status: F0–F4 IMPLEMENTADAS — preview na Vercel aguardando aprovação para F5 (QA + prod)

> Progresso 2026-07-10: F0 (tokens v2 + fundo ambiente + sidebar glass + ClientRouter + login), F1 (CrmBoard + DealPanel com indicador de abas + modais glass + portal fix no modal de perda), F2 (Inbox: painéis, bolhas com gradiente, composer pílula, skeletons), F3 (Dashboard: KPIs card-surface + seções glass + skeletons), F4 (secundárias herdaram via tokens — sem modais fixos nelas). Mockup aprovado: https://claude.ai/code/artifact/52b53867-55c2-4fcd-8920-6c7bf5953ab1
> Pendente F5: aprovação visual do Moroni no preview → QA cross-browser/mobile/reduced-motion → `vercel --prod` + push.

---

## 1. Objetivo

Modernizar todo o front do Marpe CRM com linguagem visual **Liquid Glass** (materiais translúcidos com blur, profundidade em camadas, luz especular) e um **sistema de movimento** consistente — toda interação suave, com física natural. Sem mudar nenhuma funcionalidade, rota ou API. Puramente visual + interação.

Referência de linguagem: Apple Liquid Glass (iOS 26 / macOS Tahoe), adaptada para um CRM denso em dados — o vidro fica nos **contêineres** (nav, toolbars, painéis, modais); o **conteúdo** (cards, linhas, mensagens) permanece quase sólido para legibilidade e performance.

## 2. Diagnóstico do estado atual

| Aspecto | Hoje |
|---|---|
| Stack visual | Inline styles em React referenciando CSS vars de `global.css` (Tailwind v4 importado mas não usado nos componentes) |
| Tokens | Centralizados em `global.css` — dark (default) + light (toggle no sidebar) |
| Superfícies | Cards opacos `--bg-card` + borda 1px `--border`, radius 6–16px, sombras discretas |
| Movimento | ~32 transitions pontuais, 1 keyframe (badge-pop), spinner; **nenhuma** animação de entrada, stagger, ou transição de página |
| Blur | Apenas 2 overlays de modal (`blur(4px)`) |
| Libs | dnd-kit (drag do kanban). Nenhuma lib de animação |
| Volume | ~9.100 linhas em 14 views + AppLayout + login (~700 objetos `style={{}}`) |

**Alavanca estratégica**: como tudo referencia CSS vars, ~60% da transformação visual acontece atualizando tokens no `global.css`. O que não dá para fazer inline (backdrop-filter com fallback, pseudo-elementos de highlight, hover states, media queries) vira **classes utilitárias** que os componentes adotam via `className`, mantendo os inline styles só para layout. Evita reescrever 9K linhas.

## 3. Linguagem visual alvo

### 3.1 Fundo ambiente (pré-requisito do vidro)
Vidro precisa de algo atrás para refratar. Adicionar em `AppLayout` uma camada fixa de fundo:
- Dark: base `#050508` + 2–3 orbes de gradiente radial azul muito suaves (opacidade 4–8%), posicionados nos cantos + grain sutil opcional
- Light: base `#eef1f6` + orbes azul/ciano a 5–10%
- `position: fixed`, `z-index: -1`, zero JS, zero custo de scroll

### 3.2 Sistema de materiais (3 níveis de vidro + 1 superfície)

| Material | Uso | Receita (dark) |
|---|---|---|
| `.glass-nav` | Sidebar, headers/toolbars de página | `rgba(10,10,18,0.62)` + `backdrop-filter: blur(20px) saturate(1.5)` + hairline `rgba(255,255,255,0.07)` + highlight interno topo `inset 0 1px 0 rgba(255,255,255,0.06)` |
| `.glass-panel` | Colunas do kanban, lista de conversas, contêineres de seção, painel do deal | `rgba(13,13,22,0.5)` + `blur(14px) saturate(1.35)` |
| `.glass-modal` | Modais, dropdowns, popovers, menus | `rgba(15,15,26,0.72)` + `blur(28px) saturate(1.6)` + sombra profunda + hairline gradiente |
| `.card-surface` | Deal cards, KPI cards, linhas, bolhas | **Sem blur.** Gradiente sutil `linear-gradient(180deg, #14141f, #0e0e17)` + hairline + highlight interno. Quase sólido de propósito |

Light mode: mesmas classes, receitas frosted-white (`rgba(255,255,255,0.55–0.8)` + blur + saturate, hairlines `rgba(0,0,0,0.06)`).

**Regra de ouro de performance**: backdrop-filter só em contêineres (máx. ~6–8 camadas por viewport). Cards do kanban (até 50/coluna × N colunas) JAMAIS recebem blur individual.

### 3.3 Profundidade, luz e forma
- **Radius contínuo maior**: cards 12→14px, painéis/seções 16→20px, modais 20–24px, botões/inputs 10–12px, pills 999. Regra de cantos concêntricos (radius interno = externo − padding)
- **Hairline borders com gradiente** (mais claro no topo) em vez de borda chapada
- **Highlight especular**: `inset 0 1px 0 rgba(255,255,255,0.05–0.08)` em toda superfície elevada
- **Sombras ambiente** mais suaves e maiores (menos "borda dura", mais flutuação)
- **Scrollbar** ainda mais discreta, com fade quando inativa

### 3.4 O que NÃO muda
- Paleta de cores funcionais (accent azul, green/red/amber/purple/cyan) — só refinada
- Tipografia Inter e escala atual
- Layout, hierarquia de informação, densidade de dados
- Nenhum emoji em UI; ícones continuam SVG geométricos (o "✕" text-char dos modais vira SVG)

## 4. Sistema de movimento

Princípio: **rápido de perceber, suave de assistir**. Durações 0.18–0.45s, easings já existentes (`--ease-out`, `--ease-spring`) + novo `--ease-glass: cubic-bezier(0.32, 0.72, 0, 1)`.

| Interação | Comportamento novo |
|---|---|
| Navegação entre páginas | Astro `<ClientRouter />` (View Transitions nativas): crossfade suave em vez de flash branco de MPA |
| Entrada de conteúdo | Fade-up 8px + micro-scale 0.985→1, com **stagger** (40–60ms/item) em listas, colunas, KPIs |
| Modais/dropdowns | Overlay com blur que anima de 0→28px + painel scale 0.96→1 spring; fechamento com fade rápido |
| Painel do deal (DealPanel) | Slide-in da direita com spring suave; abas com **indicador deslizante** animado + crossfade do conteúdo |
| Hover em cards | Lift −2px + bloom de sombra + hairline acende (transition 0.2s); pressed scale 0.98 |
| Botões | Estados hover/active/focus consistentes; primário com glow azul sutil no hover |
| Kanban drag (dnd-kit) | Card levanta com tilt ~2°, sombra profunda; coluna alvo ganha glow de borda; reflow suave dos cards |
| Inbox | Mensagens novas entram com slide+fade; envio com estado otimista; lista de conversas com stagger |
| Dashboard | Números com count-up (400ms), barras animam largura no mount (já parcial), feed com stagger |
| Loading | Skeleton shimmer (glass) substituindo spinners nas listas principais |
| Tema dark↔light | Crossfade via View Transitions API (fallback: transition nos tokens) |

**Sem dependência nova**: tudo CSS keyframes/transitions + dnd-kit existente + ClientRouter nativo do Astro. Framer Motion descartado (custo de bundle por ilha, complexidade com React 19 islands, desnecessário para este escopo).

## 5. Guardrails (obrigatórios em todas as fases)

1. **Performance**: `-webkit-backdrop-filter` para Safari; máx. 6–8 superfícies com blur por viewport; blur reduzido no mobile (GPU); `will-change` só durante animação; validar 60fps no scroll do kanban com 200+ cards e no chat
2. **Acessibilidade**: `prefers-reduced-motion` desliga animações (mantém opacidade final); `prefers-reduced-transparency` → superfícies sólidas; contraste AA de texto sobre vidro nos dois temas; `:focus-visible` com anel visível em tudo interativo
3. **Temas**: toda classe nova tem receita dark + light desde o dia 1
4. **Mobile**: sidebar drawer, inbox e kanban re-testados a cada fase (≤768px)
5. **Zero regressão funcional**: nenhuma mudança em props, estado, fetch ou API — só `className` + estilos
6. **Gate de aprovação visual**: cada fase termina com deploy de preview no Vercel → Moroni aprova antes da próxima (regra permanente do workspace)

## 6. Fases de execução

### F0 — Fundação: tokens, materiais e movimento (1 sessão)
**Arquivos**: `src/styles/global.css`, `src/layouts/AppLayout.astro`, `src/pages/login.astro`
- `global.css` v2: tokens de vidro (`--glass-*`, `--hairline`, `--highlight`), nova escala de radius/sombras/durations, keyframes (fade-up, scale-in, shimmer, slide-in), classes utilitárias (`.glass-nav`, `.glass-panel`, `.glass-modal`, `.card-surface`, `.btn`, `.btn-primary`, `.input`, `.skeleton`, helpers de stagger), media queries reduced-motion/transparency, receitas light
- `AppLayout`: fundo ambiente com orbes, sidebar vira `.glass-nav` flutuante, ClientRouter (View Transitions) + ajuste dos scripts de badge para sobreviver à navegação (`astro:page-load`)
- **Login redesenhado** como piloto: página isolada, primeiro contato do Marcel com a nova cara — card de vidro central, orbes de fundo, animação de entrada
- Aceite: preview no Vercel com login + shell (sidebar/fundo) novos, todas as páginas atuais funcionando visualmente inalteradas por dentro

### F1 — CRM: a tela principal (1–2 sessões)
**Arquivos**: `CrmBoard.tsx`, `DealPanel.tsx`, `DealTab*.tsx` (6), `NewContactModal.tsx`
- Toolbar de filtros/busca → `.glass-nav`; colunas do kanban → `.glass-panel` com header sticky interno; deal cards → `.card-surface` com hover lift + entrada com stagger
- Drag: tilt + sombra no card ativo, glow na coluna alvo
- Modais (Novo Negócio, Novo Cliente, motivo de perda) → `.glass-modal` com scale-in
- DealPanel: slide-in spring, abas com indicador deslizante + crossfade, formulários das 6 abas com `.input`/`.btn` novos
- Visão Grade: linhas com hover, cabeçalho glass sticky
- Aceite: preview + drag fluido a 60fps com board real (4.6K deals, cap 50/coluna)

### F2 — Inbox WhatsApp (1 sessão)
**Arquivos**: `InboxView.tsx`, `shared/TemplateDropdown.tsx`
- Lista de conversas → `.glass-panel` com stagger; header do chat → `.glass-nav`
- Bolhas de mensagem → `.card-surface` com gradiente sutil (out = azul profundo, in = neutro), agrupamento visual por remetente/hora
- Composer vira **barra flutuante de vidro** (estilo iOS) com botão de envio animado
- TemplateDropdown ("/") → `.glass-modal`; anexos (imagem/áudio/vídeo/doc) com cantos e hairlines novos; estado desconectado redesenhado
- Aceite: preview + scroll do histórico fluido, envio com feedback otimista

### F3 — Dashboard (1 sessão)
**Arquivos**: `DashboardView.tsx`
- KPI cards → `.card-surface` com count-up nos números; seções → `.glass-panel`
- Barras (ramo, metas de produtor) animam no mount; feed de atividades com stagger; pipeline de renovações e cards de operação restilizados; filtro de período → dropdown glass
- Aceite: preview + dados reais renderizando sem layout shift

### F4 — Páginas secundárias (1 sessão)
**Arquivos**: `CampaignsView.tsx`, `AutomationsView.tsx`, `TemplatesView.tsx`, `LinksView.tsx`, `ContactDetailView.tsx`, `ConfigView.tsx`
- Sweep aplicando as classes já criadas (esforço baixo — F0 fez o trabalho pesado): tabelas/listas, editores, modal do QR Code WhatsApp em `.glass-modal`, timeline do contato com stagger
- Aceite: preview com as 6 páginas consistentes com o resto

### F5 — QA, performance e produção (1 sessão)
- Auditoria cross-browser (Chrome/Safari/Firefox — backdrop-filter), mobile completo, Lighthouse antes/depois, reduced-motion/transparency, contraste AA dark+light
- Regressão funcional dos fluxos críticos: login, drag de deal entre etapas, criar negócio (dual-write Corp ON!), enviar mensagem, campanha, QR
- Ajustes finos de stagger/duração ("tuning de feel"), atualizar CLAUDE.md do repo (seção styling), deploy produção
- Aceite: prod atualizado + walkthrough para Marcel/Tiago

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| ClientRouter (View Transitions) re-executa scripts do layout (polling de badges, toggle de tema) | Migrar listeners para `astro:page-load` de forma idempotente na F0; se instabilizar, **fallback**: remover ClientRouter e usar fade-in por página (perde só a transição entre rotas) |
| Backdrop-filter pesado em máquinas fracas / mobile | Blur menor no mobile, `prefers-reduced-transparency`, teto de camadas, teste com board real na F1 |
| Contraste em vidro no light mode | Receitas light com opacidade mínima 0.55 + auditoria AA na F5 |
| Regressão funcional em 9K linhas tocadas | Mudanças limitadas a className/estilo; fluxos críticos re-testados por fase; deploy sempre via preview antes de prod |
| Dual-write Corp ativo (POST /api/deals) | F1 testa criação de negócio em preview com flag real — nenhum código de API é tocado |

## 8. Estimativa e sequência

| Fase | Escopo | Esforço |
|---|---|---|
| F0 | Fundação + shell + login | 1 sessão |
| F1 | CRM (board + deal panel + modais) | 1–2 sessões |
| F2 | Inbox | 1 sessão |
| F3 | Dashboard | 1 sessão |
| F4 | Secundárias (6 páginas) | 1 sessão |
| F5 | QA + prod | 1 sessão |
| **Total** | | **~6–7 sessões** |

Cada fase = branch de trabalho → preview Vercel → aprovação → próxima. Prod só na F5 (ou antecipado por fase, se preferir entregar gradual ao Marcel).
