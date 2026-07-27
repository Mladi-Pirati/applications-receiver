import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { membershipApplicationStatuses } from "@/lib/membership-applications";

export type { MembershipApplicationStatus } from "@/lib/membership-applications";

export const MEMBERSHIP_APPLICATION_STATUSES = membershipApplicationStatuses;

export const membershipApplicationStatusEnum = pgEnum(
  "membership_application_status",
  MEMBERSHIP_APPLICATION_STATUSES,
);

export const MEMBER_CREATION_STATUSES = ["success", "fail"] as const;
export type MemberCreationStatus = (typeof MEMBER_CREATION_STATUSES)[number];
export const memberCreationStatusEnum = pgEnum(
  "member_creation_status",
  MEMBER_CREATION_STATUSES,
);

export const ADDRESS_LABELS = [
  "primary",
  "temporary",
  "work",
  "other",
] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

export const CONTACT_TYPES = [
  "phone",
  "email",
  "instagram",
  "tiktok",
  "twitter",
  "discord",
  "website",
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const ROLE_KEYS = ["superadmin"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const DISCORD_ROLE_SYNC_STATUSES = [
  "assigned",
  "failed",
  "removed",
] as const;
export type DiscordRoleSyncStatus = (typeof DISCORD_ROLE_SYNC_STATUSES)[number];

export const addressLabelEnum = pgEnum("address_label", ADDRESS_LABELS);
export const contactTypeEnum = pgEnum("contact_type", CONTACT_TYPES);
export const discordRoleSyncStatusEnum = pgEnum(
  "discord_role_sync_status",
  DISCORD_ROLE_SYNC_STATUSES,
);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

export const mladiPiratiMembershipApplications = pgTable(
  "mladi_pirati_membership_applications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    fullLegalName: text("full_legal_name").notNull(),
    dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
    placeOfBirth: text("place_of_birth").notNull(),
    streetAddress: text("street_address").notNull(),
    cityAndPostalCode: text("city_and_postal_code").notNull(),
    residenceRegion: text("residence_region").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    discordUsername: text("discord_username"),
    motivation: text("motivation"),
    consentsToDataProcessing: boolean("consents_to_data_processing").notNull(),
    acceptsStatuteAndProgram: boolean("accepts_statute_and_program").notNull(),
    status: membershipApplicationStatusEnum("status")
      .notNull()
      .default("pending"),
    rejectionReason: text("rejection_reason"),
    memberCreationStatus: memberCreationStatusEnum("member_creation_status"),
    rawPayload: jsonb("raw_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
);

export const members = pgTable(
  "members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    fullLegalName: text("full_legal_name").notNull(),
    username: text("username").notNull(),
    keycloakId: text("keycloak_id").notNull(),
    notes: text("notes"),
    disabledAt: timestamp("disabled_at", { withTimezone: true, mode: "date" }),
    applicationId: text("application_id"),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    placeOfBirth: text("place_of_birth"),
    residenceRegion: text("residence_region"),
    discordUserId: text("discord_user_id"),
    profilePictureVersion: text("profile_picture_version"),
    profilePictureBlurhash: text("profile_picture_blurhash"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("members_keycloak_id_unique").on(table.keycloakId),
    uniqueIndex("members_discord_user_id_unique").on(table.discordUserId),
    foreignKey({
      columns: [table.applicationId],
      foreignColumns: [mladiPiratiMembershipApplications.id],
      name: "members_application_id_membership_applications_id_fk",
    }).onDelete("set null"),
  ],
);

export const addresses = pgTable(
  "addresses",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    memberId: text("member_id").notNull(),
    label: addressLabelEnum("label").notNull(),
    street: text("street").notNull(),
    city: text("city").notNull(),
    postalCode: text("postal_code").notNull(),
    country: text("country").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.memberId],
      foreignColumns: [members.id],
      name: "addresses_member_id_members_id_fk",
    }).onDelete("cascade"),
    index("addresses_member_id_idx").on(table.memberId),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    memberId: text("member_id").notNull(),
    type: contactTypeEnum("type").notNull(),
    value: text("value").notNull(),
    label: text("label"),
    isPrimary: boolean("is_primary").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.memberId],
      foreignColumns: [members.id],
      name: "contacts_member_id_members_id_fk",
    }).onDelete("cascade"),
    index("contacts_member_id_idx").on(table.memberId),
    uniqueIndex("contacts_sort_order_unique").on(
      table.memberId,
      table.sortOrder,
    ),
  ],
);

export const membersRelations = relations(members, ({ many }) => ({
  addresses: many(addresses),
  contacts: many(contacts),
}));

export const addressesRelations = relations(addresses, ({ one }) => ({
  member: one(members, {
    fields: [addresses.memberId],
    references: [members.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  member: one(members, {
    fields: [contacts.memberId],
    references: [members.id],
  }),
}));

export const memberships = pgTable(
  "memberships",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    memberId: text("member_id").notNull(),
    extendedAt: timestamp("extended_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    endedAt: timestamp("ended_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.memberId],
      foreignColumns: [members.id],
      name: "memberships_member_id_members_id_fk",
    }).onDelete("cascade"),
    index("memberships_member_id_idx").on(table.memberId),
  ],
);

export const modules = pgTable("modules", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

export const permissions = pgTable(
  "permissions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    moduleId: text("module_id").notNull(),
    action: text("action").notNull(),
    key: text("key").notNull().unique(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.moduleId],
      foreignColumns: [modules.id],
      name: "permissions_module_id_modules_id_fk",
    }).onDelete("cascade"),
    uniqueIndex("permissions_module_id_action_unique").on(
      table.moduleId,
      table.action,
    ),
  ],
);

export const roles = pgTable("roles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  rank: integer("rank").notNull().unique(),
  isSystem: boolean("is_system").notNull().default(false),
  ...timestamps,
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: text("role_id").notNull(),
    permissionId: text("permission_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.roleId, table.permissionId],
      name: "role_permissions_pkey",
    }),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [roles.id],
      name: "role_permissions_role_id_roles_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.permissionId],
      foreignColumns: [permissions.id],
      name: "role_permissions_permission_id_permissions_id_fk",
    }).onDelete("cascade"),
  ],
);

export const memberRoles = pgTable(
  "member_roles",
  {
    memberId: text("member_id").notNull(),
    roleId: text("role_id").notNull(),
    grantedBy: text("granted_by"),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.memberId, table.roleId],
      name: "member_roles_pkey",
    }),
    foreignKey({
      columns: [table.memberId],
      foreignColumns: [members.id],
      name: "member_roles_member_id_members_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [roles.id],
      name: "member_roles_role_id_roles_id_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.grantedBy],
      foreignColumns: [members.id],
      name: "member_roles_granted_by_members_id_fk",
    }).onDelete("set null"),
  ],
);

export const groups = pgTable(
  "groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("groups_name_lower_unique").on(sql`lower(${table.name})`),
  ],
);

export const groupRoles = pgTable(
  "group_roles",
  {
    groupId: text("group_id").notNull(),
    roleId: text("role_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.groupId, table.roleId],
      name: "group_roles_pkey",
    }),
    foreignKey({
      columns: [table.groupId],
      foreignColumns: [groups.id],
      name: "group_roles_group_id_groups_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [roles.id],
      name: "group_roles_role_id_roles_id_fk",
    }).onDelete("cascade"),
  ],
);

export const accessApplications = pgTable(
  "access_applications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    description: text("description"),
    keycloakClientId: text("keycloak_client_id").notNull(),
    keycloakRoleName: text("keycloak_role_name").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("access_applications_active_name_unique")
      .on(table.name)
      .where(sql`${table.archivedAt} is null`),
    uniqueIndex("access_applications_active_keycloak_role_unique")
      .on(table.keycloakClientId, table.keycloakRoleName)
      .where(sql`${table.archivedAt} is null`),
  ],
);

export const groupApplicationAccess = pgTable(
  "group_application_access",
  {
    groupId: text("group_id").notNull(),
    applicationId: text("application_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.groupId, table.applicationId],
      name: "group_application_access_pkey",
    }),
    foreignKey({
      columns: [table.groupId],
      foreignColumns: [groups.id],
      name: "group_application_access_group_id_groups_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.applicationId],
      foreignColumns: [accessApplications.id],
      name: "group_application_access_application_id_access_applications_id_fk",
    }).onDelete("cascade"),
  ],
);

export const groupDiscordRoles = pgTable(
  "group_discord_roles",
  {
    groupId: text("group_id").notNull(),
    discordRoleId: text("discord_role_id").notNull(),
    discordRoleName: text("discord_role_name").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.groupId, table.discordRoleId],
      name: "group_discord_roles_pkey",
    }),
    foreignKey({
      columns: [table.groupId],
      foreignColumns: [groups.id],
      name: "group_discord_roles_group_id_groups_id_fk",
    }).onDelete("cascade"),
  ],
);

export const memberGroups = pgTable(
  "member_groups",
  {
    memberId: text("member_id").notNull(),
    groupId: text("group_id").notNull(),
    grantedBy: text("granted_by"),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.memberId, table.groupId],
      name: "member_groups_pkey",
    }),
    foreignKey({
      columns: [table.memberId],
      foreignColumns: [members.id],
      name: "member_groups_member_id_members_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.groupId],
      foreignColumns: [groups.id],
      name: "member_groups_group_id_groups_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.grantedBy],
      foreignColumns: [members.id],
      name: "member_groups_granted_by_members_id_fk",
    }).onDelete("set null"),
  ],
);

export const memberApplicationAccess = pgTable(
  "member_application_access",
  {
    memberId: text("member_id").notNull(),
    applicationId: text("application_id").notNull(),
    grantedBy: text("granted_by"),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.memberId, table.applicationId],
      name: "member_application_access_pkey",
    }),
    foreignKey({
      columns: [table.memberId],
      foreignColumns: [members.id],
      name: "member_application_access_member_id_members_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.applicationId],
      foreignColumns: [accessApplications.id],
      name: "member_application_access_application_id_access_applications_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.grantedBy],
      foreignColumns: [members.id],
      name: "member_application_access_granted_by_members_id_fk",
    }).onDelete("set null"),
    index("member_application_access_application_id_idx").on(
      table.applicationId,
    ),
  ],
);

export const onboardingDefaultApplicationAccess = pgTable(
  "onboarding_default_application_access",
  {
    applicationId: text("application_id").primaryKey().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.applicationId],
      foreignColumns: [accessApplications.id],
      name: "onboarding_default_application_access_application_id_access_applications_id_fk",
    }).onDelete("cascade"),
  ],
);

export const onboardingDefaultDiscordRoles = pgTable(
  "onboarding_default_discord_roles",
  {
    discordRoleId: text("discord_role_id").primaryKey().notNull(),
    discordRoleName: text("discord_role_name").notNull(),
  },
);

export const memberDiscordRoles = pgTable(
  "member_discord_roles",
  {
    memberId: text("member_id").notNull(),
    discordRoleId: text("discord_role_id").notNull(),
    discordRoleName: text("discord_role_name").notNull(),
    source: text("source").notNull().default("onboarding"),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.memberId, table.discordRoleId],
      name: "member_discord_roles_pkey",
    }),
    foreignKey({
      columns: [table.memberId],
      foreignColumns: [members.id],
      name: "member_discord_roles_member_id_members_id_fk",
    }).onDelete("cascade"),
  ],
);

export const memberDiscordRoleSyncs = pgTable(
  "member_discord_role_syncs",
  {
    memberId: text("member_id").notNull(),
    discordRoleId: text("discord_role_id").notNull(),
    discordRoleName: text("discord_role_name").notNull(),
    status: discordRoleSyncStatusEnum("status").notNull(),
    errorMessage: text("error_message"),
    syncedAt: timestamp("synced_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.memberId, table.discordRoleId],
      name: "member_discord_role_syncs_pkey",
    }),
    foreignKey({
      columns: [table.memberId],
      foreignColumns: [members.id],
      name: "member_discord_role_syncs_member_id_members_id_fk",
    }).onDelete("cascade"),
  ],
);

export const discordLinkTokens = pgTable(
  "discord_link_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    memberId: text("member_id").notNull(),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.memberId],
      foreignColumns: [members.id],
      name: "discord_link_tokens_member_id_members_id_fk",
    }).onDelete("cascade"),
    index("discord_link_tokens_member_id_idx").on(table.memberId),
    uniqueIndex("discord_link_tokens_token_unique").on(table.token),
  ],
);
export const newsletters = pgTable(
  "newsletters",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("newsletters_slug_unique").on(sql`lower(${table.slug})`),
  ],
);

export const newsletterSubscriptions = pgTable(
  "newsletter_subscriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    newsletterId: text("newsletter_id").notNull(),
    email: text("email").notNull(),
    rawPayload: jsonb("raw_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.newsletterId],
      foreignColumns: [newsletters.id],
      name: "newsletter_subscriptions_newsletter_id_newsletters_id_fk",
    }).onDelete("cascade"),
    uniqueIndex("newsletter_subscriptions_email_unique").on(
      table.newsletterId,
      sql`lower(${table.email})`,
    ),
    index("newsletter_subscriptions_newsletter_id_idx").on(table.newsletterId),
  ],
);

export const apiRateLimitWindows = pgTable(
  "api_rate_limit_windows",
  {
    scope: text("scope").notNull(),
    identifierHash: text("identifier_hash").notNull(),
    windowStart: timestamp("window_start", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    count: integer("count").notNull().default(1),
  },
  (table) => [
    primaryKey({
      columns: [table.scope, table.identifierHash, table.windowStart],
      name: "api_rate_limit_windows_pkey",
    }),
    index("api_rate_limit_windows_expires_at_idx").on(table.expiresAt),
  ],
);

export type MembershipApplication =
  typeof mladiPiratiMembershipApplications.$inferSelect;
export type NewMembershipApplication =
  typeof mladiPiratiMembershipApplications.$inferInsert;
export type Newsletter = typeof newsletters.$inferSelect;
export type NewNewsletter = typeof newsletters.$inferInsert;
export type NewsletterSubscription =
  typeof newsletterSubscriptions.$inferSelect;
export type NewNewsletterSubscription =
  typeof newsletterSubscriptions.$inferInsert;
export type ApiRateLimitWindow = typeof apiRateLimitWindows.$inferSelect;
export type NewApiRateLimitWindow = typeof apiRateLimitWindows.$inferInsert;

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type Module = typeof modules.$inferSelect;
export type NewModule = typeof modules.$inferInsert;
export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
export type MemberRole = typeof memberRoles.$inferSelect;
export type NewMemberRole = typeof memberRoles.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupRole = typeof groupRoles.$inferSelect;
export type NewGroupRole = typeof groupRoles.$inferInsert;
export type GroupApplicationAccess = typeof groupApplicationAccess.$inferSelect;
export type NewGroupApplicationAccess =
  typeof groupApplicationAccess.$inferInsert;
export type GroupDiscordRole = typeof groupDiscordRoles.$inferSelect;
export type NewGroupDiscordRole = typeof groupDiscordRoles.$inferInsert;
export type MemberGroup = typeof memberGroups.$inferSelect;
export type NewMemberGroup = typeof memberGroups.$inferInsert;
export type AccessApplication = typeof accessApplications.$inferSelect;
export type NewAccessApplication = typeof accessApplications.$inferInsert;
export type MemberApplicationAccess =
  typeof memberApplicationAccess.$inferSelect;
export type NewMemberApplicationAccess =
  typeof memberApplicationAccess.$inferInsert;
export type OnboardingDefaultApplicationAccess =
  typeof onboardingDefaultApplicationAccess.$inferSelect;
export type NewOnboardingDefaultApplicationAccess =
  typeof onboardingDefaultApplicationAccess.$inferInsert;
export type OnboardingDefaultDiscordRole =
  typeof onboardingDefaultDiscordRoles.$inferSelect;
export type NewOnboardingDefaultDiscordRole =
  typeof onboardingDefaultDiscordRoles.$inferInsert;
export type MemberDiscordRole = typeof memberDiscordRoles.$inferSelect;
export type NewMemberDiscordRole = typeof memberDiscordRoles.$inferInsert;
export type MemberDiscordRoleSync = typeof memberDiscordRoleSyncs.$inferSelect;
export type NewMemberDiscordRoleSync =
  typeof memberDiscordRoleSyncs.$inferInsert;
export type DiscordLinkToken = typeof discordLinkTokens.$inferSelect;
export type NewDiscordLinkToken = typeof discordLinkTokens.$inferInsert;
