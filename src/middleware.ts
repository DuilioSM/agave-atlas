import { NextResponse } from "next/server"

export function middleware() {
  // Middleware básico - la autenticación se maneja en el layout  
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
