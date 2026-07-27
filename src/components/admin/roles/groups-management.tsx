"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";

import {
  createGroupAction,
  deleteGroupAction,
  setGroupApplicationsAction,
  setGroupDiscordRolesAction,
  setGroupRolesAction,
  updateGroupAction,
} from "@/actions/groups";
import {
  DiscordRoleCombobox,
  mergeDiscordRoleOptions,
  type DiscordRoleOption,
} from "@/components/admin/discord-role-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type RoleOption = { id: string; name: string; rank: number };
type ApplicationOption = { id: string; name: string };
type GroupRow = {
  assignedApplicationIds: Array<string>;
  assignedDiscordRoles: Array<DiscordRoleOption>;
  assignedRoleIds: Array<string>;
  description: string | null;
  id: string;
  memberCount: number;
  name: string;
};

function toggleId(values: Array<string>, id: string, checked: boolean) {
  return checked
    ? [...new Set([...values, id])]
    : values.filter((value) => value !== id);
}

export function GroupsManagement({
  applicationOptions,
  discordRoleLoadMessage,
  discordRoleOptions,
  groups,
  roleOptions,
}: {
  applicationOptions: Array<ApplicationOption>;
  discordRoleLoadMessage?: string | null;
  discordRoleOptions: Array<DiscordRoleOption>;
  groups: Array<GroupRow>;
  roleOptions: Array<RoleOption>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const discordOptions = React.useMemo(
    () =>
      mergeDiscordRoleOptions(
        groups.flatMap((group) => group.assignedDiscordRoles),
        discordRoleOptions,
      ),
    [discordRoleOptions, groups],
  );
  const [isPending, startTransition] = useTransition();

  function createGroup() {
    setMessage(null);
    startTransition(async () => {
      const result = await createGroupAction({ description, name });
      setMessage(result.message ?? null);
      if (result.ok) {
        setName("");
        setDescription("");
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Create group</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input
            onChange={(event) => setName(event.target.value)}
            placeholder="Group name"
            value={name}
          />
          <Input
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
            value={description}
          />
          <Button disabled={isPending} onClick={createGroup} type="button">
            <PlusIcon />
            Create
          </Button>
        </CardContent>
      </Card>

      {message || discordRoleLoadMessage ? (
        <div className="flex items-center gap-3">
          {message ? (
            <p className="text-xs text-muted-foreground">{message}</p>
          ) : null}
          {discordRoleLoadMessage ? (
            <p className="text-xs text-muted-foreground">
              {discordRoleLoadMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      {groups.map((group) => (
        <GroupCard
          applicationOptions={applicationOptions}
          discordOptions={discordOptions}
          group={group}
          key={group.id}
          roleOptions={roleOptions}
        />
      ))}
    </div>
  );
}

function GroupCard({
  applicationOptions,
  discordOptions,
  group,
  roleOptions,
}: {
  applicationOptions: Array<ApplicationOption>;
  discordOptions: Array<DiscordRoleOption>;
  group: GroupRow;
  roleOptions: Array<RoleOption>;
}) {
  const router = useRouter();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [roleIds, setRoleIds] = useState(group.assignedRoleIds);
  const [applicationIds, setApplicationIds] = useState(
    group.assignedApplicationIds,
  );
  const [discordRoles, setDiscordRoles] = useState(group.assignedDiscordRoles);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.message ?? null);
      if (result.ok) router.refresh();
    });
  }

  function saveGroup() {
    setMessage(null);
    startTransition(async () => {
      const groupResult = await updateGroupAction(group.id, { description, name });
      if (!groupResult.ok) {
        setMessage(groupResult.message);
        return;
      }

      const rolesResult = await setGroupRolesAction(group.id, roleIds);
      if (!rolesResult.ok) {
        setMessage(rolesResult.message);
        return;
      }

      const applicationsResult = await setGroupApplicationsAction(
        group.id,
        applicationIds,
      );
      if (!applicationsResult.ok) {
        setMessage(applicationsResult.message);
        return;
      }

      const discordRolesResult = await setGroupDiscordRolesAction(
        group.id,
        discordRoles,
      );
      if (!discordRolesResult.ok) {
        setMessage(discordRolesResult.message);
        return;
      }

      setMessage("Group saved.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{group.name}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{group.memberCount} members</Badge>
            <Button
              disabled={isPending}
              onClick={saveGroup}
              size="sm"
              type="button"
              variant="outline"
            >
              <SaveIcon />
              Save group
            </Button>
            <Button
              disabled={isPending}
              onClick={() => run(() => deleteGroupAction(group.id))}
              size="sm"
              type="button"
              variant="destructive"
            >
              <Trash2Icon />
              Delete
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <Textarea
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </div>

        <AssignmentGrid
          items={roleOptions}
          selectedIds={roleIds}
          title="Roles"
          onToggle={(id, checked) => setRoleIds((current) => toggleId(current, id, checked))}
        />

        <AssignmentGrid
          items={applicationOptions}
          selectedIds={applicationIds}
          title="Applications"
          onToggle={(id, checked) =>
            setApplicationIds((current) => toggleId(current, id, checked))
          }
        />

        <div className="grid gap-2">
          <h3 className="text-sm font-medium">Discord roles</h3>
          <DiscordRoleCombobox
            emptyText="No Discord roles available."
            onValueChange={setDiscordRoles}
            options={discordOptions}
            placeholder="Add Discord role"
            value={discordRoles}
          />
        </div>

        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}

function AssignmentGrid({
  items,
  onToggle,
  selectedIds,
  title,
}: {
  items: Array<{ id: string; name: string }>;
  onToggle: (id: string, checked: boolean) => void;
  selectedIds: Array<string>;
  title: string;
}) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.length ? (
          items.map((item) => (
            <Label
              className="flex items-center gap-2 rounded-md border p-2"
              key={item.id}
            >
              <Checkbox
                checked={selectedIds.includes(item.id)}
                onCheckedChange={(checked) => onToggle(item.id, checked === true)}
              />
              <span>{item.name}</span>
            </Label>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">No options available.</p>
        )}
      </div>
    </div>
  );
}
