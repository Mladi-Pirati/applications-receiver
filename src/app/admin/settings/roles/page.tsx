import { asc, eq } from "drizzle-orm";

import { ApplicationsManagement } from "@/components/admin/roles/applications-management";
import { GroupsManagement } from "@/components/admin/roles/groups-management";
import { ModulesManagement } from "@/components/admin/roles/modules-management";
import { PermissionsManagement } from "@/components/admin/roles/permissions-management";
import { RolesManagement } from "@/components/admin/roles/roles-management";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/db";
import {
  accessApplications,
  groupApplicationAccess,
  groupDiscordRoles,
  groupRoles,
  groups,
  memberApplicationAccess,
  memberGroups,
  modules,
  permissions,
  rolePermissions,
  roles,
} from "@/db/schema";
import {
  getCurrentUserHighestRoleRank,
  getCurrentUserPermissions,
  requireAnyPermission,
} from "@/lib/auth/permissions";
import { listCachedDiscordGuildRoles } from "@/lib/discord/guild-roles";

export default async function AdminRolesPage() {
  await requireAnyPermission(
    "access-control.manage_roles",
    "access-control.manage_groups",
  );
  const [{ permissions: currentPermissions }, highestManagedRank] =
    await Promise.all([
      getCurrentUserPermissions(),
      getCurrentUserHighestRoleRank(),
    ]);
  const canManageRoles = currentPermissions.includes("access-control.manage_roles");
  const canManageGroups = currentPermissions.includes(
    "access-control.manage_groups",
  );

  const modulesRows = await db
    .select({
      id: modules.id,
      key: modules.key,
      name: modules.name,
      description: modules.description,
    })
    .from(modules)
    .orderBy(asc(modules.name));

  const permissionsWithModules = await db
    .select({
      id: permissions.id,
      action: permissions.action,
      key: permissions.key,
      description: permissions.description,
      moduleId: permissions.moduleId,
      moduleName: modules.name,
    })
    .from(permissions)
    .innerJoin(modules, eq(permissions.moduleId, modules.id))
    .orderBy(modules.name, permissions.action);

  const rolesRows = await db
    .select({
      id: roles.id,
      key: roles.key,
      name: roles.name,
      description: roles.description,
      rank: roles.rank,
      isSystem: roles.isSystem,
    })
    .from(roles)
    .orderBy(asc(roles.rank));

  const applicationRows = await db
    .select({
      archivedAt: accessApplications.archivedAt,
      description: accessApplications.description,
      id: accessApplications.id,
      keycloakClientId: accessApplications.keycloakClientId,
      keycloakRoleName: accessApplications.keycloakRoleName,
      name: accessApplications.name,
    })
    .from(accessApplications)
    .orderBy(asc(accessApplications.archivedAt), asc(accessApplications.name));

  const applicationAccessRows = await db
    .select({
      applicationId: memberApplicationAccess.applicationId,
    })
    .from(memberApplicationAccess);

  const allRolePermissions = await db
    .select({
      roleId: rolePermissions.roleId,
      permissionId: rolePermissions.permissionId,
    })
    .from(rolePermissions);
  const groupRows = canManageGroups
    ? await db
        .select({
          description: groups.description,
          id: groups.id,
          name: groups.name,
        })
        .from(groups)
        .orderBy(asc(groups.name))
    : [];
  const groupRoleRows = canManageGroups
    ? await db
        .select({
          groupId: groupRoles.groupId,
          roleId: groupRoles.roleId,
        })
        .from(groupRoles)
    : [];
  const groupApplicationRows = canManageGroups
    ? await db
        .select({
          applicationId: groupApplicationAccess.applicationId,
          groupId: groupApplicationAccess.groupId,
        })
        .from(groupApplicationAccess)
    : [];
  const groupDiscordRoleRows = canManageGroups
    ? await db
        .select({
          groupId: groupDiscordRoles.groupId,
          id: groupDiscordRoles.discordRoleId,
          name: groupDiscordRoles.discordRoleName,
        })
        .from(groupDiscordRoles)
    : [];
  const memberGroupRows = canManageGroups
    ? await db.select({ groupId: memberGroups.groupId }).from(memberGroups)
    : [];
  const discordRoleOptions = canManageGroups
    ? await listCachedDiscordGuildRoles()
        .then((roles) => ({ message: null, roles }))
        .catch(() => ({
          message: "Unable to load Discord roles right now.",
          roles: [],
        }))
    : { message: null, roles: [] };

  const rolesWithPermissions = rolesRows.map((role) => ({
    ...role,
    assignedPermissionIds: allRolePermissions
      .filter((rp) => rp.roleId === role.id)
      .map((rp) => rp.permissionId),
  }));

  const permissionOptions = permissionsWithModules.map((p) => ({
    id: p.id,
    key: p.key,
    moduleName: p.moduleName,
  }));
  const assignedCountsByApplication = applicationAccessRows.reduce(
    (counts, row) => {
      counts.set(row.applicationId, (counts.get(row.applicationId) ?? 0) + 1);
      return counts;
    },
    new Map<string, number>(),
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">Access Control</h1>
        <p className="text-xs text-muted-foreground">
          Manage modules, permissions, and roles for the application.
        </p>
      </div>
      <Tabs defaultValue={canManageRoles ? "modules" : "groups"}>
        <TabsList>
          {canManageRoles ? <TabsTrigger value="modules">Modules</TabsTrigger> : null}
          {canManageRoles ? (
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
          ) : null}
          {canManageRoles ? <TabsTrigger value="roles">Roles</TabsTrigger> : null}
          {canManageRoles ? (
            <TabsTrigger value="applications">Applications</TabsTrigger>
          ) : null}
          {canManageGroups ? <TabsTrigger value="groups">Groups</TabsTrigger> : null}
        </TabsList>
        {canManageRoles ? (
          <TabsContent className="mt-4" value="modules">
            <ModulesManagement rows={modulesRows} />
          </TabsContent>
        ) : null}
        {canManageRoles ? (
          <TabsContent className="mt-4" value="permissions">
            <PermissionsManagement
              modules={modulesRows.map((m) => ({ id: m.id, name: m.name }))}
              rows={permissionsWithModules}
            />
          </TabsContent>
        ) : null}
        {canManageRoles ? (
          <TabsContent className="mt-4" value="roles">
            <RolesManagement
              highestManagedRank={highestManagedRank}
              permissions={permissionOptions}
              rows={rolesWithPermissions}
            />
          </TabsContent>
        ) : null}
        {canManageRoles ? (
          <TabsContent className="mt-4" value="applications">
            <ApplicationsManagement
              rows={applicationRows.map((row) => ({
                ...row,
                archivedAt: row.archivedAt?.toISOString() ?? null,
                assignedMemberCount:
                  assignedCountsByApplication.get(row.id) ?? 0,
              }))}
            />
          </TabsContent>
        ) : null}
        {canManageGroups ? (
          <TabsContent className="mt-4" value="groups">
            <GroupsManagement
              applicationOptions={applicationRows
                .filter((row) => !row.archivedAt)
                .map((row) => ({ id: row.id, name: row.name }))}
              discordRoleLoadMessage={discordRoleOptions.message}
              discordRoleOptions={discordRoleOptions.roles}
              groups={groupRows.map((group) => ({
                ...group,
                assignedApplicationIds: groupApplicationRows
                  .filter((row) => row.groupId === group.id)
                  .map((row) => row.applicationId),
                assignedDiscordRoles: groupDiscordRoleRows
                  .filter((row) => row.groupId === group.id)
                  .map(({ groupId: _groupId, ...row }) => row),
                assignedRoleIds: groupRoleRows
                  .filter((row) => row.groupId === group.id)
                  .map((row) => row.roleId),
                memberCount: memberGroupRows.filter(
                  (row) => row.groupId === group.id,
                ).length,
              }))}
              roleOptions={rolesRows.map((role) => ({
                id: role.id,
                name: role.name,
                rank: role.rank,
              }))}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
