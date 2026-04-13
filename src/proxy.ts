import { NextResponse } from "next/server";

import { auth } from "@/auth";

export const proxy = auth((request) => {
  const pathname = request.nextUrl.pathname;
  const isAuthenticated = Boolean(request.auth?.user);
  const forcePasswordChange = Boolean(request.auth?.user?.forcePasswordChange);
  const isSettingsRoute =
    pathname === "/admin/settings" || pathname.startsWith("/admin/settings/");

  if (pathname.startsWith("/admin") && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (
    isAuthenticated &&
    forcePasswordChange &&
    pathname.startsWith("/admin") &&
    !isSettingsRoute
  ) {
    return NextResponse.redirect(new URL("/admin/settings", request.url));
  }

  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(
      new URL(forcePasswordChange ? "/admin/settings" : "/admin", request.url),
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/login"],
};
