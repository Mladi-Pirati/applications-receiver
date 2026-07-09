import type {
  DiscordBotClient,
  DiscordGuildRole,
  DiscordRoleSyncRequest,
  DiscordRoleSyncResult,
} from "@/lib/discord/bot-client";

const SIMULATED_ROLES: Array<DiscordGuildRole> = [
  { color: "#2ecc71", id: "sim-member", name: "Mladi pirati" },
  { color: "#3498db", id: "sim-onboarding", name: "Onboarding" },
  { color: "#9b59b6", id: "sim-board", name: "Board" },
];

const NOT_IN_GUILD_USERNAME = "not.in.guild";
// Simulated ids ending in 404 behave as accounts that are not in the guild.
const NOT_IN_GUILD_ID_SUFFIX = "404";

type SimulatedDiscordBotState = {
  memberRolesByUserId: Map<string, Set<string>>;
};

const globalState = globalThis as typeof globalThis & {
  __helmSimulatedDiscordBotState?: SimulatedDiscordBotState;
};

function getState() {
  globalState.__helmSimulatedDiscordBotState ??= {
    memberRolesByUserId: new Map(),
  };
  return globalState.__helmSimulatedDiscordBotState;
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function hashUsername(username: string, seed: number) {
  let hash = seed;
  for (const character of username) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function simulatedUserIdForUsername(username: string) {
  const normalized = normalizeUsername(username);
  const high = String(hashUsername(normalized, 7)).padStart(8, "0").slice(-8);
  const low = String(hashUsername(normalized, 31)).padStart(9, "0").slice(-9);
  return `9${high}${low}`;
}

function simulatedUsernameForUserId(userId: string) {
  return `simulated-user-${userId.slice(-4)}`;
}

function isSimulatedUserIdInGuild(userId: string) {
  return !userId.endsWith(NOT_IN_GUILD_ID_SUFFIX);
}

function createUserNotFoundResult(
  request: DiscordRoleSyncRequest,
): Array<DiscordRoleSyncResult> {
  return [
    ...request.assignRoleIds.map((roleId) => ({
      action: "assign" as const,
      error: "User not found in guild",
      ok: false,
      roleId,
    })),
    ...request.removeRoleIds.map((roleId) => ({
      action: "remove" as const,
      error: "User not found in guild",
      ok: false,
      roleId,
    })),
  ];
}

export function resetSimulatedDiscordBotState() {
  globalState.__helmSimulatedDiscordBotState = {
    memberRolesByUserId: new Map(),
  };
}

export function createSimulatedDiscordBotClient(): DiscordBotClient {
  return {
    async listGuildRoles() {
      console.info("[discord-bot-simulated]", {
        message: "Returning simulated Discord guild roles.",
      });
      return SIMULATED_ROLES;
    },
    async syncRoles(request) {
      const username = request.discordUsername?.trim() ?? null;
      const userId =
        request.discordUserId ??
        (username ? simulatedUserIdForUsername(username) : null);
      console.info("[discord-bot-simulated]", {
        assignRoleIds: request.assignRoleIds,
        message: "Applying simulated Discord role sync.",
        removeRoleIds: request.removeRoleIds,
        userId,
        username,
      });

      const notInGuild =
        !userId ||
        (request.discordUserId
          ? !isSimulatedUserIdInGuild(request.discordUserId)
          : normalizeUsername(username ?? "") === NOT_IN_GUILD_USERNAME);
      if (notInGuild) {
        return {
          results: createUserNotFoundResult(request),
          userId: null,
          username: null,
        };
      }

      const state = getState();
      const roles = state.memberRolesByUserId.get(userId) ?? new Set<string>();
      for (const roleId of request.assignRoleIds) roles.add(roleId);
      for (const roleId of request.removeRoleIds) roles.delete(roleId);
      state.memberRolesByUserId.set(userId, roles);

      return {
        results: [
          ...request.assignRoleIds.map((roleId) => ({
            action: "assign" as const,
            ok: true,
            roleId,
          })),
          ...request.removeRoleIds.map((roleId) => ({
            action: "remove" as const,
            ok: true,
            roleId,
          })),
        ],
        userId,
        username: request.discordUserId
          ? simulatedUsernameForUserId(request.discordUserId)
          : username,
      };
    },
    async getGuildMember(discordUserId) {
      if (!isSimulatedUserIdInGuild(discordUserId)) return null;
      return {
        displayName: null,
        userId: discordUserId,
        username: simulatedUsernameForUserId(discordUserId),
      };
    },
  };
}
