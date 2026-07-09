# Piratosan Discord Bot Implementation Prompt

Implement `../piratosan-discord` as the main Discord bot for Mladi pirati. It
must run as a normal long-lived Discord bot, connected to the gateway, and it
must also expose a small authenticated HTTP API that Helm uses for membership
role synchronization.

This is not a single-purpose Helm microservice. Treat Helm role sync as one
module inside a broader bot application that will later host commands, event
handlers, moderation helpers, onboarding flows, scheduled jobs, and other bot
features.

## Product Shape

Build one process with two runtime surfaces:

- Discord bot runtime: logs in with the bot token, connects to Discord gateway,
  registers slash commands, handles interactions, and can subscribe to member
  and guild events.
- Internal HTTP API: Hono server used by Helm and future internal tools.

The bot must start both surfaces together and shut both down cleanly on
`SIGINT`/`SIGTERM`.

## Stack

- TypeScript
- Bun
- Hono for the internal HTTP API
- `discord.js` for the gateway client, interactions, guild/member/cache helpers,
  and normal bot functionality
- `@discordjs/rest` and `discord-api-types` where useful for command
  registration or low-level REST calls
- Zod for request/response validation

Do not build the Helm integration as the whole app. Put it behind a module
boundary so future bot modules can be added without touching Helm-specific code.

## Suggested Structure

```txt
src/
  index.ts
  config.ts
  logger.ts
  bot/
    client.ts
    commands/
      index.ts
      health.ts
    events/
      ready.ts
      interaction-create.ts
      guild-member-add.ts
  http/
    server.ts
    auth.ts
    routes/
      health.ts
      helm-role-sync.ts
  helm/
    role-sync.ts
    username-resolution.ts
    role-catalog.ts
    schemas.ts
  modules/
    README.md
```

Keep concerns separated:

- `bot/*`: Discord gateway lifecycle, commands, and event handling.
- `http/*`: Hono server, bearer auth, request routing.
- `helm/*`: Helm-specific role catalog and sync behavior.
- `modules/*`: place for future unrelated bot features.

## Environment

- `DISCORD_BOT_TOKEN`: Discord bot token.
- `DISCORD_CLIENT_ID`: Discord application/client id, used for command registration.
- `DISCORD_GUILD_ID`: primary guild id to manage.
- `API_BEARER_SECRET`: shared HTTP secret. Must equal Helm's `DISCORD_BOT_SECRET`.
- `PORT`: HTTP port, default `3100`.
- `LOG_LEVEL`: optional, default `info`.

Fail fast at startup when required env vars are missing.

## Discord Bot Runtime

Create a gateway client and log in at startup.

Required intents:

- `Guilds`
- `GuildMembers`

Add other intents only when a concrete module requires them. Keep intent choices
centralized in the bot client setup.

On ready:

- Log bot username, guild id, and enabled modules.
- Fetch the configured guild and fail startup if it is unavailable.
- Register initial slash commands for the configured guild.

Initial commands:

- `/health`: replies ephemerally with bot/API health, uptime, and guild name.

Interactions:

- Route slash commands through a command registry.
- Reply ephemerally for operational/internal commands by default.
- Catch errors and send a friendly ephemeral failure response.

Events:

- Create a basic event registry.
- Wire `ready` and `interactionCreate`.
- Add a placeholder `guildMemberAdd` handler module with no business behavior yet,
  so future onboarding work has an obvious home.

## Internal HTTP API

Run Hono in the same process as the Discord bot.

All `/api/*` endpoints require:

```http
Authorization: Bearer <API_BEARER_SECRET>
```

Return `401` for missing or invalid bearer tokens.

### `GET /api/health`

Return process and Discord status:

```json
{
  "ok": true,
  "discordReady": true,
  "guildId": "123",
  "uptimeSeconds": 42
}
```

### `GET /api/guild/roles`

Return assignable guild roles for Helm:

```json
{
  "roles": [{ "id": "123", "name": "Mladi pirati" }]
}
```

Exclude:

- `@everyone`
- managed roles
- roles at or above the bot member's highest role

Use Discord.js guild role/member data when available, and fetch fresh guild data
when cache state is missing or stale.

### `POST /api/role-sync`

Request:

```json
{
  "discordUsername": "ana",
  "assignRoleIds": ["123"],
  "removeRoleIds": ["456"]
}
```

Response:

```json
{
  "userId": "789",
  "results": [
    { "roleId": "123", "action": "assign", "ok": true },
    { "roleId": "456", "action": "remove", "ok": false, "error": "Missing Permissions" }
  ]
}
```

Behavior:

- Empty `assignRoleIds` and `removeRoleIds` is valid and returns
  `{ "userId": null, "results": [] }` without Discord writes.
- Resolve the member from `discordUsername`.
- Apply each requested assign/remove independently.
- Return HTTP `200` for member-level and role-level problems; encode those as
  per-role `{ ok:false, error }` results.
- Use non-2xx only for auth, malformed JSON, invalid request shapes, startup
  misconfiguration, or unexpected server failures.

## Username Resolution

Resolve usernames in a dedicated `helm/username-resolution.ts` module.

Use Discord member search for the configured guild:

- Prefer exact case-insensitive match on `user.username`.
- Fall back to exact case-insensitive match on `member.nickname`.
- Fall back to exact case-insensitive match on `user.globalName` /
  `global_name` if available.

If zero or multiple exact matches are found, do not throw. Return HTTP `200`
with `userId: null` and one failed result for every requested role:

```json
{
  "userId": null,
  "results": [
    { "roleId": "123", "action": "assign", "ok": false, "error": "User not found in guild" }
  ]
}
```

Use the exact error string `User not found in guild` for both zero and ambiguous
matches so Helm can display a stable admin-facing message.

## Role Sync Details

Before applying a role:

- Confirm the target role exists.
- Confirm it is assignable by the bot.
- For missing/unassignable roles, return per-role failure and continue.

Apply with Discord.js member role manager:

- Assign: `guildMember.roles.add(roleId)`
- Remove: `guildMember.roles.remove(roleId)`

Operations must be idempotent:

- Assigning a role the member already has should be `ok:true`.
- Removing a role the member does not have should be `ok:true`.

Surface Discord error messages verbatim in `error` when Discord rejects an
operation. Continue processing other roles after one role fails.

## Helm Contract Shapes

Copy these zod shapes into the bot implementation and tests so Helm and the bot
cannot drift:

```ts
const guildRolesResponseSchema = z.object({
  roles: z.array(z.object({ id: z.string(), name: z.string() })),
});

const roleSyncRequestSchema = z.object({
  discordUsername: z.string(),
  assignRoleIds: z.array(z.string()),
  removeRoleIds: z.array(z.string()),
});

const roleSyncResponseSchema = z.object({
  userId: z.string().nullable(),
  results: z.array(
    z.object({
      roleId: z.string(),
      action: z.enum(["assign", "remove"]),
      ok: z.boolean(),
      error: z.string().optional(),
    }),
  ),
});
```

## Tests

Add unit tests for:

- Bearer auth rejects missing and invalid tokens.
- `GET /api/guild/roles` excludes unassignable roles.
- Empty role-sync diffs perform no Discord writes.
- Username not found returns HTTP `200` with per-role failures.
- Ambiguous username matches return the same not-found failure shape.
- Assign/remove successes return per-role successes.
- One Discord role failure does not prevent later roles from being attempted.
- `/health` reflects Discord ready state.
- Command registry routes `/health`.

Use fakes for Discord.js guild/member/role objects where practical. Keep Helm
contract tests independent from live Discord.

## Operational Notes

- Log startup, shutdown, command registration, HTTP requests, and role sync
  failures with enough context to debug, but never log bot tokens or bearer
  secrets.
- Keep all Helm API routes under `/api/*`.
- Keep future public/user-facing bot commands separate from Helm HTTP routes.
- Do not let a Helm HTTP request block the Discord interaction event loop for
  long-running future tasks; this initial role sync is small enough to run
  inline.
