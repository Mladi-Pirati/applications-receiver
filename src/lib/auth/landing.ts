import { hasAnyRole } from "@/lib/auth/permissions";

/**
 * Where an authenticated user should land by default: role holders go to the
 * admin area, everyone else to the member self-service area.
 */
export async function getDefaultLandingPath(): Promise<"/admin" | "/me"> {
  return (await hasAnyRole()) ? "/admin" : "/me";
}
