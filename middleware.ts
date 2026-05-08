import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const adminPassword = process.env["ADMIN_PASSWORD"];
  const authCookie = request.cookies.get("auth")?.value;
  const isAuthed = adminPassword && authCookie === adminPassword;

  if (!isAuthed && request.nextUrl.pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isAuthed && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron|api/auth).*)",
  ],
};
