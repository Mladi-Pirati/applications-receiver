export const residenceRegions = [
  "Pomurska",
  "Podravska",
  "Koroška",
  "Savinjska",
  "Zasavska",
  "Posavska",
  "Jugovzhodna Slovenija",
  "Osrednjeslovenska",
  "Gorenjska",
  "Primorsko-notranjska",
  "Goriška",
  "Obalno-kraška",
] as const;

export type ResidenceRegion = (typeof residenceRegions)[number];

export const participationModes = [
  "Podpornik (prejemaš redne novice o delovanju ter vabila na dogodke)",
  "Aktiven član (se aktivno udejstvuješ)",
] as const;

export type ParticipationMode = (typeof participationModes)[number];

export const participationModeLabels: Record<ParticipationMode, string> = {
  "Podpornik (prejemaš redne novice o delovanju ter vabila na dogodke)":
    "Podpornik",
  "Aktiven član (se aktivno udejstvuješ)": "Aktiven član",
};

export const membershipApplicationStatuses = [
  "new",
  "in_review",
  "approved",
  "rejected",
] as const;

export type MembershipApplicationStatus =
  (typeof membershipApplicationStatuses)[number];

export const membershipApplicationStatusLabels: Record<
  MembershipApplicationStatus,
  string
> = {
  new: "New",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
};

export type MembershipApplicationsSearchParams = {
  q?: string | string[] | undefined;
  status?: string | string[] | undefined;
  mode?: string | string[] | undefined;
};

export type MembershipApplicationsListFilters = {
  q: string;
  status?: MembershipApplicationStatus;
  mode?: ParticipationMode;
};

function getSingleSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function isMembershipApplicationStatus(
  value: string | undefined,
): value is MembershipApplicationStatus {
  return membershipApplicationStatuses.includes(
    value as MembershipApplicationStatus,
  );
}

export function isParticipationMode(
  value: string | undefined,
): value is ParticipationMode {
  return participationModes.includes(value as ParticipationMode);
}

export function parseMembershipApplicationsFilters(
  rawSearchParams: MembershipApplicationsSearchParams,
): MembershipApplicationsListFilters {
  const q = getSingleSearchParam(rawSearchParams.q)?.trim() ?? "";
  const status = getSingleSearchParam(rawSearchParams.status);
  const mode = getSingleSearchParam(rawSearchParams.mode);

  return {
    q,
    status: isMembershipApplicationStatus(status) ? status : undefined,
    mode: isParticipationMode(mode) ? mode : undefined,
  };
}

export function buildMembershipApplicationsQueryString(
  filters: MembershipApplicationsListFilters,
) {
  const searchParams = new URLSearchParams();

  if (filters.q) {
    searchParams.set("q", filters.q);
  }

  if (filters.status) {
    searchParams.set("status", filters.status);
  }

  if (filters.mode) {
    searchParams.set("mode", filters.mode);
  }

  return searchParams.toString();
}

export function buildMembershipApplicationsListHref(queryString: string) {
  return queryString
    ? `/admin/membership-applications?${queryString}`
    : "/admin/membership-applications";
}

export function buildMembershipApplicationDetailsHref(
  applicationId: string,
  queryString: string,
) {
  return queryString
    ? `/admin/membership-applications/${applicationId}?${queryString}`
    : `/admin/membership-applications/${applicationId}`;
}

export function getMembershipApplicationStatusVariant(
  status: MembershipApplicationStatus,
) {
  switch (status) {
    case "approved":
      return "default";
    case "in_review":
      return "secondary";
    case "rejected":
      return "destructive";
    default:
      return "outline";
  }
}
