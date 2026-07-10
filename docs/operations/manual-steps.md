# Manual steps and credential status

## What Orien must do now

**Nothing is required to preserve this code or run its automated checks.** The
repository, CI, and security scanning use the existing personal GitHub account.
No API key, cloud account, database, billing method, or AI provider is needed.

To use the local word-library console yourself:

1. Open Terminal.
2. Run `cd /Users/orienzhang/code/personal/drawing-games`.
3. Run `corepack enable` once if `pnpm` is not available.
4. Run `pnpm install`.
5. Run `pnpm dev` and leave that terminal open.
6. Open `http://localhost:3000/admin/words` in your normal browser.
7. Use **Export backup** after meaningful edits. The current console saves only
   in that browser's local storage; clearing site data or changing browsers does
   not carry the catalog with you.

The console is a local authoring baseline, not production admin security. It is
not yet connected to live room word selection, and it must not be treated as a
shared multi-device source of truth.

## What Codex will ask for later

Only an intentional external integration creates manual credential work:

1. **First realtime deployment:** sign in to a Cloudflare account and choose the
   target account. Codex can prepare and verify the deployment command, but the
   browser login and any billing acceptance remain yours.
2. **Frontend deployment/domain:** choose the hosting account and domain. Codex
   can configure environment variable names without seeing secret values.
3. **Production admin accounts:** choose an authentication provider and initial
   admin identity. Authorization will be enforced again in every server-side
   mutation, not only by hiding a page.
4. **AI word generation:** approve a provider and spending limit, then create an
   API key in that provider's console. Store it in the deployment's secret
   settings—never in this repository or browser-visible environment variables.

When one of these milestones begins, the handoff must include exact URLs,
commands, environment-variable names, verification steps, expected cost tier,
and a rollback/revocation step. Until then, do not create keys speculatively.
