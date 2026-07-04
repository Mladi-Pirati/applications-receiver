"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { differenceInYears } from "date-fns";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import {
  GripVerticalIcon,
  LockIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react";

import { setMemberApplicationAccessAction } from "@/actions/access-applications";
import {
  appendMembershipRenewalAction,
  deleteAddressAction,
  deleteContactAction,
  deleteMemberAction,
  endMembershipAction,
  reorderContactsAction,
  setMemberRoleAssignmentAction,
  setMemberDisabledAction,
  syncMemberFromKeycloakAction,
  updateMemberProfileAction,
  upsertAddressAction,
  upsertContactAction,
  type DeleteMemberMode,
} from "@/actions/members";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ADDRESS_LABELS,
  CONTACT_TYPES,
  type AddressLabel,
  type ContactType,
} from "@/db/schema";
import {
  formatSlovenianDate,
  formatSlovenianDateTime,
  parseDateOnly,
} from "@/lib/date-format";
import {
  residenceRegions,
  type ResidenceRegion,
} from "@/lib/membership-applications";
import { cn } from "@/lib/utils";

const UNSET_RESIDENCE_REGION = "__unset";

type RoleOption = {
  id: string;
  key: string;
  name: string;
  rank: number;
};

type AssignedRole = RoleOption;

type ApplicationOption = {
  archivedAt: string | null;
  description: string | null;
  id: string;
  keycloakClientId: string;
  keycloakRoleName: string;
  name: string;
};

type AssignedApplication = {
  applicationId: string;
  grantedAt: string;
};

type ContactRow = {
  id: string;
  isPrimary: boolean;
  label: string | null;
  sortOrder: number;
  type: ContactType;
  value: string;
};

type AddressRow = {
  city: string;
  country: string;
  id: string;
  label: AddressLabel;
  postalCode: string;
  street: string;
};

type MembershipRow = {
  endedAt: string | null;
  expiresAt: string | null;
  extendedAt: string;
  id: string;
};

type MemberDetail = {
  dateOfBirth: string | null;
  disabledAt: string | null;
  firstName: string;
  fullLegalName: string;
  id: string;
  keycloakId: string;
  lastName: string;
  notes: string | null;
  placeOfBirth: string | null;
  primaryEmail: string;
  residenceRegion: string | null;
  username: string;
};

function Message({ value }: { value: string | null }) {
  if (!value) return null;
  return <p className="text-xs font-medium text-muted-foreground">{value}</p>;
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2">{children}</div>;
}

function ProfileTab({
  canDelete,
  canUpdate,
  member,
}: {
  canDelete: boolean;
  canUpdate: boolean;
  member: MemberDetail;
}) {
  const router = useRouter();
  const [profileForm, setProfileForm] = useState({
    firstName: member.firstName,
    fullLegalName: member.fullLegalName,
    lastName: member.lastName,
    notes: member.notes ?? "",
    primaryEmail: member.primaryEmail,
    residenceRegion: member.residenceRegion ?? UNSET_RESIDENCE_REGION,
    username: member.username,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await updateMemberProfileAction(member.id, {
        firstName: profileForm.firstName,
        fullLegalName: profileForm.fullLegalName,
        lastName: profileForm.lastName,
        notes: profileForm.notes,
        primaryEmail: profileForm.primaryEmail,
        residenceRegion:
          profileForm.residenceRegion === UNSET_RESIDENCE_REGION
            ? ""
            : (profileForm.residenceRegion as ResidenceRegion),
        username: profileForm.username,
      });
      setMessage(result.message ?? null);
      if (result.ok) router.refresh();
    });
  }

  function sync() {
    setMessage(null);
    startTransition(async () => {
      const result = await syncMemberFromKeycloakAction(member.id);
      setMessage(result.message ?? null);
      if (result.ok) router.refresh();
    });
  }

  function toggleDisabled() {
    setMessage(null);
    startTransition(async () => {
      const result = await setMemberDisabledAction(
        member.id,
        !member.disabledAt,
      );
      setMessage(result.message ?? null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="font-bold">Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 p-4" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <Label className="text-xs">First name (preferred name)</Label>
              <Input
                disabled={!canUpdate}
                name="firstName"
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    firstName: event.target.value,
                  }))
                }
                required
                value={profileForm.firstName}
              />
            </Field>
            <Field>
              <Label className="text-xs">Last name</Label>
              <Input
                disabled={!canUpdate}
                name="lastName"
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    lastName: event.target.value,
                  }))
                }
                required
                value={profileForm.lastName}
              />
            </Field>
          </div>
          <Field>
            <Label className="text-xs">Full legal name</Label>
            <Input
              disabled={!canUpdate}
              name="fullLegalName"
              onChange={(event) =>
                setProfileForm((current) => ({
                  ...current,
                  fullLegalName: event.target.value,
                }))
              }
              required
              value={profileForm.fullLegalName}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <Label className="text-xs">Date of birth</Label>
              <Input
                disabled
                readOnly
                value={
                  member.dateOfBirth
                    ? formatSlovenianDate(parseDateOnly(member.dateOfBirth))
                    : "Not on file"
                }
              />
            </Field>
            <Field>
              <Label className="text-xs">Place of birth</Label>
              <Input disabled readOnly value={member.placeOfBirth ?? "Not on file"} />
            </Field>
          </div>
          <Field>
            <Label className="text-xs">Region</Label>
            <Select
              disabled={!canUpdate}
              onValueChange={(value) =>
                setProfileForm((current) => ({
                  ...current,
                  residenceRegion: value,
                }))
              }
              value={profileForm.residenceRegion}
            >
              <SelectTrigger disabled={!canUpdate}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET_RESIDENCE_REGION}>
                  No region
                </SelectItem>
                {residenceRegions.map((region) => (
                  <SelectItem key={region} value={region}>
                    {region}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <Label className="text-xs">Username</Label>
            <Input
              disabled={!canUpdate}
              name="username"
              onChange={(event) =>
                setProfileForm((current) => ({
                  ...current,
                  username: event.target.value,
                }))
              }
              required
              value={profileForm.username}
            />
          </Field>
          <Field>
            <Label className="text-xs">Primary email</Label>
            <Input
              disabled={!canUpdate}
              name="primaryEmail"
              onChange={(event) =>
                setProfileForm((current) => ({
                  ...current,
                  primaryEmail: event.target.value,
                }))
              }
              required
              type="email"
              value={profileForm.primaryEmail}
            />
          </Field>
          <Field>
            <Label className="text-xs">Notes</Label>
            <Textarea
              disabled={!canUpdate}
              name="notes"
              onChange={(event) =>
                setProfileForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              value={profileForm.notes}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button disabled={!canUpdate || isPending} type="submit">
              {isPending ? "Saving..." : "Save profile"}
            </Button>
            <Button
              disabled={!canUpdate || isPending}
              onClick={sync}
              type="button"
              variant="outline"
            >
              <RotateCwIcon />
              Sync from Keycloak
            </Button>
            <Button
              disabled={!canUpdate || isPending}
              onClick={toggleDisabled}
              type="button"
              variant={member.disabledAt ? "outline" : "destructive"}
            >
              {member.disabledAt ? "Re-enable member" : "Disable member"}
            </Button>
            {canDelete ? <DeleteMemberDialog member={member} /> : null}
            <Message value={message} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const deleteMemberOptions: Array<{
  description: string;
  label: string;
  mode: DeleteMemberMode;
}> = [
  {
    description: "Delete only this member record and local profile data.",
    label: "Delete locally",
    mode: "local",
  },
  {
    description: "Delete this member and permanently delete the Keycloak user.",
    label: "Delete locally and in Keycloak",
    mode: "local-and-keycloak",
  },
  {
    description:
      "Delete this member after removing all default-client and Helm application roles.",
    label: "Delete locally and revoke Helm roles",
    mode: "local-and-revoke-helm",
  },
];

function DeleteMemberDialog({ member }: { member: MemberDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DeleteMemberMode>("local");
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const displayName =
    `${member.firstName} ${member.lastName}`.trim() || member.username;

  function remove() {
    setServerMessage(null);
    startTransition(async () => {
      const result = await deleteMemberAction(member.id, mode);
      if (!result.ok) {
        setServerMessage(result.message);
        return;
      }

      setOpen(false);
      router.push("/admin/members");
      router.refresh();
    });
  }

  return (
    <AlertDialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setServerMessage(null);
      }}
      open={open}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive">
          <Trash2Icon />
          Delete member
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete member</AlertDialogTitle>
          <AlertDialogDescription>
            Delete {displayName} (@{member.username}) permanently. This action
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RadioGroup
          disabled={isPending}
          onValueChange={(v) => setMode(v as DeleteMemberMode)}
          value={mode}
        >
          {deleteMemberOptions.map((option) => (
            <Label
              className={cn(
                "grid cursor-pointer gap-1 border p-3 text-xs font-normal",
                mode === option.mode && "border-destructive",
              )}
              key={option.mode}
            >
              <span className="flex items-center gap-2 font-medium text-foreground">
                <RadioGroupItem value={option.mode} />
                {option.label}
              </span>
              <span className="text-muted-foreground">
                {option.description}
              </span>
            </Label>
          ))}
        </RadioGroup>
        {serverMessage ? (
          <p className="text-xs font-medium text-destructive">
            {serverMessage}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button
            disabled={isPending}
            onClick={remove}
            type="button"
            variant="destructive"
          >
            {isPending ? "Deleting..." : "Delete member"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SortableContactRow({
  canUpdate,
  contact,
  index,
  memberId,
  onDeleted,
}: {
  canUpdate: boolean;
  contact: ContactRow;
  index: number;
  memberId: string;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const { handleRef, ref, isDragging } = useSortable({
    id: contact.id,
    index,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await upsertContactAction(
        memberId,
        {
          isPrimary: formData.get("isPrimary") === "on",
          label: String(formData.get("label") ?? ""),
          type: String(formData.get("type") ?? contact.type) as ContactType,
          value: String(formData.get("value") ?? ""),
        },
        contact.id,
      );
      setMessage(result.message ?? null);
      if (result.ok) router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteContactAction(memberId, contact.id);
      setMessage(result.message ?? null);
      if (result.ok) {
        onDeleted();
        router.refresh();
      }
    });
  }

  return (
    <form
      className={cn(
        "grid gap-2 border-b p-3 md:grid-cols-[auto_120px_minmax(0,1fr)_120px_auto_auto] md:items-center",
        isDragging && "opacity-60",
      )}
      onSubmit={save}
      ref={ref}
    >
      <Button
        className="size-8 border"
        disabled={!canUpdate}
        ref={handleRef}
        size="icon"
        type="button"
        variant="ghost"
      >
        <GripVerticalIcon className="size-4" />
      </Button>
      <Select defaultValue={contact.type} name="type">
        <SelectTrigger disabled={!canUpdate}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CONTACT_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input defaultValue={contact.value} disabled={!canUpdate} name="value" />
      <Input
        defaultValue={contact.label ?? ""}
        disabled={!canUpdate}
        name="label"
        placeholder="Label"
      />
      <div className="flex items-center gap-2">
        <Checkbox
          defaultChecked={contact.isPrimary}
          disabled={!canUpdate}
          id={`isPrimary-${contact.id}`}
          name="isPrimary"
        />
        <Label className="text-xs font-normal" htmlFor={`isPrimary-${contact.id}`}>
          Primary
        </Label>
      </div>
      <div className="flex gap-2 md:justify-end">
        <Button disabled={!canUpdate || isPending} size="xs" type="submit">
          Save
        </Button>
        <Button
          disabled={!canUpdate || isPending}
          onClick={remove}
          size="xs"
          type="button"
          variant="destructive"
        >
          Delete
        </Button>
      </div>
      <div className="md:col-span-6">
        <Message value={message} />
      </div>
    </form>
  );
}

function ContactsTab({
  canUpdate,
  contacts: initialContacts,
  memberId,
}: {
  canUpdate: boolean;
  contacts: Array<ContactRow>;
  memberId: string;
}) {
  const router = useRouter();
  const [contactsState, setContactsState] = useState(initialContacts);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await upsertContactAction(memberId, {
        isPrimary: formData.get("isPrimary") === "on",
        label: String(formData.get("label") ?? ""),
        type: String(formData.get("type") ?? "email") as ContactType,
        value: String(formData.get("value") ?? ""),
      });
      setMessage(result.message ?? null);
      if (result.ok) {
        form.reset();
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="font-bold">Contacts</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <DragDropProvider
          onDragEnd={(event) => {
            if (event.canceled) return;
            const next = move(contactsState, event) as Array<ContactRow>;
            setContactsState(next);
            startTransition(async () => {
              const result = await reorderContactsAction(
                memberId,
                next.map((contact) => contact.id),
              );
              setMessage(result.message ?? null);
              if (result.ok) router.refresh();
            });
          }}
        >
          {contactsState.map((contact, index) => (
            <SortableContactRow
              canUpdate={canUpdate}
              contact={contact}
              index={index}
              key={contact.id}
              memberId={memberId}
              onDeleted={() =>
                setContactsState((current) =>
                  current.filter((row) => row.id !== contact.id),
                )
              }
            />
          ))}
        </DragDropProvider>
        <form
          className="grid gap-2 p-4 md:grid-cols-[140px_minmax(0,1fr)_140px_auto_auto] md:items-center"
          onSubmit={add}
        >
          <Select defaultValue="email" name="type">
            <SelectTrigger disabled={!canUpdate}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTACT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input disabled={!canUpdate} name="value" placeholder="Value" />
          <Input disabled={!canUpdate} name="label" placeholder="Label" />
          <div className="flex items-center gap-2">
            <Checkbox
              disabled={!canUpdate}
              id="isPrimary-new"
              name="isPrimary"
            />
            <Label className="text-xs font-normal" htmlFor="isPrimary-new">
              Primary
            </Label>
          </div>
          <Button disabled={!canUpdate || isPending} type="submit">
            Add contact
          </Button>
          <div className="md:col-span-5">
            <Message value={message} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AddressesTab({
  addresses: rows,
  canUpdate,
  memberId,
}: {
  addresses: Array<AddressRow>;
  canUpdate: boolean;
  memberId: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>, addressId?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await upsertAddressAction(
        memberId,
        {
          city: String(formData.get("city") ?? ""),
          country: String(formData.get("country") ?? ""),
          label: String(formData.get("label") ?? "primary") as AddressLabel,
          postalCode: String(formData.get("postalCode") ?? ""),
          street: String(formData.get("street") ?? ""),
        },
        addressId,
      );
      setMessage(result.message ?? null);
      if (result.ok) {
        form.reset();
        router.refresh();
      }
    });
  }

  function remove(addressId: string) {
    startTransition(async () => {
      const result = await deleteAddressAction(memberId, addressId);
      setMessage(result.message ?? null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="font-bold">Addresses</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-4">
        {rows.map((address) => (
          <form
            className="grid gap-2 border p-3 md:grid-cols-[130px_minmax(0,1fr)_120px_140px_120px_auto]"
            key={address.id}
            onSubmit={(event) => submit(event, address.id)}
          >
            <Select defaultValue={address.label} name="label">
              <SelectTrigger disabled={!canUpdate}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADDRESS_LABELS.map((label) => (
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              defaultValue={address.street}
              disabled={!canUpdate}
              name="street"
            />
            <Input
              defaultValue={address.city}
              disabled={!canUpdate}
              name="city"
            />
            <Input
              defaultValue={address.postalCode}
              disabled={!canUpdate}
              name="postalCode"
            />
            <Input
              defaultValue={address.country}
              disabled={!canUpdate}
              name="country"
            />
            <div className="flex gap-2">
              <Button
                disabled={!canUpdate || isPending}
                size="xs"
                type="submit"
              >
                Save
              </Button>
              <Button
                disabled={!canUpdate || isPending}
                onClick={() => remove(address.id)}
                size="xs"
                type="button"
                variant="destructive"
              >
                Delete
              </Button>
            </div>
          </form>
        ))}
        <form
          className="grid gap-2 border p-3 md:grid-cols-[130px_minmax(0,1fr)_120px_140px_120px_auto]"
          onSubmit={(event) => submit(event)}
        >
          <Select defaultValue="primary" name="label">
            <SelectTrigger disabled={!canUpdate}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADDRESS_LABELS.map((label) => (
                <SelectItem key={label} value={label}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input disabled={!canUpdate} name="street" placeholder="Street" />
          <Input disabled={!canUpdate} name="city" placeholder="City" />
          <Input
            disabled={!canUpdate}
            name="postalCode"
            placeholder="Postal code"
          />
          <Input disabled={!canUpdate} name="country" placeholder="Country" />
          <Button disabled={!canUpdate || isPending} type="submit">
            Add address
          </Button>
        </form>
        <Message value={message} />
      </CardContent>
    </Card>
  );
}

function MembershipsTab({
  canUpdate,
  memberId,
  memberships,
}: {
  canUpdate: boolean;
  memberId: string;
  memberships: Array<MembershipRow>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    endedAt?: string;
    expiresAt?: string;
    extendedAt?: string;
  }>({});
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setFieldErrors({});
    startTransition(async () => {
      const result = await appendMembershipRenewalAction(memberId, {
        endedAt: String(formData.get("endedAt") ?? ""),
        expiresAt: String(formData.get("expiresAt") ?? ""),
        extendedAt: String(formData.get("extendedAt") ?? ""),
      });
      setMessage(result.message ?? null);
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      if (result.ok) {
        form.reset();
        router.refresh();
      }
    });
  }

  function endMembership(membershipId: string) {
    startTransition(async () => {
      const result = await endMembershipAction(memberId, membershipId);
      setMessage(result.message ?? null);
      if (result.ok) router.refresh();
    });
  }

  function formatMembershipEnd(membership: MembershipRow) {
    if (membership.endedAt) {
      return `Ended ${formatSlovenianDateTime(new Date(membership.endedAt))}`;
    }

    if (membership.expiresAt) {
      return `Expires ${formatSlovenianDateTime(new Date(membership.expiresAt))}`;
    }

    return "Indefinite";
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="font-bold">Memberships</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-4">
        <div className="divide-y border">
          {memberships.map((membership) => (
            <div
              className="grid gap-2 p-3 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={membership.id}
            >
              <div className="grid gap-1 sm:grid-cols-2">
                <span>
                  Extended{" "}
                  {formatSlovenianDateTime(new Date(membership.extendedAt))}
                </span>
                <span>{formatMembershipEnd(membership)}</span>
              </div>
              {!membership.endedAt ? (
                <Button
                  disabled={!canUpdate || isPending}
                  onClick={() => endMembership(membership.id)}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  End
                </Button>
              ) : null}
            </div>
          ))}
          {!memberships.length ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No membership renewals recorded.
            </div>
          ) : null}
        </div>
        <form className="flex flex-wrap items-start gap-2" onSubmit={submit}>
          <Field>
            <Label className="text-xs">Extended at</Label>
            <Input
              aria-invalid={Boolean(fieldErrors.extendedAt)}
              disabled={!canUpdate}
              name="extendedAt"
              type="date"
            />
            {fieldErrors.extendedAt ? (
              <p className="text-xs text-destructive">
                {fieldErrors.extendedAt}
              </p>
            ) : null}
          </Field>
          <Field>
            <Label className="text-xs">Expires at</Label>
            <Input
              aria-invalid={Boolean(fieldErrors.expiresAt)}
              disabled={!canUpdate}
              name="expiresAt"
              type="date"
            />
            {fieldErrors.expiresAt ? (
              <p className="text-xs text-destructive">
                {fieldErrors.expiresAt}
              </p>
            ) : null}
          </Field>
          <Field>
            <Label className="text-xs">Ended at</Label>
            <Input
              aria-invalid={Boolean(fieldErrors.endedAt)}
              disabled={!canUpdate}
              name="endedAt"
              type="date"
            />
            {fieldErrors.endedAt ? (
              <p className="text-xs text-destructive">{fieldErrors.endedAt}</p>
            ) : null}
          </Field>
          <div className="pt-6">
            <Button disabled={!canUpdate || isPending} type="submit">
              Add renewal
            </Button>
          </div>
        </form>
        <Message value={message} />
      </CardContent>
    </Card>
  );
}

function RolesTab({
  assignedRoles,
  canManageRoles,
  highestManagedRank,
  memberId,
  roles,
}: {
  assignedRoles: Array<AssignedRole>;
  canManageRoles: boolean;
  highestManagedRank: number | null;
  memberId: string;
  roles: Array<RoleOption>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setRole(roleId: string, assigned: boolean) {
    setMessage(null);
    setPendingRoleId(roleId);
    startTransition(async () => {
      const result = await setMemberRoleAssignmentAction(memberId, {
        assigned,
        roleId,
      });
      setMessage(result.message ?? null);
      setPendingRoleId(null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="font-bold">Roles</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 p-4">
          {roles.map((role) => {
            const assigned = assignedRoles.find((row) => row.id === role.id);
            const locked =
              !canManageRoles ||
              highestManagedRank === null ||
              role.rank < highestManagedRank;
            const pending = pendingRoleId === role.id;
            return (
              <div
                className="grid gap-3 border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                key={role.id}
              >
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{role.name}</span>
                    {assigned ? <Badge>Assigned</Badge> : null}
                    {locked ? <Badge variant="outline">Locked</Badge> : null}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{role.key}</span>
                    <span>Priority {role.rank}</span>
                    {locked ? (
                      <span>
                        {canManageRoles
                          ? "Above your highest role"
                          : "Role management unavailable"}
                      </span>
                    ) : null}
                  </div>
                </div>
                <Button
                  disabled={locked || isPending || pending}
                  onClick={() => setRole(role.id, !assigned)}
                  size="xs"
                  type="button"
                  variant={assigned ? "outline" : "default"}
                >
                  {locked ? <LockIcon /> : null}
                  {assigned ? "Remove" : "Grant"}
                </Button>
              </div>
            );
          })}
          <Message value={message} />
        </div>
      </CardContent>
    </Card>
  );
}

function ApplicationsTab({
  applications,
  assignedApplications,
  canManageRoles,
  memberId,
}: {
  applications: Array<ApplicationOption>;
  assignedApplications: Array<AssignedApplication>;
  canManageRoles: boolean;
  memberId: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pendingApplicationId, setPendingApplicationId] = useState<
    string | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const assignedApplicationIds = new Set(
    assignedApplications.map((assignment) => assignment.applicationId),
  );
  const visibleApplications = applications.filter(
    (application) =>
      !application.archivedAt || assignedApplicationIds.has(application.id),
  );

  function setAccess(applicationId: string, assigned: boolean) {
    setMessage(null);
    setPendingApplicationId(applicationId);
    startTransition(async () => {
      const result = await setMemberApplicationAccessAction(memberId, {
        applicationId,
        assigned,
      });
      setMessage(result.message ?? null);
      setPendingApplicationId(null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="font-bold">Applications</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 p-4">
          {visibleApplications.map((application) => {
            const assigned = assignedApplicationIds.has(application.id);
            const archived = Boolean(application.archivedAt);
            return (
              <div
                className="grid gap-3 border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                key={application.id}
              >
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {application.name}
                    </span>
                    {archived ? (
                      <Badge variant="outline">Archived</Badge>
                    ) : assigned ? (
                      <Badge>Assigned</Badge>
                    ) : (
                      <Badge variant="outline">Not assigned</Badge>
                    )}
                  </div>
                  {application.description ? (
                    <p className="text-xs text-muted-foreground">
                      {application.description}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{application.keycloakClientId}</span>
                    <span>{application.keycloakRoleName}</span>
                  </div>
                </div>
                {archived ? (
                  <span className="text-xs text-muted-foreground">
                    History only
                  </span>
                ) : (
                  <Button
                    disabled={
                      !canManageRoles ||
                      isPending ||
                      pendingApplicationId === application.id
                    }
                    onClick={() => setAccess(application.id, !assigned)}
                    size="xs"
                    type="button"
                    variant={assigned ? "outline" : "default"}
                  >
                    {assigned ? "Remove access" : "Grant access"}
                  </Button>
                )}
              </div>
            );
          })}
          {!visibleApplications.length ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No applications configured.
            </div>
          ) : null}
          <Message value={message} />
        </div>
      </CardContent>
    </Card>
  );
}

export function MemberDetailManagement({
  addresses,
  applications,
  assignedApplications,
  assignedRoles,
  canDelete,
  canManageRoles,
  canUpdate,
  contacts,
  highestManagedRank,
  member,
  memberships,
  roles,
}: {
  addresses: Array<AddressRow>;
  applications: Array<ApplicationOption>;
  assignedApplications: Array<AssignedApplication>;
  assignedRoles: Array<AssignedRole>;
  canDelete: boolean;
  canManageRoles: boolean;
  canUpdate: boolean;
  contacts: Array<ContactRow>;
  highestManagedRank: number | null;
  member: MemberDetail;
  memberships: Array<MembershipRow>;
  roles: Array<RoleOption>;
}) {
  const fullName = `${member.firstName} ${member.lastName}`.trim();
  const age = member.dateOfBirth
    ? differenceInYears(new Date(), parseDateOnly(member.dateOfBirth))
    : null;
  const profileKey = [
    member.id,
    member.firstName,
    member.lastName,
    member.notes ?? "",
    member.primaryEmail,
    member.username,
  ].join(":");
  const contactsKey = [
    member.id,
    ...contacts.map((contact) =>
      [
        contact.id,
        contact.type,
        contact.value,
        contact.label ?? "",
        contact.isPrimary ? "primary" : "secondary",
        contact.sortOrder,
      ].join(":"),
    ),
  ].join("|");

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">
              {fullName || member.username}
            </h1>
            {age !== null ? (
              <span className="text-sm font-normal text-muted-foreground">
                ({age})
              </span>
            ) : null}
            {member.disabledAt ? (
              <Badge variant="outline">Disabled</Badge>
            ) : (
              <Badge>Active</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            @{member.username} - {member.primaryEmail || "No primary email"}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/members">Back to members</Link>
        </Button>
      </div>

      <ProfileTab
        canDelete={canDelete}
        canUpdate={canUpdate}
        key={profileKey}
        member={member}
      />

      <ContactsTab
        canUpdate={canUpdate}
        contacts={contacts}
        key={contactsKey}
        memberId={member.id}
      />

      <AddressesTab
        addresses={addresses}
        canUpdate={canUpdate}
        memberId={member.id}
      />

      <MembershipsTab
        canUpdate={canUpdate}
        memberId={member.id}
        memberships={memberships}
      />

      <RolesTab
        assignedRoles={assignedRoles}
        canManageRoles={canManageRoles}
        highestManagedRank={highestManagedRank}
        memberId={member.id}
        roles={roles}
      />

      <ApplicationsTab
        applications={applications}
        assignedApplications={assignedApplications}
        canManageRoles={canManageRoles}
        memberId={member.id}
      />

      {/* <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="addresses">Addresses</TabsTrigger>
          <TabsTrigger value="memberships">Memberships</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-4" value="overview">
          <ProfileTab canUpdate={canUpdate} member={member} />
        </TabsContent>
        <TabsContent className="mt-4" value="contacts">
          <ContactsTab
            canUpdate={canUpdate}
            contacts={contacts}
            memberId={member.id}
          />
        </TabsContent>
        <TabsContent className="mt-4" value="addresses">
          <AddressesTab
            addresses={addresses}
            canUpdate={canUpdate}
            memberId={member.id}
          />
        </TabsContent>
        <TabsContent className="mt-4" value="memberships">
          <MembershipsTab
            canUpdate={canUpdate}
            memberId={member.id}
            memberships={memberships}
          />
        </TabsContent>
        <TabsContent className="mt-4" value="roles">
          <RolesTab
            assignedRoles={assignedRoles}
            canManageRoles={canManageRoles}
            memberId={member.id}
            roles={roles}
          />
        </TabsContent>
      </Tabs> */}
    </div>
  );
}
