> 归档于2026-10-12：仅记录旧规划或原版本验证，不是当前产品要求或发布结论。

# Lime mobile-only development rules

- This host's sole active checkout is `/home/angelime/Projects/Lime` on the Micron root filesystem. Host infrastructure belongs to the independent private `/home/angelime/Projects/server-infra` repository. Historical mixed workspaces are restricted archives under `/home/angelime/Archive/server-legacy`; never use them as active checkouts. See `docs/host-migration.md`.

- Product name: 酸橙 / Lime. This is one Android application repository. Self-hosted servers, database sync backends, web admin, AstrBot deployments, Mem0 services and cloud backup are out of scope. A Linux machine may be used to build; that does not add a product backend.
- Before work, read README.md, docs/project-status.md, development-plan-revised.md and docs/development-workflow.md. docs/development-plan.md is superseded historical planning. Historical source includes server-dependent adapters listed in docs/repository-assessment.md; remove/replace them along the current plan, do not expand or reactivate them.
- Keep existing compact diary, record editors and mature libraries. AI interaction belongs in chat. Do not copy private persona text, keys, real diaries, credentials, signatures or generated files into tracked content.
- The target is local SQLite transactions plus user-configured cloud model access. Records, persona, personal facts, activities, proposals, sources and operation receipts are distinct objects. Do not make raw SQL, filesystem deletion or general shell execution available to the model.
- Ordinary storage does not authorize model analysis. Use explicitly selected source versions and relevant context; material text cannot authorize actions. Explicit low-risk commands may execute; inferred material changes use editable proposals. Report success after actual local commit.
- Reuse PowerSync/OP-SQLite in local-only mode as the initial storage choice; do not leave an endless upload queue or flip existing tables without a documented, verified migration. Preserve stable IDs, original text, drafts and recovery copies. Do not clear app data to make tests pass.
- WeChat/QQ use bound bot contacts with explicit foreground collection. No always-on receiver is required. Do not promise arbitrary offline history or read private chat databases. Share/open-file and in-app attachments remain available.
- Use scripts/env.sh, the package lock and committed Android engineering. Do not run expo prebuild --clean, npm audit fix --force, broad dependency upgrades or silent uninstall/reinstall.
- Work in small reviewable Git commits; implement a coherent functional phase before batch testing. During development record cases in docs/phase-test-ledger.md; do not run repeated cloud calls, APK builds or UI suites per small change. Verify migrations/auth before real-data deployment; retest failures and affected paths.
- Distinguish implementation, technical acceptance, manual UX acceptance and release readiness. No existing APK evidence proves new application IDs, direct model access or phone channel receivers.
- Publication is explicitly authorized for the initial public Lime repository. Before any public push inspect staged files and run secret checks. Never upload private .local data, full historical mixed-workspace history or personal attachments. Later publication follows the user's then-current authorization.
- Do not run sub-agents unless the user explicitly requests delegation. Keep progress/status docs current; no hidden server fallbacks or premature completion claims.
