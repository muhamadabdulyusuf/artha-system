import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  canAccessAdminRoute,
  canAccessOpsRoute,
  isAdminPath,
  isLegacyWorksheetPath,
  isOpsPath,
  parseOpsDepartment,
} from "@/lib/auth/routeAccess";
import { getRouteForRole } from "@/lib/auth/routeAccess";
import { parseStaffSessionCookie, SESSION_COOKIE } from "@/lib/auth/sessionCookie";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isLegacyWorksheetPath(pathname)) {
    const target = pathname.replace(/^\/worksheet/, "/ops");
    return NextResponse.redirect(new URL(target, request.url));
  }

  if (!isAdminPath(pathname) && !isOpsPath(pathname)) {
    return NextResponse.next();
  }

  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  const session = parseStaffSessionCookie(raw);

  if (isAdminPath(pathname)) {
    if (!session || !canAccessAdminRoute(session.role)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  const opsDepartment = parseOpsDepartment(pathname);
  if (!opsDepartment) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (
    !session ||
    !canAccessOpsRoute(session.role, session.department, opsDepartment)
  ) {
    if (session) {
      return NextResponse.redirect(new URL(getRouteForRole(session.role), request.url));
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/ops/:path*", "/worksheet/:path*"],
};
