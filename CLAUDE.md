# Xenaxio webmail (fork of Bulwark Mail)

This is the public AGPL client of Xenaxio. Project status, rules and next
steps live in the platform repository's `docs/progress.md` (es-ua/xenaxio);
read it first if you have access.

- Xenaxio code lives in `lib/xenaxio/`, `components/xenaxio/` and the
  `app/(main)/[locale]/{login,onboarding,workspace,operator}` pages; keep
  changes to upstream files minimal so upstream merges stay easy.
- The client talks only to the platform API under `/api` (no direct
  connection to the mail server); never import platform code here.
- User-facing strings: German and English in `lib/xenaxio/messages-*.json`.
- Work in a `step-N-…` branch and open a pull request into `main`.
- Every new feature and every user or company-admin setting goes into the platform tool registry and MCP connector by default, without exceptions, and every settings page gets an entry in the platform settings catalog (rule 8 and step 85 in the platform's `docs/plan.md`). Settings of the AI itself, permissions and irreversible actions are listed as hints only: the AI finds them but cannot change them.
- The product name is always capitalized: **Xenaxio** — in prose, docs, UI strings and emails. Code identifiers, paths, domains and package names stay as they are: `xenaxio.com`, `@xenaxio/...`, `lib/xenaxio/`.
