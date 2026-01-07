# Supabase Authentication Implementation

This document explains how authentication is implemented in this Next.js project using Supabase Auth.

## Overview

The project uses Supabase for authentication, providing user login, logout, and session management. Authentication is handled both on the client-side and server-side, with middleware protecting routes and API endpoints checking for authenticated users.

## Key Components

### 1. Supabase Client Configuration

#### Browser Client (`lib/supabaseClient.ts`)

```typescript
import { createBrowserClient } from "@supabase/ssr";

export const supabaseClient = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: false, // Don't persist across browser sessions
      autoRefreshToken: false, // Don't auto-refresh tokens
      detectSessionInUrl: true,
    },
  }
);
```

- Uses `@supabase/ssr` for browser client creation.
- Session persistence is disabled, meaning sessions don't survive browser restarts.
- Tokens are not auto-refreshed.
- Detects session from URL (useful for OAuth redirects).

#### Server Client (`lib/supabaseServer.ts`)

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false, // Session only lasts during browser session
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                maxAge: undefined, // Session cookie - expires when browser closes
                expires: undefined,
              })
            );
          } catch {
            // Ignore if called from Server Component
          }
        },
      },
    }
  );
}
```

- Creates a server-side client for API routes and server components.
- Manages cookies for session storage.
- Cookies are set as session cookies (expire when browser closes).

### 2. Middleware Protection (`middleware.ts`)

The middleware intercepts requests to protect routes:

```typescript
export async function middleware(req: NextRequest) {
  // ... logging and setup

  const supabase = createServerClient(/* ... */);
  const pathname = req.nextUrl.pathname;
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    console.error("❌ Auth error:", error);
  }

  if (!user && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return response;
}
```

- Checks user authentication on every request (except static assets).
- Redirects unauthenticated users to `/login` for protected routes.
- Redirects authenticated users away from auth pages (`/login`, `/signup`) to the homepage.
- Uses server-side Supabase client to verify user sessions.

### 3. API Route Protection

API routes check for authentication before processing requests:

#### Jobs API (`app/api/jobs/route.ts`)

```typescript
export async function GET() {
  // AUTH CHECK
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ... rest of the logic
}
```

- Uses `createSupabaseServerClient()` to get the server client.
- Calls `supabase.auth.getUser()` to verify the current user.
- Returns 401 Unauthorized if no user is found.

### 4. Logout Functionality

#### Logout API Route (`app/api/jobs/auth/logout/route.ts`)

```typescript
export async function GET() {
  const supabase = await createSupabaseServerClient();

  // Supabase side logout
  await supabase.auth.signOut();

  // Prepare the response
  const response = NextResponse.redirect(
    new URL("/login", "http://localhost:3000")
  );

  // Delete Supabase cookies properly
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  allCookies.forEach((cookie) => {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.set(cookie.name, "", { maxAge: 0 });
    }
  });

  return response;
}
```

- Signs out the user from Supabase.
- Clears all Supabase-related cookies (starting with 'sb-').
- Redirects to the login page.

#### Client-Side Logout (`components/ChatInterface.tsx`)

```typescript
<button
  onClick={async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "/login";
  }}
  className="ml-4 bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-all shadow-md"
>
  Logout
</button>
```

- Uses the browser client to sign out.
- Redirects to `/login` after logout.

## Authentication Flow

1. **Login/Signup**: Users authenticate via Supabase (presumably through a login page not shown in the provided files).

2. **Session Management**: Sessions are stored in cookies on the server-side. The browser client detects sessions from URLs but doesn't persist them across browser restarts.

3. **Route Protection**: Middleware checks authentication on every request and redirects as needed.

4. **API Protection**: API routes verify user authentication before processing.

5. **Logout**: Clears sessions both on Supabase and locally, then redirects to login.

## Security Considerations

- Sessions are not persisted across browser restarts, enhancing security.
- Tokens are not auto-refreshed, requiring re-authentication.
- Server-side checks prevent unauthorized API access.
- Cookies are properly cleared on logout.

## Environment Variables

Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key

These are used in both client and server configurations.
