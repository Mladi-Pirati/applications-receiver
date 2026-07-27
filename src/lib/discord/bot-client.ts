import { createDiscordBotHttpClient } from "@/lib/discord/bot-client-http";
import { createSimulatedDiscordBotClient } from "@/lib/discord/bot-client-simulated";

export type DiscordGuildRole = {
  color?: string | null;
  id: string;
  name: string;
};

export type DiscordRoleSyncRequest = {
  discordUserId?: string;
  discordUsername?: string;
  assignRoleIds: Array<string>;
  removeRoleIds: Array<string>;
};

export type DiscordRoleSyncResult = {
  roleId: string;
  action: "assign" | "remove";
  ok: boolean;
  error?: string;
};

export type DiscordRoleSyncResponse = {
  userId: string | null;
  username: string | null;
  results: Array<DiscordRoleSyncResult>;
};

export type DiscordGuildMember = {
  userId: string;
  username: string;
  displayName: string | null;
};

export type DiscordBotClient = {
  listGuildRoles(): Promise<Array<DiscordGuildRole>>;
  syncRoles(request: DiscordRoleSyncRequest): Promise<DiscordRoleSyncResponse>;
  getGuildMember(discordUserId: string): Promise<DiscordGuildMember | null>;
};

export class DiscordBotClientError extends Error {
  constructor(
    message: string,
    public readonly details: {
      body?: string;
      status?: number;
      statusText?: string;
    } = {},
  ) {
    super(message);
    this.name = "DiscordBotClientError";
  }
}

function trimOptionalValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function createDiscordBotClient(config: {
  baseUrl?: string;
  fetch?: typeof fetch;
  secret?: string;
} = {}): DiscordBotClient {
  const baseUrl = trimOptionalValue(config.baseUrl ?? process.env.DISCORD_BOT_URL);
  if (!baseUrl) return createSimulatedDiscordBotClient();

  return createDiscordBotHttpClient({
    baseUrl,
    fetch: config.fetch,
    secret: config.secret ?? process.env.DISCORD_BOT_SECRET,
  });
}
