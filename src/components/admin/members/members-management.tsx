"use client";

import * as React from "react";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  ArrowDownAZIcon,
  ArrowUpZAIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  FilterIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";

import { setMemberApplicationAccessAction } from "@/actions/access-applications";
import { setMemberGroupAssignmentAction } from "@/actions/groups";
import {
  createMemberAction,
  searchKeycloakUsersAction,
  updateMemberRolesAction,
} from "@/actions/members";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from "@/components/ui/table";
import { formatSlovenianDateTime } from "@/lib/date-format";
import {
  NO_REGION_MEMBER_FILTER,
  NO_ROLES_MEMBER_ROLE_FILTER,
  buildMembersFilterHref,
  buildMembersSortHref,
  type MemberListStatus,
  type MembersListFilters,
} from "@/lib/members";
import { residenceRegions } from "@/lib/membership-applications";
import { cn } from "@/lib/utils";

export type MemberRoleBadge = {
  id: string;
  key: string;
  name: string;
};

export type MemberApplicationBadge = {
  id: string;
  name: string;
};

export type MemberGroupBadge = {
  id: string;
  name: string;
};

export type MemberListRow = {
  applications: Array<MemberApplicationBadge>;
  currentMembership: {
    expiresAt: string | null;
    extendedAt: string;
  } | null;
  disabledAt: string | null;
  firstName: string;
  id: string;
  keycloakId: string;
  lastName: string;
  groups: Array<MemberGroupBadge>;
  primaryEmail: string | null;
  residenceRegion: string | null;
  roles: Array<MemberRoleBadge>;
  updatedAt: string;
  username: string;
};

export type KeycloakUserOption = {
  email: string | null;
  enabled: boolean;
  firstName: string | null;
  fullName: string;
  id: string;
  lastName: string | null;
  username: string;
};

type PageSizeOption = {
  href: string;
  value: number;
};

type RoleOption = {
  id: string;
  name: string;
};

type ApplicationOption = {
  id: string;
  name: string;
};

type GroupOption = {
  id: string;
  name: string;
};

type AssignmentOption = {
  id: string;
  name: string;
};

type CreateMemberFieldErrors = Partial<
  Record<
    "firstName" | "fullLegalName" | "keycloakId" | "lastName" | "primaryEmail" | "username",
    string
  >
>;

function formatMembership(value: MemberListRow["currentMembership"]) {
  if (!value) return "No active membership";
  if (!value.expiresAt) return "Indefinite";
  return formatSlovenianDateTime(new Date(value.expiresAt));
}

function getStatusSelection(status: MemberListStatus) {
  return {
    active: status === "active" || status === "all",
    disabled: status === "disabled" || status === "all",
  };
}

function getStatusFromSelection(selection: {
  active: boolean;
  disabled: boolean;
}): MemberListStatus {
  if (selection.active && !selection.disabled) return "active";
  if (!selection.active && selection.disabled) return "disabled";
  return "all";
}

function toggleSelectedValue(
  values: Array<string>,
  value: string,
  checked: boolean,
) {
  if (checked) return values.includes(value) ? values : [...values, value];
  return values.filter((currentValue) => currentValue !== value);
}

function FilterIconButton({
  active,
  className,
  label,
  ...props
}: {
  active: boolean;
  label: string;
} & Omit<React.ComponentProps<typeof Button>, "children">) {
  return (
    <Button
      aria-label={label}
      className={cn(
        "relative text-muted-foreground data-[filter-active=true]:text-foreground data-[filter-active=true]:after:absolute data-[filter-active=true]:after:top-1 data-[filter-active=true]:after:right-1 data-[filter-active=true]:after:size-1 data-[filter-active=true]:after:bg-primary",
        className,
      )}
      data-filter-active={active}
      size="icon-xs"
      type="button"
      variant="ghost"
      {...props}
    >
      <FilterIcon className="size-3" />
    </Button>
  );
}

function AddMemberSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<KeycloakUserOption | null>(
    null,
  );
  const [memberForm, setMemberForm] = useState({
    firstName: "",
    fullLegalName: "",
    lastName: "",
    notes: "",
    primaryEmail: "",
    username: "",
  });
  const [fieldErrors, setFieldErrors] = useState<CreateMemberFieldErrors>({});
  const [users, setUsers] = useState<Array<KeycloakUserOption>>([]);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const searchIdRef = useRef(0);
  const [isSearching, startSearchTransition] = useTransition();
  const [isPending, startTransition] = useTransition();

  function handleSearchChange(nextQuery: string) {
    setQuery(nextQuery);
    const searchId = searchIdRef.current + 1;
    searchIdRef.current = searchId;

    const trimmedQuery = nextQuery.trim();
    if (trimmedQuery.length < 2) {
      setUsers([]);
      return;
    }

    startSearchTransition(async () => {
      const result = await searchKeycloakUsersAction(trimmedQuery);
      if (searchIdRef.current !== searchId) return;

      if (result.ok) {
        setUsers(result.users);
      } else {
        setServerMessage(result.message);
      }
    });
  }

  function setMemberField(
    field: keyof typeof memberForm,
    value: string,
    errorField?: keyof CreateMemberFieldErrors,
  ) {
    setMemberForm((current) => ({
      ...current,
      [field]: value,
    }));
    if (errorField) {
      setFieldErrors((current) => ({
        ...current,
        [errorField]: undefined,
      }));
    }
  }

  function clearSelectedUser() {
    setSelectedUser(null);
    setMemberForm({
      firstName: "",
      fullLegalName: "",
      lastName: "",
      notes: "",
      primaryEmail: "",
      username: "",
    });
    setFieldErrors((current) => ({
      ...current,
      firstName: undefined,
      fullLegalName: undefined,
      keycloakId: undefined,
      lastName: undefined,
      primaryEmail: undefined,
      username: undefined,
    }));
  }

  function reset() {
    searchIdRef.current += 1;
    setQuery("");
    setSelectedUser(null);
    setMemberForm({
      firstName: "",
      fullLegalName: "",
      lastName: "",
      notes: "",
      primaryEmail: "",
      username: "",
    });
    setFieldErrors({});
    setUsers([]);
    setServerMessage(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerMessage(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await createMemberAction({
        firstName: memberForm.firstName,
        fullLegalName: memberForm.fullLegalName,
        keycloakId: selectedUser?.id ?? "",
        lastName: memberForm.lastName,
        notes: memberForm.notes,
        primaryEmail: memberForm.primaryEmail,
        username: memberForm.username,
      });

      if (!result.ok) {
        setServerMessage(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      reset();
      setOpen(false);
      router.push(`/admin/members/${result.memberId}`);
      router.refresh();
    });
  }

  return (
    <Sheet
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
      open={open}
    >
      <SheetTrigger asChild>
        <Button type="button">
          <PlusIcon />
          Add member
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Add member</SheetTitle>
          <SheetDescription>
            Search Keycloak and create a linked local member record.
          </SheetDescription>
        </SheetHeader>
        <form className="grid gap-4 p-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label className="text-xs" htmlFor="keycloak-search">
              Keycloak user
            </Label>
            <div className="flex gap-2">
              <Popover onOpenChange={setPickerOpen} open={pickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    aria-invalid={Boolean(fieldErrors.keycloakId)}
                    className="flex-1 justify-between"
                    type="button"
                    variant="outline"
                  >
                    {selectedUser
                      ? `${selectedUser.fullName} (@${selectedUser.username})`
                      : "Search Keycloak users"}
                    <ChevronsUpDownIcon className="size-4 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-96 p-2">
                  <Input
                    autoComplete="off"
                    id="keycloak-search"
                    onChange={(event) => handleSearchChange(event.target.value)}
                    placeholder="Search by name, username, or email"
                    value={query}
                  />
                  <div className="mt-2 grid max-h-72 gap-1 overflow-y-auto">
                    {isSearching ? (
                      <>
                        <Skeleton className="h-10" />
                        <Skeleton className="h-10" />
                      </>
                    ) : null}
                    {!isSearching && users.length === 0 ? (
                      <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                        Enter at least two characters to search.
                      </p>
                    ) : null}
                    {users.map((user) => (
                      <Button
                        className="grid h-auto w-full gap-0.5 rounded-md px-2 py-2 text-left text-xs"
                        key={user.id}
                        onClick={() => {
                          setSelectedUser(user);
                          setMemberForm({
                            firstName: user.firstName ?? "",
                            fullLegalName: "",
                            lastName: user.lastName ?? "",
                            notes: "",
                            primaryEmail: user.email ?? "",
                            username: user.username,
                          });
                          setFieldErrors({});
                          setPickerOpen(false);
                        }}
                        type="button"
                        variant="ghost"
                      >
                        <span className="flex items-center gap-2 font-medium">
                          {selectedUser?.id === user.id ? (
                            <CheckIcon className="size-3" />
                          ) : null}
                          {user.fullName}
                        </span>
                        <span className="text-muted-foreground">
                          @{user.username}
                          {user.email ? ` - ${user.email}` : ""}
                        </span>
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              {selectedUser ? (
                <Button
                  aria-label="Clear selected Keycloak user"
                  onClick={clearSelectedUser}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <XIcon className="size-4" />
                </Button>
              ) : null}
            </div>
            {fieldErrors.keycloakId ? (
              <p className="text-xs font-medium text-destructive">
                {fieldErrors.keycloakId}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              aria-invalid={Boolean(fieldErrors.firstName)}
              disabled={Boolean(selectedUser)}
              onChange={(event) =>
                setMemberField("firstName", event.target.value, "firstName")
              }
              value={memberForm.firstName}
              name="firstName"
              placeholder="First name (preferred name)"
              required
            />
            <Input
              aria-invalid={Boolean(fieldErrors.lastName)}
              disabled={Boolean(selectedUser)}
              onChange={(event) =>
                setMemberField("lastName", event.target.value, "lastName")
              }
              value={memberForm.lastName}
              name="lastName"
              placeholder="Last name"
              required
            />
          </div>
          {fieldErrors.firstName || fieldErrors.lastName ? (
            <p className="text-xs font-medium text-destructive">
              {fieldErrors.firstName ?? fieldErrors.lastName}
            </p>
          ) : null}
          <Input
            aria-invalid={Boolean(fieldErrors.fullLegalName)}
            onChange={(event) =>
              setMemberField("fullLegalName", event.target.value, "fullLegalName")
            }
            value={memberForm.fullLegalName}
            name="fullLegalName"
            placeholder="Full legal name"
            required
          />
          {fieldErrors.fullLegalName ? (
            <p className="text-xs font-medium text-destructive">
              {fieldErrors.fullLegalName}
            </p>
          ) : null}
          <Input
            aria-invalid={Boolean(fieldErrors.username)}
            disabled={Boolean(selectedUser)}
            onChange={(event) =>
              setMemberField("username", event.target.value, "username")
            }
            value={memberForm.username}
            name="username"
            placeholder="Username"
            required
          />
          {fieldErrors.username ? (
            <p className="text-xs font-medium text-destructive">
              {fieldErrors.username}
            </p>
          ) : null}
          <Input
            aria-invalid={Boolean(fieldErrors.primaryEmail)}
            disabled={Boolean(selectedUser?.email)}
            onChange={(event) =>
              setMemberField("primaryEmail", event.target.value, "primaryEmail")
            }
            value={memberForm.primaryEmail}
            name="primaryEmail"
            placeholder="Primary email"
            required
            type="email"
          />
          {fieldErrors.primaryEmail ? (
            <p className="text-xs font-medium text-destructive">
              {fieldErrors.primaryEmail}
            </p>
          ) : null}
          <Input
            name="notes"
            onChange={(event) => setMemberField("notes", event.target.value)}
            placeholder="Notes"
            value={memberForm.notes}
          />

          <SheetFooter className="border-t px-0 pb-0">
            {serverMessage ? (
              <p className="flex-1 text-xs font-medium text-destructive">
                {serverMessage}
              </p>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? "Creating..." : "Create member"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function StatusFilterDialog({ filters }: { filters: MembersListFilters }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState(() =>
    getStatusSelection(filters.status),
  );

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) setSelection(getStatusSelection(filters.status));
  }

  function applyFilter() {
    router.replace(
      buildMembersFilterHref(filters, {
        status: getStatusFromSelection(selection),
      }),
      { scroll: false },
    );
    setOpen(false);
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <FilterIconButton
          active={filters.status !== "active"}
          label="Filter members by status"
        />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Filter by status</DialogTitle>
          <DialogDescription>
            Choose which member statuses should appear in the table.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label
            className="flex items-center gap-2 text-xs font-normal"
            htmlFor="members-status-active"
          >
            <Checkbox
              checked={selection.active}
              id="members-status-active"
              onCheckedChange={(checked) =>
                setSelection((current) => ({
                  ...current,
                  active: checked === true,
                }))
              }
            />
            Active
          </Label>
          <Label
            className="flex items-center gap-2 text-xs font-normal"
            htmlFor="members-status-disabled"
          >
            <Checkbox
              checked={selection.disabled}
              id="members-status-disabled"
              onCheckedChange={(checked) =>
                setSelection((current) => ({
                  ...current,
                  disabled: checked === true,
                }))
              }
            />
            Disabled
          </Label>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={applyFilter} type="button">
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RolesFilterDialog({
  filters,
  roleOptions,
}: {
  filters: MembersListFilters;
  roleOptions: Array<RoleOption>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState(filters.roleId);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) setSelectedRoleIds(filters.roleId);
  }

  function applyFilter() {
    router.replace(
      buildMembersFilterHref(filters, {
        roleId: selectedRoleIds,
      }),
      { scroll: false },
    );
    setOpen(false);
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <FilterIconButton
          active={filters.roleId.length > 0}
          label="Filter members by role"
        />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Filter by roles</DialogTitle>
          <DialogDescription>
            Choose one or more role states to include in the table.
          </DialogDescription>
        </DialogHeader>
        <div
          className={cn(
            "grid gap-2",
            roleOptions.length > 12
              ? "max-h-[70vh] overflow-y-auto pr-1"
              : "overflow-visible",
          )}
        >
          <Label
            className="flex items-center gap-2 text-xs font-normal"
            htmlFor="members-role-none"
          >
            <Checkbox
              checked={selectedRoleIds.includes(NO_ROLES_MEMBER_ROLE_FILTER)}
              id="members-role-none"
              onCheckedChange={(checked) =>
                setSelectedRoleIds((current) =>
                  toggleSelectedValue(
                    current,
                    NO_ROLES_MEMBER_ROLE_FILTER,
                    checked === true,
                  ),
                )
              }
            />
            No roles
          </Label>
          {roleOptions.map((role) => (
            <Label
              className="flex items-center gap-2 text-xs font-normal"
              htmlFor={`members-role-${role.id}`}
              key={role.id}
            >
              <Checkbox
                checked={selectedRoleIds.includes(role.id)}
                id={`members-role-${role.id}`}
                onCheckedChange={(checked) =>
                  setSelectedRoleIds((current) =>
                    toggleSelectedValue(current, role.id, checked === true),
                  )
                }
              />
              {role.name}
            </Label>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={applyFilter} type="button">
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegionFilterDialog({ filters }: { filters: MembersListFilters }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState(filters.region);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) setSelectedRegions(filters.region);
  }

  function applyFilter() {
    router.replace(
      buildMembersFilterHref(filters, {
        region: selectedRegions,
      }),
      { scroll: false },
    );
    setOpen(false);
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <FilterIconButton
          active={filters.region.length > 0}
          label="Filter members by region"
        />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Filter by region</DialogTitle>
          <DialogDescription>
            Choose one or more residence regions to include in the table.
          </DialogDescription>
        </DialogHeader>
        <div
          className={cn(
            "grid gap-2",
            residenceRegions.length > 12
              ? "max-h-[70vh] overflow-y-auto pr-1"
              : "overflow-visible",
          )}
        >
          <Label
            className="flex items-center gap-2 text-xs font-normal"
            htmlFor="members-region-none"
          >
            <Checkbox
              checked={selectedRegions.includes(NO_REGION_MEMBER_FILTER)}
              id="members-region-none"
              onCheckedChange={(checked) =>
                setSelectedRegions((current) =>
                  toggleSelectedValue(
                    current,
                    NO_REGION_MEMBER_FILTER,
                    checked === true,
                  ),
                )
              }
            />
            No region
          </Label>
          {residenceRegions.map((region) => (
            <Label
              className="flex items-center gap-2 text-xs font-normal"
              htmlFor={`members-region-${region}`}
              key={region}
            >
              <Checkbox
                checked={selectedRegions.includes(region)}
                id={`members-region-${region}`}
                onCheckedChange={(checked) =>
                  setSelectedRegions((current) =>
                    toggleSelectedValue(current, region, checked === true),
                  )
                }
              />
              {region}
            </Label>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={applyFilter} type="button">
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InlineAssignmentPopover({
  assignedIds,
  disabled,
  emptyAssignedLabel,
  emptyLabel,
  label,
  onAssignmentsChanged,
  onToggle,
  options,
}: {
  assignedIds: Set<string>;
  disabled?: boolean;
  emptyAssignedLabel: string;
  emptyLabel: string;
  label: string;
  onAssignmentsChanged?: () => void;
  onToggle: (
    optionId: string,
    assigned: boolean,
    assignedIds: Array<string>,
  ) => Promise<string | null>;
  options: Array<AssignmentOption>;
}) {
  const [open, setOpen] = useState(false);
  const [optimisticAssignedIds, setOptimisticAssignedIds] = useState(
    () => new Set(assignedIds),
  );
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const [hasSuccessfulChange, setHasSuccessfulChange] = useState(false);
  const [isPending, startTransition] = useTransition();
  const optimisticAssignedOptions = options.filter((option) =>
    optimisticAssignedIds.has(option.id),
  );

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setOptimisticAssignedIds(new Set(assignedIds));
      setHasSuccessfulChange(false);
    } else {
      setServerMessage(null);
      if (hasSuccessfulChange) onAssignmentsChanged?.();
    }
  }

  function setOptimisticAssignment(optionId: string, assigned: boolean) {
    setOptimisticAssignedIds((current) => {
      const nextAssignedIds = new Set(current);
      if (assigned) {
        nextAssignedIds.add(optionId);
      } else {
        nextAssignedIds.delete(optionId);
      }
      return nextAssignedIds;
    });
  }

  function revertOptimisticAssignment(optionId: string, assigned: boolean) {
    setOptimisticAssignment(optionId, !assigned);
  }

  function handleToggle(optionId: string, assigned: boolean) {
    setServerMessage(null);
    setPendingOptionId(optionId);
    const nextAssignedIds = new Set(optimisticAssignedIds);
    if (assigned) {
      nextAssignedIds.add(optionId);
    } else {
      nextAssignedIds.delete(optionId);
    }
    setOptimisticAssignment(optionId, assigned);

    startTransition(async () => {
      const message = await onToggle(
        optionId,
        assigned,
        Array.from(nextAssignedIds),
      );
      setServerMessage(message);
      if (message) {
        revertOptimisticAssignment(optionId, assigned);
      } else {
        setHasSuccessfulChange(true);
      }
      setPendingOptionId(null);
    });
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {optimisticAssignedOptions.length ? (
        optimisticAssignedOptions.slice(0, 3).map((option) => (
          <Badge key={option.id} variant="outline">
            {option.name}
          </Badge>
        ))
      ) : (
        <span className="text-muted-foreground">{emptyAssignedLabel}</span>
      )}
      <Popover onOpenChange={handleOpenChange} open={open}>
        <PopoverTrigger asChild>
          <Button
            aria-label={label}
            disabled={disabled}
            size="icon-xs"
            title={label}
            type="button"
            variant="ghost"
          >
            <PlusIcon className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandInput placeholder={label} />
            <CommandList>
              <CommandEmpty>{emptyLabel}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const assigned = optimisticAssignedIds.has(option.id);
                  const optionPending = pendingOptionId === option.id;
                  return (
                    <CommandItem
                      className="justify-between"
                      disabled={isPending}
                      key={option.id}
                      onSelect={() => handleToggle(option.id, !assigned)}
                      value={option.name}
                    >
                      <span className="truncate">{option.name}</span>
                      <Checkbox
                        aria-label={`${assigned ? "Remove" : "Add"} ${
                          option.name
                        }`}
                        checked={assigned}
                        disabled={isPending}
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={(checked) =>
                          handleToggle(option.id, checked === true)
                        }
                      />
                      {optionPending ? (
                        <span className="sr-only">Updating</span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
          {serverMessage ? (
            <p className="border-t px-3 py-2 text-xs font-medium text-destructive">
              {serverMessage}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function MembersManagement({
  applicationOptions,
  canCreate,
  canManageRoles,
  filters,
  groupOptions,
  nextPageHref,
  page,
  pageCount,
  pageSize,
  pageSizeOptions,
  previousPageHref,
  rows,
  roleOptions,
  totalCount,
}: {
  applicationOptions: Array<ApplicationOption>;
  canCreate: boolean;
  canManageRoles: boolean;
  filters: MembersListFilters;
  groupOptions: Array<GroupOption>;
  nextPageHref: string;
  page: number;
  pageCount: number;
  pageSize: number;
  pageSizeOptions: Array<PageSizeOption>;
  previousPageHref: string;
  rows: Array<MemberListRow>;
  roleOptions: Array<RoleOption>;
  totalCount: number;
}) {
  const router = useRouter();

  async function updateInlineGroupAssignment(
    row: MemberListRow,
    groupId: string,
    assigned: boolean,
  ) {
    const result = await setMemberGroupAssignmentAction(row.id, {
      assigned,
      groupId,
    });
    return result.ok ? null : result.message;
  }

  async function updateInlineRoles(
    row: MemberListRow,
    assignedRoleIds: Array<string>,
  ) {
    const result = await updateMemberRolesAction(
      row.id,
      assignedRoleIds.map((nextRoleId) => ({
        roleId: nextRoleId,
      })),
      { revalidate: false },
    );
    return result.ok ? null : result.message;
  }

  async function updateInlineApplicationAccess(
    row: MemberListRow,
    applicationId: string,
    assigned: boolean,
  ) {
    const result = await setMemberApplicationAccessAction(
      row.id,
      {
        applicationId,
        assigned,
      },
      { revalidate: false },
    );
    return result.ok ? null : result.message;
  }

  // Rule disabled because for some fucking reason
  // the test fails with Array<type> here so we're stuck with type[]
  // eslint-disable-next-line @typescript-eslint/array-type
  const columns: ColumnDef<MemberListRow>[] = [
    {
      id: "member",
      header: () => {
        const SortIcon =
          filters.sort === "name-asc" ? ArrowDownAZIcon : ArrowUpZAIcon;

        return (
          <Button asChild className="-ml-2" size="sm" variant="ghost">
            <Link href={buildMembersSortHref(filters)} scroll={false}>
              Member
              <SortIcon className="size-3.5 text-muted-foreground" />
            </Link>
          </Button>
        );
      },
      size: 240,
      cell: ({ row }) => {
        const fullName =
          `${row.original.firstName} ${row.original.lastName}`.trim();

        return (
          <div className="min-w-0">
            <Link
              className="block truncate font-medium text-foreground hover:underline"
              href={`/admin/members/${row.original.id}`}
            >
              {fullName || row.original.username}
            </Link>
            <p className="truncate text-muted-foreground">
              @{row.original.username}
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: "primaryEmail",
      header: "Email",
      size: 220,
      cell: ({ row }) => (
        <span className="block truncate text-muted-foreground">
          {row.original.primaryEmail ?? "No email"}
        </span>
      ),
    },
    {
      id: "status",
      header: () => (
        <div className="flex items-center gap-1.5">
          <span>Status</span>
          <StatusFilterDialog filters={filters} />
        </div>
      ),
      size: 150,
      cell: ({ row }) =>
        row.original.disabledAt ? (
          <Badge variant="outline">Disabled</Badge>
        ) : (
          <Badge>Active</Badge>
        ),
    },
    {
      id: "groups",
      header: "Groups",
      size: 240,
      cell: ({ row }) =>
        canManageRoles ? (
          <InlineAssignmentPopover
            assignedIds={new Set(row.original.groups.map((group) => group.id))}
            emptyAssignedLabel="No groups"
            emptyLabel="No groups found."
            label="Assign groups"
            onAssignmentsChanged={() => router.refresh()}
            onToggle={(groupId, assigned) =>
              updateInlineGroupAssignment(row.original, groupId, assigned)
            }
            options={groupOptions}
          />
        ) : (
          <div className="flex min-w-0 flex-wrap gap-1">
            {row.original.groups.length ? (
              row.original.groups.slice(0, 3).map((group) => (
                <Badge key={group.id} variant="outline">
                  {group.name}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">No groups</span>
            )}
          </div>
        ),
    },
    {
      id: "roles",
      header: () => (
        <div className="flex items-center gap-1.5">
          <span>Roles</span>
          <RolesFilterDialog filters={filters} roleOptions={roleOptions} />
        </div>
      ),
      size: 260,
      cell: ({ row }) =>
        canManageRoles ? (
          <InlineAssignmentPopover
            assignedIds={new Set(row.original.roles.map((role) => role.id))}
            emptyAssignedLabel="No roles"
            emptyLabel="No roles found."
            label="Add roles"
            onAssignmentsChanged={() => router.refresh()}
            onToggle={(_roleId, _assigned, assignedRoleIds) =>
              updateInlineRoles(row.original, assignedRoleIds)
            }
            options={roleOptions}
          />
        ) : (
          <div className="flex min-w-0 flex-wrap gap-1">
            {row.original.roles.length ? (
              row.original.roles.slice(0, 3).map((role) => (
                <Badge key={role.id} variant="outline">
                  {role.name}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">No roles</span>
            )}
          </div>
        ),
    },
    {
      id: "applications",
      header: "Applications",
      size: 240,
      cell: ({ row }) =>
        canManageRoles ? (
          <InlineAssignmentPopover
            assignedIds={
              new Set(
                row.original.applications.map((application) => application.id),
              )
            }
            emptyAssignedLabel="No applications"
            emptyLabel="No applications found."
            label="Grant application access"
            onAssignmentsChanged={() => router.refresh()}
            onToggle={(applicationId, assigned) =>
              updateInlineApplicationAccess(
                row.original,
                applicationId,
                assigned,
              )
            }
            options={applicationOptions}
          />
        ) : (
          <div className="flex min-w-0 flex-wrap gap-1">
            {row.original.applications.length ? (
              row.original.applications.slice(0, 3).map((application) => (
                <Badge key={application.id} variant="outline">
                  {application.name}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">No applications</span>
            )}
          </div>
        ),
    },
    {
      id: "membership",
      header: "Membership",
      size: 180,
      cell: ({ row }) => (
        <span
          className={cn(
            "block truncate",
            row.original.currentMembership
              ? "text-foreground"
              : "text-muted-foreground",
          )}
          title={row.original.currentMembership?.expiresAt ?? undefined}
        >
          {formatMembership(row.original.currentMembership)}
        </span>
      ),
    },
    {
      id: "region",
      header: () => (
        <div className="flex items-center gap-1.5">
          <span>Region</span>
          <RegionFilterDialog filters={filters} />
        </div>
      ),
      size: 180,
      cell: ({ row }) => (
        <span className="block truncate text-muted-foreground">
          {row.original.residenceRegion ?? "No region"}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="block text-right">Actions</span>,
      size: 96,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button asChild size="xs" variant="outline">
            <Link href={`/admin/members/${row.original.id}`}>Open</Link>
          </Button>
        </div>
      ),
    },
  ];

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Members</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {totalCount} total
            </span>
            {canCreate ? <AddMemberSheet /> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <TableScrollContainer>
          <Table
            className="table-fixed"
            style={{ width: table.getTotalSize() }}
          >
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        className={
                          cell.column.id === "groups" ||
                          cell.column.id === "roles" ||
                          cell.column.id === "applications"
                            ? "whitespace-normal"
                            : undefined
                        }
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="h-48 text-center text-muted-foreground"
                    colSpan={columns.length}
                  >
                    No members match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableScrollContainer>
        {table.getRowModel().rows.length ? (
          <div className="flex flex-col gap-3 border-t p-4 text-xs md:flex-row md:items-center md:justify-between">
            <span className="text-muted-foreground">
              Page {page} of {pageCount}
            </span>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Per page</span>
                <select
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  onChange={(event) => {
                    const option = pageSizeOptions.find(
                      ({ value }) => value === Number(event.target.value),
                    );
                    if (option) router.push(option.href);
                  }}
                  value={String(pageSize)}
                >
                  {pageSizeOptions.map((option) => (
                    <option key={option.value} value={String(option.value)}>
                      {option.value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline">
                  <Link href={previousPageHref}>Previous</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={nextPageHref}>Next</Link>
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
