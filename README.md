# InteriorLens AI

InteriorLens AI reviews interior-design quotations and generates evidence-led reports. Visitors can upload their own PDF or image, or use the fictional sample quotation on the upload page.

This repository contains a **source-only snapshot** of the web app and API. It deliberately excludes uploaded customer quotations, local reports, workspace data, and the original repository history.

## Project structure

- `artifacts/interiorlens` — React and Vite web app
- `artifacts/api-server` — Express API and quotation analysis
- `lib` — shared API contract, client, types, and database schema

## Development

Install dependencies with `pnpm install`, then run the web app and API server using their workspace scripts. The frontend expects `PORT` and `BASE_PATH`; the API uses `PORT`. The current implementation also requires PostgreSQL, Replit OIDC sign-in, Replit App Storage, and configured AI provider credentials. Configure runtime secrets in your hosting platform, never in source control.

**GitHub does not host the running API or database.** This repository alone is not a live deployment, and the full product needs hosting and replacements for its Replit-specific services before it can run independently of Replit.