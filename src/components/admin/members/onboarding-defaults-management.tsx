"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SaveIcon } from "lucide-react";

import { updateOnboardingDefaultsAction } from "@/actions/onboarding";
import {
  DiscordRoleCombobox,
  mergeDiscordRoleOptions,
  type DiscordRoleOption,
} from "@/components/admin/discord-role-combobox";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type ApplicationOption = { id: string; name: string };

export function OnboardingDefaultsManagement({
  applicationOptions,
  defaultApplicationIds,
  defaultDiscordRoles,
  discordRoleLoadMessage,
  discordRoleOptions,
}: {
  applicationOptions: Array<ApplicationOption>;
  defaultApplicationIds: Array<string>;
  defaultDiscordRoles: Array<DiscordRoleOption>;
  discordRoleLoadMessage?: string | null;
  discordRoleOptions: Array<DiscordRoleOption>;
}) {
  const router = useRouter();
  const [applicationIds, setApplicationIds] = useState(defaultApplicationIds);
  const [discordRoles, setDiscordRoles] = useState(defaultDiscordRoles);
  const discordOptions = mergeDiscordRoleOptions(
    defaultDiscordRoles,
    discordRoleOptions,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleApplication(applicationId: string, checked: boolean) {
    setApplicationIds((current) =>
      checked
        ? [...new Set([...current, applicationId])]
        : current.filter((id) => id !== applicationId),
    );
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateOnboardingDefaultsAction({
        applicationIds,
        discordRoles,
      });
      setMessage(result.message ?? null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Application access</CardTitle>
          <CardDescription>
            Granted to newly approved members during provisioning.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {applicationOptions.map((application) => (
            <Label
              className="flex items-center gap-2 rounded-md border p-2"
              key={application.id}
            >
              <Checkbox
                checked={applicationIds.includes(application.id)}
                onCheckedChange={(checked) =>
                  toggleApplication(application.id, checked === true)
                }
              />
              <span>{application.name}</span>
            </Label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discord roles</CardTitle>
          <CardDescription>
            Stored as snapshots and synced after approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <DiscordRoleCombobox
            emptyText="No Discord roles available."
            onValueChange={setDiscordRoles}
            options={discordOptions}
            placeholder="Add default Discord role"
            value={discordRoles}
          />
          <p className="text-xs text-muted-foreground">
            Selected roles are stored as snapshots and synced after approval.
          </p>
          {discordRoleLoadMessage ? (
            <p className="text-xs text-muted-foreground">
              {discordRoleLoadMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 lg:col-span-2">
        <Button disabled={isPending} onClick={save} type="button">
          <SaveIcon />
          Save defaults
        </Button>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </div>
    </div>
  );
}
