"use client";

import * as React from "react";

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
import { cn } from "@/lib/utils";

export type DiscordRoleOption = {
  color?: string | null;
  id: string;
  name: string;
};

export function mergeDiscordRoleOptions(
  ...sets: Array<Array<DiscordRoleOption>>
) {
  return [
    ...new Map(
      sets.flat().map((role) => [role.id, role] satisfies [string, DiscordRoleOption]),
    ).values(),
  ];
}

function RoleColorDot({
  className,
  color,
}: {
  className?: string;
  color?: string | null;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2.5 shrink-0 rounded-full bg-muted-foreground/40 ring-1 ring-foreground/10",
        className,
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

export function DiscordRoleCombobox({
  emptyText = "No Discord roles found.",
  options,
  placeholder = "Add Discord role",
  value,
  onValueChange,
}: {
  emptyText?: string;
  options: Array<DiscordRoleOption>;
  placeholder?: string;
  value: Array<DiscordRoleOption>;
  onValueChange: (value: Array<DiscordRoleOption>) => void;
}) {
  const anchor = useComboboxAnchor();
  const items = React.useMemo(
    () => mergeDiscordRoleOptions(options, value),
    [options, value],
  );
  const valueById = React.useMemo(
    () => new Map(items.map((role) => [role.id, role])),
    [items],
  );
  const selectedValue = React.useMemo(
    () => value.map((role) => valueById.get(role.id) ?? role),
    [value, valueById],
  );

  return (
    <Combobox<DiscordRoleOption, true>
      autoHighlight
      isItemEqualToValue={(item, selected) => item.id === selected.id}
      itemToStringLabel={(role) => role.name}
      itemToStringValue={(role) => role.id}
      items={items}
      multiple
      onValueChange={(nextValue) => onValueChange(nextValue)}
      value={selectedValue}
    >
      <ComboboxChips
        aria-label="Discord roles"
        className="min-h-10 rounded-md"
        ref={anchor}
      >
        <ComboboxValue>
          {selectedValue.map((role) => (
            <ComboboxChip className="rounded-md" key={role.id}>
              <RoleColorDot color={role.color} />
              <span>{role.name}</span>
            </ComboboxChip>
          ))}
        </ComboboxValue>
        <ComboboxChipsInput placeholder={placeholder} />
      </ComboboxChips>
      <ComboboxContent anchor={anchor} className="rounded-md">
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(role: DiscordRoleOption) => (
            <ComboboxItem key={role.id} value={role}>
              <RoleColorDot color={role.color} />
              <span>{role.name}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
