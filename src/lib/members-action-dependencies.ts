import { db } from "@/db";
import { syncMemberApplicationRoles } from "@/lib/application-access-sync";
import { createDiscordBotClient } from "@/lib/discord/bot-client";
import {
  getCurrentUserHighestRoleRank,
  getHighestRoleRank,
  hasPermission,
} from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import {
  removeAllMemberDiscordRolesSafely,
  syncMemberDiscordRolesSafely,
} from "@/lib/discord/role-sync";
import { sendMembershipWelcomeEmail } from "@/lib/email/membership-approval";
import { createMembersKeycloakAdminClient } from "@/lib/members-keycloak";
import {
  memberHasActiveRole,
  roleGrantsAnyPermission,
} from "@/lib/members-query";

export {
  createDiscordBotClient,
  createMembersKeycloakAdminClient,
  db,
  getCurrentUser,
  getCurrentUserHighestRoleRank,
  getHighestRoleRank,
  hasPermission,
  memberHasActiveRole,
  removeAllMemberDiscordRolesSafely,
  roleGrantsAnyPermission,
  sendMembershipWelcomeEmail,
  syncMemberDiscordRolesSafely,
  syncMemberApplicationRoles,
};
