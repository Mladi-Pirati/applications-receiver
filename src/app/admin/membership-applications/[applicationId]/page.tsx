import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { MembershipApplicationStatusForm } from "@/components/admin/membership-applications/membership-application-status-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { mladiPiratiMembershipApplications } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import {
  buildMembershipApplicationsListHref,
  buildMembershipApplicationsQueryString,
  getMembershipApplicationStatusVariant,
  membershipApplicationStatusLabels,
  parseMembershipApplicationsFilters,
  participationModeLabels,
  type MembershipApplicationsSearchParams,
  type ParticipationMode,
  type ResidenceRegion,
} from "@/lib/membership-applications";

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const dateOnlyFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "long",
});

function formatDateTime(value: Date) {
  return dateTimeFormatter.format(value);
}

function formatDateOnly(value: string) {
  return dateOnlyFormatter.format(new Date(`${value}T00:00:00`));
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-xs/relaxed text-foreground">{value}</dd>
    </div>
  );
}

export default async function AdminMembershipApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<MembershipApplicationsSearchParams>;
}) {
  await requireAdmin();
  const { applicationId } = await params;
  const filters = parseMembershipApplicationsFilters(await searchParams);
  const backHref = buildMembershipApplicationsListHref(
    buildMembershipApplicationsQueryString(filters),
  );

  const [application] = await db
    .select({
      id: mladiPiratiMembershipApplications.id,
      fullName: mladiPiratiMembershipApplications.fullName,
      dateOfBirth: mladiPiratiMembershipApplications.dateOfBirth,
      placeOfBirth: mladiPiratiMembershipApplications.placeOfBirth,
      streetAddress: mladiPiratiMembershipApplications.streetAddress,
      cityAndPostalCode:
        mladiPiratiMembershipApplications.cityAndPostalCode,
      residenceRegion: mladiPiratiMembershipApplications.residenceRegion,
      email: mladiPiratiMembershipApplications.email,
      phone: mladiPiratiMembershipApplications.phone,
      participationMode: mladiPiratiMembershipApplications.participationMode,
      discordUsername: mladiPiratiMembershipApplications.discordUsername,
      motivation: mladiPiratiMembershipApplications.motivation,
      consentsToDataProcessing:
        mladiPiratiMembershipApplications.consentsToDataProcessing,
      acceptsStatuteAndProgram:
        mladiPiratiMembershipApplications.acceptsStatuteAndProgram,
      status: mladiPiratiMembershipApplications.status,
      createdAt: mladiPiratiMembershipApplications.createdAt,
      updatedAt: mladiPiratiMembershipApplications.updatedAt,
    })
    .from(mladiPiratiMembershipApplications)
    .where(eq(mladiPiratiMembershipApplications.id, applicationId));

  if (!application) {
    notFound();
  }

  const participationMode = application.participationMode as ParticipationMode;
  const residenceRegion = application.residenceRegion as ResidenceRegion;

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={backHref}>Back to applications</Link>
          </Button>
          <div className="grid gap-1">
            <h1 className="text-xl font-semibold">{application.fullName}</h1>
            <p className="text-xs text-muted-foreground">
              Submitted on {formatDateTime(application.createdAt)}
            </p>
          </div>
        </div>
        <Badge variant={getMembershipApplicationStatusVariant(application.status)}>
          {membershipApplicationStatusLabels[application.status]}
        </Badge>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Review</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <MembershipApplicationStatusForm
            applicationId={application.id}
            currentStatus={application.status}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Identity and contact</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Full name" value={application.fullName} />
              <DetailItem label="Email" value={application.email} />
              <DetailItem
                label="Phone"
                value={
                  application.phone ?? (
                    <span className="text-muted-foreground">Not provided</span>
                  )
                }
              />
              <DetailItem
                label="Discord username"
                value={
                  application.discordUsername ?? (
                    <span className="text-muted-foreground">Not provided</span>
                  )
                }
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Address and birth</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailItem
                label="Date of birth"
                value={formatDateOnly(application.dateOfBirth)}
              />
              <DetailItem
                label="Place of birth"
                value={application.placeOfBirth}
              />
              <DetailItem
                label="Street address"
                value={application.streetAddress}
              />
              <DetailItem
                label="City and postal code"
                value={application.cityAndPostalCode}
              />
              <DetailItem label="Residence region" value={residenceRegion} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Participation and motivation</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4">
              <DetailItem
                label="Participation mode"
                value={participationModeLabels[participationMode]}
              />
              <DetailItem
                label="Motivation"
                value={
                  application.motivation ? (
                    <p className="whitespace-pre-wrap">{application.motivation}</p>
                  ) : (
                    <span className="text-muted-foreground">Not provided</span>
                  )
                }
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Consents and metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailItem
                label="Data processing"
                value={
                  <Badge
                    variant={
                      application.consentsToDataProcessing ? "default" : "outline"
                    }
                  >
                    {application.consentsToDataProcessing
                      ? "Granted"
                      : "Missing"}
                  </Badge>
                }
              />
              <DetailItem
                label="Statute and program"
                value={
                  <Badge
                    variant={
                      application.acceptsStatuteAndProgram
                        ? "default"
                        : "outline"
                    }
                  >
                    {application.acceptsStatuteAndProgram
                      ? "Accepted"
                      : "Missing"}
                  </Badge>
                }
              />
              <DetailItem label="Application ID" value={application.id} />
              <DetailItem
                label="Last updated"
                value={formatDateTime(application.updatedAt)}
              />
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
