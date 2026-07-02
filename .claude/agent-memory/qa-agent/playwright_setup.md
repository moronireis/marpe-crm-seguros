---
name: Playwright Setup for Marpe CRM
description: Playwright is not installed in the marpe project — use castelo-linkbio node_modules
type: reference
---

`@playwright/test` is NOT installed in `/Users/moronireis/Projetos vscode/marpe-crm-seguros/`.

**Working setup:**
```js
const { chromium } = require('/Users/moronireis/Projetos vscode/castelo-linkbio/node_modules/playwright');
```

Run test scripts with plain `node script.js` (not `npx playwright test`).

Do NOT use TypeScript syntax (no `as HTMLElement` casts) — scripts run as CommonJS in Node.js directly.

**DnD-kit card selector:** Deal cards rendered by DnD-kit do NOT use `cursor: pointer` inline style. To click a deal card, find it by visible text and click coordinates:
```js
const card = await page.getByText('CONTACT NAME', { exact: false });
const box = await card.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
```

**Production URL:** https://marpe-crm-seguros.vercel.app
**Login path:** / (root redirects to login if unauthenticated)
