"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";

import {
  deleteMyAddressAction,
  deleteMyContactAction,
  updateMyProfileAction,
  upsertMyAddressAction,
  upsertMyContactAction,
} from "@/actions/me";
import { DiscordLinkDialog } from "@/components/me/discord-link-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ADDRESS_LABELS,
  CONTACT_TYPES,
  type AddressLabel,
  type ContactType,
} from "@/db/schema";
import { formatSlovenianDate, parseDateOnly } from "@/lib/date-format";
import {
  residenceRegions,
  type ResidenceRegion,
} from "@/lib/membership-applications";
import type { AddressInput, ContactInput } from "@/lib/validation/members";
import type { SelfProfileInput } from "@/lib/validation/me";

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

type ProfileMember = {
  addresses: Array<AddressRow>;
  contacts: Array<ContactRow>;
  dateOfBirth: string | null;
  discordUserId: string | null;
  firstName: string;
  fullLegalName: string;
  id: string;
  lastName: string;
  placeOfBirth: string | null;
  primaryEmail: string;
  residenceRegion: string | null;
  username: string;
};

type ProfileFieldErrors = Partial<Record<keyof SelfProfileInput, string>>;
type ContactFieldErrors = Partial<Record<keyof ContactInput, string>>;
type AddressFieldErrors = Partial<Record<keyof AddressInput, string>>;

const contactTypeValues: ReadonlyArray<string> = CONTACT_TYPES;
const addressLabelValues: ReadonlyArray<string> = ADDRESS_LABELS;
const residenceRegionValues: ReadonlyArray<string> = residenceRegions;

function isContactType(value: string): value is ContactType {
  return contactTypeValues.includes(value);
}

function isAddressLabel(value: string): value is AddressLabel {
  return addressLabelValues.includes(value);
}

function isResidenceRegion(value: string): value is ResidenceRegion {
  return residenceRegionValues.includes(value);
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2">{children}</div>;
}

function Message({
  tone = "muted",
  value,
}: {
  tone?: "muted" | "destructive";
  value: string | null;
}) {
  if (!value) return null;

  return (
    <p
      className={
        tone === "destructive"
          ? "text-xs font-medium text-destructive"
          : "text-xs font-medium text-muted-foreground"
      }
    >
      {value}
    </p>
  );
}

function FieldError({ value }: { value?: string }) {
  if (!value) return null;

  return <p className="text-xs text-destructive">{value}</p>;
}

function getFormattedBirthDate(value: string | null) {
  if (!value) return null;

  return formatSlovenianDate(parseDateOnly(value));
}

function getInitialResidenceRegion(value: string | null): ResidenceRegion | "" {
  if (!value || !isResidenceRegion(value)) return "";

  return value;
}

function ProfileCard({ member }: { member: ProfileMember }) {
  const router = useRouter();
  const [profileForm, setProfileForm] = useState<SelfProfileInput>({
    dateOfBirth: member.dateOfBirth ?? "",
    firstName: member.firstName,
    fullLegalName: member.fullLegalName,
    lastName: member.lastName,
    placeOfBirth: member.placeOfBirth ?? "",
    primaryEmail: member.primaryEmail,
    residenceRegion: getInitialResidenceRegion(member.residenceRegion),
  });
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"muted" | "destructive">(
    "muted",
  );
  const [isPending, startTransition] = useTransition();
  const formattedBirthDate = getFormattedBirthDate(member.dateOfBirth);

  function setProfileField<Key extends keyof SelfProfileInput>(
    key: Key,
    value: SelfProfileInput[Key],
  ) {
    setProfileForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setMessage(null);
    startTransition(async () => {
      const result = await updateMyProfileAction(profileForm);
      setMessage(result.message ?? null);
      setMessageTone(result.ok ? "muted" : "destructive");
      if (result.ok) {
        setFieldErrors({});
        router.refresh();
      } else {
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="font-bold">Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 p-4" onSubmit={submit}>
          <Message tone={messageTone} value={message} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <Label className="text-xs" htmlFor="firstName">
                First name
              </Label>
              <Input
                aria-invalid={Boolean(fieldErrors.firstName)}
                id="firstName"
                name="firstName"
                onChange={(event) =>
                  setProfileField("firstName", event.target.value)
                }
                required
                value={profileForm.firstName}
              />
              <FieldError value={fieldErrors.firstName} />
            </Field>
            <Field>
              <Label className="text-xs" htmlFor="lastName">
                Last name
              </Label>
              <Input
                aria-invalid={Boolean(fieldErrors.lastName)}
                id="lastName"
                name="lastName"
                onChange={(event) =>
                  setProfileField("lastName", event.target.value)
                }
                required
                value={profileForm.lastName}
              />
              <FieldError value={fieldErrors.lastName} />
            </Field>
          </div>
          <Field>
            <Label className="text-xs" htmlFor="fullLegalName">
              Full legal name
            </Label>
            <Input
              aria-invalid={Boolean(fieldErrors.fullLegalName)}
              id="fullLegalName"
              name="fullLegalName"
              onChange={(event) =>
                setProfileField("fullLegalName", event.target.value)
              }
              required
              value={profileForm.fullLegalName}
            />
            <FieldError value={fieldErrors.fullLegalName} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <Label className="text-xs" htmlFor="primaryEmail">
                Primary email
              </Label>
              <Input
                aria-invalid={Boolean(fieldErrors.primaryEmail)}
                id="primaryEmail"
                name="primaryEmail"
                onChange={(event) =>
                  setProfileField("primaryEmail", event.target.value)
                }
                required
                type="email"
                value={profileForm.primaryEmail}
              />
              <FieldError value={fieldErrors.primaryEmail} />
            </Field>
            <Field>
              <Label className="text-xs" htmlFor="username">
                Username
              </Label>
              <Input
                id="username"
                name="username"
                readOnly
                value={member.username}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <Label className="text-xs" htmlFor="dateOfBirth">
                Date of birth
              </Label>
              <Input
                aria-invalid={Boolean(fieldErrors.dateOfBirth)}
                id="dateOfBirth"
                name="dateOfBirth"
                onChange={(event) =>
                  setProfileField("dateOfBirth", event.target.value)
                }
                type="date"
                value={profileForm.dateOfBirth}
              />
              {formattedBirthDate ? (
                <p className="text-xs text-muted-foreground">
                  {formattedBirthDate}
                </p>
              ) : null}
              <FieldError value={fieldErrors.dateOfBirth} />
            </Field>
            <Field>
              <Label className="text-xs" htmlFor="placeOfBirth">
                Place of birth
              </Label>
              <Input
                aria-invalid={Boolean(fieldErrors.placeOfBirth)}
                id="placeOfBirth"
                name="placeOfBirth"
                onChange={(event) =>
                  setProfileField("placeOfBirth", event.target.value)
                }
                value={profileForm.placeOfBirth}
              />
              <FieldError value={fieldErrors.placeOfBirth} />
            </Field>
          </div>
          <Field>
            <Label className="text-xs" htmlFor="residenceRegion">
              Residence region
            </Label>
            <select
              aria-invalid={Boolean(fieldErrors.residenceRegion)}
              className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20"
              id="residenceRegion"
              name="residenceRegion"
              onChange={(event) => {
                const { value } = event.target;
                if (value === "" || isResidenceRegion(value)) {
                  setProfileField("residenceRegion", value);
                }
              }}
              value={profileForm.residenceRegion}
            >
              <option value="">No region</option>
              {residenceRegions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
            <FieldError value={fieldErrors.residenceRegion} />
          </Field>
          <div className="border-t pt-4">
            <Button disabled={isPending} type="submit">
              {isPending ? "Saving..." : "Save profile"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const emptyContactForm: ContactInput = {
  isPrimary: false,
  label: "",
  type: "email",
  value: "",
};

function ContactsCard({
  contacts,
  discordUserId,
}: {
  contacts: Array<ContactRow>;
  discordUserId: string | null;
}) {
  const router = useRouter();
  const discordContact = contacts.find((contact) => contact.type === "discord");
  const otherContacts = contacts.filter(
    (contact) => contact.type !== "discord",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contactForm, setContactForm] =
    useState<ContactInput>(emptyContactForm);
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"muted" | "destructive">(
    "muted",
  );
  const [isPending, startTransition] = useTransition();

  function startEditing(contact: ContactRow) {
    setEditingId(contact.id);
    setContactForm({
      isPrimary: contact.isPrimary,
      label: contact.label ?? "",
      type: contact.type,
      value: contact.value,
    });
    setFieldErrors({});
    setMessage(null);
  }

  function resetForm() {
    setEditingId(null);
    setContactForm(emptyContactForm);
    setFieldErrors({});
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setMessage(null);
    startTransition(async () => {
      const result = await upsertMyContactAction(
        contactForm,
        editingId ?? undefined,
      );
      setMessage(result.message ?? null);
      setMessageTone(result.ok ? "muted" : "destructive");
      if (result.ok) {
        setFieldErrors({});
        resetForm();
        router.refresh();
      } else {
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  function remove(contactId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await deleteMyContactAction(contactId);
      setMessage(result.message ?? null);
      setMessageTone(result.ok ? "muted" : "destructive");
      if (result.ok) {
        if (editingId === contactId) resetForm();
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="font-bold">Contacts</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-4">
        <Message tone={messageTone} value={message} />
        <div className="grid gap-2">
          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">discord</Badge>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {discordUserId
                  ? discordContact?.value || "linked"
                  : "Not linked"}
              </p>
              <p className="text-xs text-muted-foreground">
                Linked with the /verify-link command in Discord; the username is
                kept in sync automatically.
              </p>
            </div>
            <div className="flex gap-2 sm:justify-end">
              <DiscordLinkDialog
                discordUserId={discordUserId}
                discordUsername={discordContact?.value ?? null}
              />
            </div>
          </div>
          {otherContacts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No contacts on file.
            </p>
          ) : (
            otherContacts.map((contact) => (
              <div
                className="grid gap-3 rounded-md border p-3 sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-center"
                key={contact.id}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{contact.type}</Badge>
                  {contact.isPrimary ? (
                    <Badge variant="secondary">Primary</Badge>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {contact.value}
                  </p>
                  {contact.label ? (
                    <p className="text-xs text-muted-foreground">
                      {contact.label}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2 sm:justify-end">
                  <Button
                    disabled={isPending}
                    onClick={() => startEditing(contact)}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <PencilIcon />
                    Edit
                  </Button>
                  <Button
                    disabled={isPending}
                    onClick={() => remove(contact.id)}
                    size="xs"
                    type="button"
                    variant="destructive"
                  >
                    <Trash2Icon />
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
        <form className="grid gap-3 rounded-md border p-3" onSubmit={submit}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold">
              {editingId ? "Edit contact" : "Add contact"}
            </p>
            {editingId ? (
              <Button
                disabled={isPending}
                onClick={resetForm}
                size="xs"
                type="button"
                variant="outline"
              >
                <XIcon />
                Cancel
              </Button>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)_160px]">
            <Field>
              <Label className="text-xs">Type</Label>
              <Select
                onValueChange={(value) => {
                  if (isContactType(value)) {
                    setContactForm((current) => ({ ...current, type: value }));
                    setFieldErrors((current) => ({
                      ...current,
                      type: undefined,
                    }));
                  }
                }}
                value={contactForm.type}
              >
                <SelectTrigger
                  aria-invalid={Boolean(fieldErrors.type)}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPES.filter((type) => type !== "discord").map(
                    (type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <FieldError value={fieldErrors.type} />
            </Field>
            <Field>
              <Label className="text-xs" htmlFor="contactValue">
                Value
              </Label>
              <Input
                aria-invalid={Boolean(fieldErrors.value)}
                id="contactValue"
                onChange={(event) => {
                  setContactForm((current) => ({
                    ...current,
                    value: event.target.value,
                  }));
                  setFieldErrors((current) => ({
                    ...current,
                    value: undefined,
                  }));
                }}
                required
                value={contactForm.value}
              />
              <FieldError value={fieldErrors.value} />
            </Field>
            <Field>
              <Label className="text-xs" htmlFor="contactLabel">
                Label
              </Label>
              <Input
                aria-invalid={Boolean(fieldErrors.label)}
                id="contactLabel"
                onChange={(event) => {
                  setContactForm((current) => ({
                    ...current,
                    label: event.target.value,
                  }));
                  setFieldErrors((current) => ({
                    ...current,
                    label: undefined,
                  }));
                }}
                value={contactForm.label}
              />
              <FieldError value={fieldErrors.label} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={contactForm.isPrimary}
                id="contactIsPrimary"
                onCheckedChange={(checked) =>
                  setContactForm((current) => ({
                    ...current,
                    isPrimary: checked === true,
                  }))
                }
              />
              <Label className="text-xs font-normal" htmlFor="contactIsPrimary">
                Primary
              </Label>
            </div>
            <Button disabled={isPending} type="submit">
              <PlusIcon />
              {editingId ? "Save contact" : "Add contact"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const emptyAddressForm: AddressInput = {
  city: "",
  country: "",
  label: "primary",
  postalCode: "",
  street: "",
};

function AddressesCard({ addresses }: { addresses: Array<AddressRow> }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addressForm, setAddressForm] =
    useState<AddressInput>(emptyAddressForm);
  const [fieldErrors, setFieldErrors] = useState<AddressFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"muted" | "destructive">(
    "muted",
  );
  const [isPending, startTransition] = useTransition();

  function setAddressField<Key extends keyof AddressInput>(
    key: Key,
    value: AddressInput[Key],
  ) {
    setAddressForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function startEditing(address: AddressRow) {
    setEditingId(address.id);
    setAddressForm({
      city: address.city,
      country: address.country,
      label: address.label,
      postalCode: address.postalCode,
      street: address.street,
    });
    setFieldErrors({});
    setMessage(null);
  }

  function resetForm() {
    setEditingId(null);
    setAddressForm(emptyAddressForm);
    setFieldErrors({});
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setMessage(null);
    startTransition(async () => {
      const result = await upsertMyAddressAction(
        addressForm,
        editingId ?? undefined,
      );
      setMessage(result.message ?? null);
      setMessageTone(result.ok ? "muted" : "destructive");
      if (result.ok) {
        setFieldErrors({});
        resetForm();
        router.refresh();
      } else {
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  function remove(addressId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await deleteMyAddressAction(addressId);
      setMessage(result.message ?? null);
      setMessageTone(result.ok ? "muted" : "destructive");
      if (result.ok) {
        if (editingId === addressId) resetForm();
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="font-bold">Addresses</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-4">
        <Message tone={messageTone} value={message} />
        <div className="grid gap-2">
          {addresses.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No addresses on file.
            </p>
          ) : (
            addresses.map((address) => (
              <div
                className="grid gap-3 rounded-md border p-3 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center"
                key={address.id}
              >
                <Badge variant="outline">{address.label}</Badge>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {address.street}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {address.postalCode} {address.city}, {address.country}
                  </p>
                </div>
                <div className="flex gap-2 sm:justify-end">
                  <Button
                    disabled={isPending}
                    onClick={() => startEditing(address)}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <PencilIcon />
                    Edit
                  </Button>
                  <Button
                    disabled={isPending}
                    onClick={() => remove(address.id)}
                    size="xs"
                    type="button"
                    variant="destructive"
                  >
                    <Trash2Icon />
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
        <form className="grid gap-3 rounded-md border p-3" onSubmit={submit}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold">
              {editingId ? "Edit address" : "Add address"}
            </p>
            {editingId ? (
              <Button
                disabled={isPending}
                onClick={resetForm}
                size="xs"
                type="button"
                variant="outline"
              >
                <XIcon />
                Cancel
              </Button>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
            <Field>
              <Label className="text-xs">Label</Label>
              <Select
                onValueChange={(value) => {
                  if (isAddressLabel(value)) {
                    setAddressField("label", value);
                  }
                }}
                value={addressForm.label}
              >
                <SelectTrigger
                  aria-invalid={Boolean(fieldErrors.label)}
                  className="w-full"
                >
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
              <FieldError value={fieldErrors.label} />
            </Field>
            <Field>
              <Label className="text-xs" htmlFor="addressStreet">
                Street
              </Label>
              <Input
                aria-invalid={Boolean(fieldErrors.street)}
                id="addressStreet"
                onChange={(event) =>
                  setAddressField("street", event.target.value)
                }
                required
                value={addressForm.street}
              />
              <FieldError value={fieldErrors.street} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)]">
            <Field>
              <Label className="text-xs" htmlFor="addressCity">
                City
              </Label>
              <Input
                aria-invalid={Boolean(fieldErrors.city)}
                id="addressCity"
                onChange={(event) =>
                  setAddressField("city", event.target.value)
                }
                required
                value={addressForm.city}
              />
              <FieldError value={fieldErrors.city} />
            </Field>
            <Field>
              <Label className="text-xs" htmlFor="addressPostalCode">
                Postal code
              </Label>
              <Input
                aria-invalid={Boolean(fieldErrors.postalCode)}
                id="addressPostalCode"
                onChange={(event) =>
                  setAddressField("postalCode", event.target.value)
                }
                required
                value={addressForm.postalCode}
              />
              <FieldError value={fieldErrors.postalCode} />
            </Field>
            <Field>
              <Label className="text-xs" htmlFor="addressCountry">
                Country
              </Label>
              <Input
                aria-invalid={Boolean(fieldErrors.country)}
                id="addressCountry"
                onChange={(event) =>
                  setAddressField("country", event.target.value)
                }
                required
                value={addressForm.country}
              />
              <FieldError value={fieldErrors.country} />
            </Field>
          </div>
          <div className="border-t pt-3">
            <Button disabled={isPending} type="submit">
              <PlusIcon />
              {editingId ? "Save address" : "Add address"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function ProfileManagement({ member }: { member: ProfileMember }) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">My profile</h1>
        <p className="text-xs text-muted-foreground">
          Review and update your member information.
        </p>
      </div>
      <ProfileCard member={member} />
      <ContactsCard
        contacts={member.contacts}
        discordUserId={member.discordUserId}
      />
      <AddressesCard addresses={member.addresses} />
    </div>
  );
}
