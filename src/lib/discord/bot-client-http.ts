import { z } from "zod";

import {
  DiscordBotClientError,
  type DiscordBotClient,
  type DiscordRoleSyncRequest,
} from "@/lib/discord/bot-client";

const guildRolesResponseSchema = z.object({
  roles: z.array(
    z.object({
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .nullable()
        .optional(),
      id: z.string(),
      name: z.string(),
    }),
  ),
});

const roleSyncResponseSchema = z.object({
  userId: z.string().nullable(),
  username: z.string().nullable().optional(),
  results: z.array(
    z.object({
      roleId: z.string(),
      action: z.enum(["assign", "remove"]),
      ok: z.boolean(),
      error: z.string().optional(),
    }),
  ),
});

const guildMemberResponseSchema = z.object({
  found: z.boolean(),
  member: z
    .object({
      userId: z.string(),
      username: z.string(),
      displayName: z.string().nullable().optional(),
    })
    .optional(),
});

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

async function readErrorBody(response: Response) {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return undefined;
  }
}

async function parseJsonResponse<T>(
  response: Response,
  parser: z.ZodType<T>,
  path: string,
) {
  if (!response.ok) {
    throw new DiscordBotClientError(
      `Discord bot request to ${path} failed with ${response.status}.`,
      {
        body: await readErrorBody(response),
        status: response.status,
        statusText: response.statusText,
      },
    );
  }

  try {
    return parser.parse(await response.json());
  } catch (error) {
    throw new DiscordBotClientError(
      `Discord bot response from ${path} had an unexpected shape.`,
      { body: error instanceof Error ? error.message : String(error) },
    );
  }
}

export function createDiscordBotHttpClient(config: {
  baseUrl: string;
  fetch?: typeof fetch;
  secret?: string;
}): DiscordBotClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const fetchImplementation = config.fetch ?? fetch;
  const secret = config.secret?.trim();
  const headers: Record<string, string> = secret
    ? { Authorization: `Bearer ${secret}` }
    : {};

  return {
    async listGuildRoles() {
      const path = "/api/guild/roles";
      const response = await fetchImplementation(`${baseUrl}${path}`, {
        headers,
      });
      const parsed = await parseJsonResponse(
        response,
        guildRolesResponseSchema,
        path,
      );
      return parsed.roles;
    },
    async syncRoles(request: DiscordRoleSyncRequest) {
      if (!request.assignRoleIds.length && !request.removeRoleIds.length) {
        return { results: [], userId: null, username: null };
      }

      const path = "/api/role-sync";
      const response = await fetchImplementation(`${baseUrl}${path}`, {
        body: JSON.stringify(request),
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const parsed = await parseJsonResponse(
        response,
        roleSyncResponseSchema,
        path,
      );
      return {
        results: parsed.results,
        userId: parsed.userId,
        username: parsed.username ?? null,
      };
    },
    async getGuildMember(discordUserId: string) {
      const path = `/api/guild/members/${encodeURIComponent(discordUserId)}`;
      const response = await fetchImplementation(`${baseUrl}${path}`, {
        headers,
      });
      const parsed = await parseJsonResponse(
        response,
        guildMemberResponseSchema,
        path,
      );
      if (!parsed.found || !parsed.member) return null;
      return {
        displayName: parsed.member.displayName ?? null,
        userId: parsed.member.userId,
        username: parsed.member.username,
      };
    },
  };
}
