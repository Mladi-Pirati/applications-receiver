"use client";

import { useState, useTransition } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import { GripVerticalIcon, LockIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { reorderRolesAction } from "@/actions/roles";
import { AddRoleSheet } from "@/components/admin/roles/add-role-sheet";
import { DeleteRoleDialog } from "@/components/admin/roles/delete-role-dialog";
import { EditRoleSheet } from "@/components/admin/roles/edit-role-sheet";
import { RolePermissionsSheet } from "@/components/admin/roles/role-permissions-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type RoleListRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  rank: number;
  isSystem: boolean;
  assignedPermissionIds: Array<string>;
};

export type RolePermissionOption = {
  id: string;
  key: string;
  moduleName: string;
};

function RoleRows({
  highestManagedRank,
  rows,
  permissions,
}: {
  highestManagedRank: number | null;
  rows: Array<RoleListRow>;
  permissions: Array<RolePermissionOption>;
}) {
  if (!rows.length) {
    return (
      <div className="flex h-32 items-center justify-center px-4 text-center text-xs text-muted-foreground">
        No roles found.
      </div>
    );
  }

  return (
    <div className="divide-y">
      {rows.map((row, index) => (
        <SortableRoleRow
          highestManagedRank={highestManagedRank}
          index={index}
          key={row.id}
          permissions={permissions}
          role={row}
        />
      ))}
    </div>
  );
}

function SortableRoleRow({
  highestManagedRank,
  index,
  permissions,
  role,
}: {
  highestManagedRank: number | null;
  index: number;
  permissions: Array<RolePermissionOption>;
  role: RoleListRow;
}) {
  const isLocked = highestManagedRank === null || role.rank <= highestManagedRank;
  const { handleRef, ref, isDragging } = useSortable({
    disabled: isLocked,
    id: role.id,
    index,
  });

  return (
    <div
      className={cn(
        "grid gap-3 p-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center",
        isDragging && "opacity-60",
      )}
      data-draggable={!isLocked}
      ref={ref}
    >
      {isLocked ? (
        <div
          className="flex size-8 items-center justify-center border text-muted-foreground"
          title="Locked by your highest role"
        >
          <LockIcon className="size-4" />
        </div>
      ) : (
        <Button
          className="size-8 border"
          ref={handleRef}
          size="icon"
          title="Drag to change priority"
          type="button"
          variant="ghost"
        >
          <GripVerticalIcon className="size-4" />
        </Button>
      )}
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{role.name}</span>
          {role.isSystem ? <Badge variant="outline">System</Badge> : null}
          {isLocked ? <Badge variant="outline">Locked</Badge> : null}
          <span className="text-xs text-muted-foreground">
            Priority {role.rank}
          </span>
        </div>
        {role.description ? (
          <p className="text-xs text-muted-foreground">{role.description}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <RolePermissionsSheet
          assignedPermissionIds={role.assignedPermissionIds}
          permissions={permissions}
          role={role}
        />
        <EditRoleSheet role={role} />
        <DeleteRoleDialog role={role} />
      </div>
    </div>
  );
}

function applyVisualRanks(rows: Array<RoleListRow>) {
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function RolesManagement({
  highestManagedRank,
  rows,
  permissions,
}: {
  highestManagedRank: number | null;
  rows: Array<RoleListRow>;
  permissions: Array<RolePermissionOption>;
}) {
  const router = useRouter();
  const [rolesState, setRolesState] = useState(rows);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function isRoleOrderAllowed(nextRows: Array<RoleListRow>) {
    const lockedRoleIds = rolesState
      .filter(
        (role) =>
          highestManagedRank === null || role.rank <= highestManagedRank,
      )
      .map((role) => role.id);

    return lockedRoleIds.every((roleId, index) => nextRows[index]?.id === roleId);
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold">Roles</h2>
          <p className="text-xs text-muted-foreground">
            Roles define access levels. Assign permissions to control what each
            role can do.
          </p>
        </div>
        <AddRoleSheet />
      </div>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>All roles</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <DragDropProvider
            onDragEnd={(event) => {
              if (event.canceled) return;
              const previousRows = rolesState;
              const nextRows = move(rolesState, event) as Array<RoleListRow>;

              if (!isRoleOrderAllowed(nextRows)) {
                setMessage("You cannot move roles above your highest role.");
                return;
              }

              const rerankedRows = applyVisualRanks(nextRows);
              setRolesState(rerankedRows);
              setMessage(null);
              startTransition(async () => {
                const result = await reorderRolesAction(
                  rerankedRows.map((role) => role.id),
                );
                setMessage(result.message ?? null);
                if (!result.ok) {
                  setRolesState(previousRows);
                  return;
                }
                router.refresh();
              });
            }}
          >
            <RoleRows
              highestManagedRank={highestManagedRank}
              permissions={permissions}
              rows={rolesState}
            />
          </DragDropProvider>
          {message ? (
            <div className="border-t px-4 py-3 text-xs font-medium text-muted-foreground">
              {message}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
