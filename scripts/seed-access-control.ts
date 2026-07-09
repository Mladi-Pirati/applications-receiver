import "dotenv/config";

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  accessApplications,
  modules,
  permissions,
  roles,
  rolePermissions,
} from "@/db/schema";

async function seed() {
  // Seed modules
  await db
    .insert(modules)
    .values([
      { key: "access-control", name: "Access Control" },
      { key: "members", name: "Members" },
      { key: "newsletters", name: "Newsletters" },
    ])
    .onConflictDoUpdate({
      target: modules.key,
      set: { name: sql`excluded.name` },
    });

  // Fetch module IDs
  const mAccessControl = await db.query.modules.findFirst({
    where: eq(modules.key, "access-control"),
  });
  const mMembers = await db.query.modules.findFirst({
    where: eq(modules.key, "members"),
  });
  const mNewsletters = await db.query.modules.findFirst({
    where: eq(modules.key, "newsletters"),
  });

  if (!mAccessControl || !mMembers || !mNewsletters) {
    throw new Error("Failed to fetch seeded modules");
  }

  // Seed permissions
  const permDefs = [
    {
      moduleId: mAccessControl.id,
      key: "access-control.manage_groups",
      action: "manage_groups",
      description: "Group management",
    },
    {
      moduleId: mAccessControl.id,
      key: "access-control.manage_modules",
      action: "manage_modules",
      description: "Module management",
    },
    {
      moduleId: mAccessControl.id,
      key: "access-control.manage_permissions",
      action: "manage_permissions",
      description: "Manage permissions",
    },
    {
      moduleId: mAccessControl.id,
      key: "access-control.manage_roles",
      action: "manage_roles",
      description: "Role management",
    },
    {
      moduleId: mMembers.id,
      key: "members.create",
      action: "create",
      description: "Create a new member",
    },
    {
      moduleId: mMembers.id,
      key: "members.delete",
      action: "delete",
      description: "Delete members",
    },
    {
      moduleId: mMembers.id,
      key: "members.manage_onboarding",
      action: "manage_onboarding",
      description: "Manage onboarding defaults",
    },
    {
      moduleId: mMembers.id,
      key: "members.read",
      action: "read",
      description: "View members and their data",
    },
    {
      moduleId: mMembers.id,
      key: "members.role_management",
      action: "role_management",
      description: "Manage roles of other users",
    },
    {
      moduleId: mMembers.id,
      key: "members.update",
      action: "update",
      description: "Update member information",
    },
    {
      moduleId: mNewsletters.id,
      key: "newsletters.create",
      action: "create",
      description: "Create new newsletters",
    },
    {
      moduleId: mNewsletters.id,
      key: "newsletters.delete",
      action: "delete",
      description: "Delete newsletters",
    },
    {
      moduleId: mNewsletters.id,
      key: "newsletters.read",
      action: "read",
      description: "View newsletters and their entries",
    },
    {
      moduleId: mNewsletters.id,
      key: "newsletters.update",
      action: "update",
      description: "Update the newsletters and subscribers",
    },
  ];

  for (const permDef of permDefs) {
    await db
      .insert(permissions)
      .values(permDef)
      .onConflictDoUpdate({
        target: permissions.key,
        set: { description: sql`excluded.description` },
      });
  }

  // Seed Super Admin role
  await db
    .insert(roles)
    .values({
      key: "superadmin",
      name: "Super Admin",
      rank: 420,
      isSystem: true,
    })
    .onConflictDoNothing({ target: roles.key });

  const superadminRole = await db.query.roles.findFirst({
    where: eq(roles.key, "superadmin"),
  });
  if (!superadminRole) {
    throw new Error("Failed to fetch superadmin role");
  }

  const allPerms = await db.select({ id: permissions.id }).from(permissions);

  for (const perm of allPerms) {
    await db
      .insert(rolePermissions)
      .values({ roleId: superadminRole.id, permissionId: perm.id })
      .onConflictDoNothing();
  }

  // Seed applications
  await db
    .insert(accessApplications)
    .values([
      {
        name: "Penpot",
        description: "Open source and self hosted alternative to Figma",
        keycloakClientId: "penpot",
        keycloakRoleName: "user",
      },
      {
        name: "Garage",
        description:
          "Our self hosted S3 solution UI panel. Should only be granted when absolutely necessary, otherwise controlled via access keys.",
        keycloakClientId: "garage",
        keycloakRoleName: "admin",
      },
      {
        name: "Piratski Wiki",
        description: "Wiki glavne stranke",
        keycloakClientId: "wiki-pirati",
        keycloakRoleName: "user",
      },
    ])
    .onConflictDoNothing();

  console.log("Seed complete!");
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
