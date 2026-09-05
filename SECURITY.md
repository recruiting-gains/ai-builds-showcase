# Security

These are experimental portfolio projects, not a promise of risk-free software.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/recruiting-gains/ai-builds-showcase/security/advisories/new). Do not post tokens, private conversations, personal records, or exploit instructions in a public issue. Include the affected project/version and a minimal reproduction using synthetic data.

## Safe use

- Never commit API keys, `.env` files, `.dev.vars`, account sessions, database exports, or local agent runtime configuration. Use deployment secret storage and keep demo data synthetic.
- Revoke or rotate an exposed credential first. Removing it from the latest source does not remove it from history or other copies.
- Anonymous AI demonstrations have abuse limits, not guaranteed global spending caps. A commercial service needs authentication, quotas, budget controls, and monitoring appropriate to its risk.
- The desktop applications are experimental builds. Read each project's signing and permissions notes; do not bypass macOS security warnings or grant unrelated permissions.
- Production and customer deployments need their own configuration, security review, and approved access boundaries. A repository scan is not a penetration test or compliance certification.

## Automated checks

The security workflow scans reachable history for supported secret patterns with values redacted, audits all nine committed npm lockfiles, and runs the AI Workflow Lab request-boundary regression tests. It does not prove the absence of unknown vulnerabilities. GitHub dependency alerts and security-fix pull requests complement these checks; updates require review before merging.
