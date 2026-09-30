import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  // No auth required — URL is private
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron|api/auth).*)",
  ],
};
