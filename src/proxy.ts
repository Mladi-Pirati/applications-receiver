import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isAppSessionUser } from "@/lib/auth/session";

export const proxy = auth((request) => {
  const pathname = request.nextUrl.pathname;
  const isAuthenticated = isAppSessionUser(request.auth?.user);

  if (
    (pathname.startsWith("/admin") || pathname.startsWith("/me")) &&
    !isAuthenticated
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/me/:path*", "/login"],
};
