import { db } from "@/db";
import {
  getCurrentUserHighestRoleRank,
  hasPermission,
} from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { syncMemberDiscordRolesSafely } from "@/lib/discord/role-sync";
import { createMembersKeycloakAdminClient } from "@/lib/members-keycloak";
import {
  getMemberEffectiveRoleIds,
  roleGrantsAnyPermission,
} from "@/lib/members-query";

export {
  createMembersKeycloakAdminClient,
  db,
  getCurrentUser,
  getCurrentUserHighestRoleRank,
  getMemberEffectiveRoleIds,
  hasPermission,
  roleGrantsAnyPermission,
  syncMemberDiscordRolesSafely,
};
