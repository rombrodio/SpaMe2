## What
<describe what this PR changes>

## Why
<describe why this change is needed>

## Type
- [ ] Feature / SPA-*
- [ ] Bug fix / QA sweep / DEF-*
- [ ] Chore / deps / infra

**Phase / SPA-ID / DEF-ID reference:**

## Main changes
-
-
-

## Things intentionally not included
-
-

## Risks / review focus
-
-

## Docs sync

Walked [`docs/DOC-SYNC.md`](../docs/DOC-SYNC.md) — tick every row that applies, or tick `N/A` explicitly.

- [ ] N/A — no docs affected by this change
- [ ] Added/changed migration → updated `README.md` + `MASTER-PLAN.md` migration lists
- [ ] Added/changed env var → updated `.env.local.example` + `README.md` (+ `AGENTS.md` if load-bearing)
- [ ] New route / feature / SPA-* / DEF-* → updated `MASTER-PLAN.md` phase or shipped-list
- [ ] New / changed UI primitive in `src/components/ui/` → updated `README.md` UI kit line
- [ ] New dependency → noted in commit body + `README.md` tech stack line if load-bearing
- [ ] Cron / webhook / secret / hosted integration added → updated `MASTER-PLAN.md` + `AGENTS.md`
- [ ] Role / RBAC change → updated `MASTER-PLAN.md` Auth & Roles section
- [ ] New/changed `.cursor/rules/*.mdc`, `.cursor/hooks/*`, `.cursor/bugbot.yaml`, or `.cursor/mcp.json` → followed the matching row in `docs/DOC-SYNC.md` (no service-role key in `mcp.json`, hook `chmod +x` verified)
- [ ] New key in `src/i18n/messages/en.json` → Cloud Agent auto-drafted `he.json` + `ru.json` OR hand-drafted with note in PR
- [ ] Manifest itself missed something → added a row to `docs/DOC-SYNC.md`

## Testing

- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm run test` green
- [ ] `npm run build` compiles
- [ ] Main flow tested manually (screenshot or short note below)

## Screenshots / notes
<add screenshots or notes if relevant>
