import {
  createDiscordBotClient,
  type DiscordGuildRole,
} from "@/lib/discord/bot-client";

export const DISCORD_GUILD_ROLES_CACHE_TTL_MS = 5 * 60 * 1000;

type DiscordGuildRolesCache = {
  expiresAt: number;
  promise?: Promise<Array<DiscordGuildRole>>;
  roles?: Array<DiscordGuildRole>;
};

const globalCache = globalThis as typeof globalThis & {
  __helmDiscordGuildRolesCache?: DiscordGuildRolesCache;
};

function cache() {
  globalCache.__helmDiscordGuildRolesCache ??= { expiresAt: 0 };
  return globalCache.__helmDiscordGuildRolesCache;
}

export async function listCachedDiscordGuildRoles({
  loadRoles = () => createDiscordBotClient().listGuildRoles(),
  now = Date.now(),
}: {
  loadRoles?: () => Promise<Array<DiscordGuildRole>>;
  now?: number;
} = {}) {
  const current = cache();
  if (current.roles && current.expiresAt > now) return current.roles;
  if (current.promise) return current.promise;

  const promise = loadRoles()
    .then((roles) => {
      current.roles = roles;
      current.expiresAt = now + DISCORD_GUILD_ROLES_CACHE_TTL_MS;
      current.promise = undefined;
      return roles;
    })
    .catch((error) => {
      current.promise = undefined;
      throw error;
    });

  current.promise = promise;
  return promise;
}

export function resetDiscordGuildRolesCacheForTests() {
  globalCache.__helmDiscordGuildRolesCache = { expiresAt: 0 };
}
