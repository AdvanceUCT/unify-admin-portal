/**
 * @fileoverview Applies route-level authentication and role redirects before protected pages render.
 * @module proxy
 */

import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/sign-in", "/accept-invite", "/forgot-password", "/reset-password", "/activate", "/verify"];
const VENDOR_PUBLIC_ROUTES = ["/vendor/sign-in", "/vendor/sign-up", "/vendor/accept-invite"];
const PUBLIC_FILE = /\.(.*)$/;

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isVendorPublicRoute(pathname: string) {
  return VENDOR_PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function shouldSkipProxy(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/favicon.ico" ||
    PUBLIC_FILE.test(pathname)
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (shouldSkipProxy(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request, {
    cookiePrefix: "unify-admin",
  });
  const isSignedIn = Boolean(sessionCookie);

  // The cookie only proves *a* session exists, not its userType (cookie
  // caching is off, so userType isn't available here). Cross-portal checks
  // (a vendor hitting an admin route, or vice versa) are authoritative in
  // the layout guards (requireRole / requireVendorSession), not here.
  if (pathname.startsWith("/vendor")) {
    if (isVendorPublicRoute(pathname)) {
      if (isSignedIn && pathname === "/vendor/sign-in") {
        return NextResponse.redirect(new URL("/vendor", request.url));
      }

      return NextResponse.next();
    }

    if (!isSignedIn) {
      const vendorSignInUrl = new URL("/vendor/sign-in", request.url);
      vendorSignInUrl.searchParams.set("callbackURL", request.nextUrl.pathname);

      return NextResponse.redirect(vendorSignInUrl);
    }

    return NextResponse.next();
  }

  if (isPublicRoute(pathname)) {
    if (isSignedIn && pathname === "/sign-in") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  if (!isSignedIn) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackURL", request.nextUrl.pathname);

    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
