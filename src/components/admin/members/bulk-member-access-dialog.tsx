"use client";

import * as React from "react";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  bulkAssignMemberAccessAction,
  type BulkMemberAccessAssignmentResult,
} from "@/actions/member-assignments";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export type MemberAccessAssignmentOption = {
  id: string;
  name: string;
};

export type BulkMemberAccessAssignmentCompletion = Extract<
  BulkMemberAccessAssignmentResult,
  { ok: true }
>;

type SelectedMember = {
  firstName: string;
  id: string;
  lastName: string;
  username: string;
};

function AssignmentCombobox({
  disabled,
  emptyText,
  label,
  onValueChange,
  options,
  placeholder,
  value,
}: {
  disabled: boolean;
  emptyText: string;
  label: string;
  onValueChange: (value: Array<string>) => void;
  options: Array<MemberAccessAssignmentOption>;
  placeholder: string;
  value: Array<string>;
}) {
  const anchor = useComboboxAnchor();
  const optionById = useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options],
  );
  const selectedOptions = useMemo(
    () =>
      value.flatMap((id) => {
        const option = optionById.get(id);
        return option ? [option] : [];
      }),
    [optionById, value],
  );

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Combobox<MemberAccessAssignmentOption, true>
        autoHighlight
        disabled={disabled}
        isItemEqualToValue={(item, selected) => item.id === selected.id}
        itemToStringLabel={(option) => option.name}
        itemToStringValue={(option) => option.id}
        items={options}
        multiple
        onValueChange={(nextValue) =>
          onValueChange(nextValue.map((option) => option.id))
        }
        value={selectedOptions}
      >
        <ComboboxChips
          aria-label={label}
          className="min-h-10 rounded-md"
          ref={anchor}
        >
          <ComboboxValue>
            {selectedOptions.map((option) => (
              <ComboboxChip className="rounded-md" key={option.id}>
                {option.name}
              </ComboboxChip>
            ))}
          </ComboboxValue>
          <ComboboxChipsInput placeholder={placeholder} />
        </ComboboxChips>
        <ComboboxContent anchor={anchor} className="rounded-md">
          <ComboboxEmpty>{emptyText}</ComboboxEmpty>
          <ComboboxList>
            {(option: MemberAccessAssignmentOption) => (
              <ComboboxItem key={option.id} value={option}>
                {option.name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

function getMemberPreview(members: Array<SelectedMember>) {
  const preview = members
    .slice(0, 3)
    .map(
      (member) =>
        `${member.firstName} ${member.lastName}`.trim() ||
        `@${member.username}`,
    )
    .join(", ");

  return members.length > 3
    ? `${preview}, and ${members.length - 3} more`
    : preview;
}

export function BulkMemberAccessDialog({
  applicationOptions,
  children,
  disabled = false,
  groupOptions,
  members,
  onComplete,
  roleOptions,
}: {
  applicationOptions: Array<MemberAccessAssignmentOption>;
  children: ReactNode;
  disabled?: boolean;
  groupOptions: Array<MemberAccessAssignmentOption>;
  members: Array<SelectedMember>;
  onComplete: (result: BulkMemberAccessAssignmentCompletion) => void;
  roleOptions: Array<MemberAccessAssignmentOption>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [roleIds, setRoleIds] = useState<Array<string>>([]);
  const [groupIds, setGroupIds] = useState<Array<string>>([]);
  const [applicationIds, setApplicationIds] = useState<Array<string>>([]);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hasAssignments =
    roleIds.length + groupIds.length + applicationIds.length > 0;
  const canSubmit = members.length > 0 && hasAssignments && !isPending;

  function reset() {
    setRoleIds([]);
    setGroupIds([]);
    setApplicationIds([]);
    setServerMessage(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function handleSubmit() {
    setServerMessage(null);
    if (!hasAssignments) {
      setServerMessage("Choose at least one role, group, or application.");
      return;
    }

    startTransition(async () => {
      const result = await bulkAssignMemberAccessAction({
        applicationIds,
        groupIds,
        memberIds: members.map((member) => member.id),
        roleIds,
      });

      if (!result.ok) {
        setServerMessage(result.message);
        return;
      }

      setOpen(false);
      reset();
      onComplete(result);
      router.refresh();
    });
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild disabled={disabled}>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Assign access</DialogTitle>
          <DialogDescription>
            Add roles, groups, or applications to {members.length} selected{" "}
            {members.length === 1 ? "member" : "members"}. Existing assignments
            will be preserved.
          </DialogDescription>
        </DialogHeader>

        {members.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Selected: {getMemberPreview(members)}
          </p>
        ) : null}

        <div className="grid gap-4">
          <AssignmentCombobox
            disabled={isPending}
            emptyText="No roles found."
            label="Roles"
            onValueChange={setRoleIds}
            options={roleOptions}
            placeholder="Add roles"
            value={roleIds}
          />
          <AssignmentCombobox
            disabled={isPending}
            emptyText="No groups found."
            label="Groups"
            onValueChange={setGroupIds}
            options={groupOptions}
            placeholder="Add groups"
            value={groupIds}
          />
          <AssignmentCombobox
            disabled={isPending}
            emptyText="No applications found."
            label="Applications"
            onValueChange={setApplicationIds}
            options={applicationOptions}
            placeholder="Add applications"
            value={applicationIds}
          />
        </div>

        {serverMessage ? (
          <p className="text-xs font-medium text-destructive" role="alert">
            {serverMessage}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button disabled={isPending} type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button disabled={!canSubmit} onClick={handleSubmit} type="button">
            {isPending ? "Assigning..." : "Assign access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
