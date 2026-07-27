# Mladi Pirati - Applications Receiver

This project is a Next.js admin panel and ingestion API for Mladi pirati applications. It uses PostgreSQL, Drizzle ORM, Auth.js v5 with Keycloak, Zod validation, and shadcn/ui.

## Setup

Install dependencies:

```bash
bun install
```

Run PostgreSQL locally if needed:

```bash
docker compose up -d db
```

Generate and apply migrations:

```bash
bun run db:generate
bun run db:migrate
```

Start the app:

```bash
bun run dev
```

## Required Environment Variables

Copy `.env.example` to `.env` and provide:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `KEYCLOAK_CLIENT_ID`
- `KEYCLOAK_CLIENT_SECRET`
- `KEYCLOAK_ISSUER`
- `KEYCLOAK_ADMIN`
- `LEGALIZIRAJMO_TURNSTILE_SECRET_KEY`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_REGION`
- `S3_ENDPOINT`
- `S3_BUCKET`

Optional:

- `KEYCLOAK_DEFAULT_CLIENT_ROLE`
- `LEGALIZIRAJMO_TURNSTILE_EXPECTED_HOSTNAME`

`LEGALIZIRAJMO_TURNSTILE_SECRET_KEY` is used by the newsletter subscribe API and the membership application API to verify Cloudflare Turnstile tokens server-side. `LEGALIZIRAJMO_TURNSTILE_EXPECTED_HOSTNAME` can be set to enforce that successful Turnstile challenges were solved for the expected frontend hostname.

The S3 settings point Helm at a private S3-compatible bucket used for profile
pictures. The configured credentials require `GetObject`, `PutObject`, and
`DeleteObject`; browsers never access the bucket directly.

## Auth Overview

- Auth.js v5 is configured with Keycloak OIDC.
- `AUTH_URL` must match the public admin origin exactly. Keycloak must allow `${AUTH_URL}/api/auth/callback/keycloak` as a valid redirect URI.
- `KEYCLOAK_ISSUER` is used for OIDC token/auth flows. `KEYCLOAK_ADMIN` is used for Keycloak Admin REST API calls.
- User records live in PostgreSQL for local app authorization and are linked to Keycloak users.
- The first eligible Keycloak login creates the first local admin user.
- Sessions use the JWT strategy and expose `id`, `fullName`, `username`, and `role`.
- `/admin` is protected for authenticated users, while `/admin/users` is limited to `admin` users only.

## Available Commands

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
bun run lint
bun run build
```
