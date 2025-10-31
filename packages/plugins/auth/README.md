# UDSL Auth Plugin

The UDSL Auth Plugin provides seamless authentication integration for your UDSL-powered applications. It automatically adds Bearer token authentication to all HTTP requests made through UDSL.

## Features

-  **Automatic Bearer Token Injection** - Adds `Authorization: Bearer <token>` to all requests
-  **Dynamic Token Retrieval** - Supports both synchronous and asynchronous token providers
-  **Flexible Integration** - Works with any authentication system (Auth0, Firebase, custom APIs)
-  **Zero Configuration** - Just provide a token callback function
-  **Token Refresh Support** - Built-in support for automatic token refresh patterns

## Installation

```bash
pnpm add @udsl/plugin-auth
```

## Quick Start

```typescript
import { createUDSL } from "@udsl/core";
import { createAuthPlugin } from "@udsl/plugin-auth";

// Create auth plugin with token provider
const authPlugin = createAuthPlugin(() => {
  return localStorage.getItem("authToken") || "";
});

// Create UDSL instance and register plugin
const udsl = createUDSL({
  resources: {
    users: { get: "https://api.example.com/users" },
  },
});

udsl.registerPlugin(authPlugin);

// All requests will now include: Authorization: Bearer <your-token>
const users = await udsl.fetchResource("users");
```

## API Reference

### `createAuthPlugin(getToken)`

Creates an authentication plugin that automatically adds Bearer tokens to requests.

**Parameters:**

- `getToken: () => string | Promise<string>` - Function that returns the authentication token

**Returns:**

- `UDSLPlugin` - Plugin instance ready to be registered with UDSL

## Authentication Patterns

### 1. localStorage Token (Most Common)

Perfect for Single Page Applications (SPAs) where tokens are stored in browser storage.

```typescript
const authPlugin = createAuthPlugin(() => {
  const token = localStorage.getItem("authToken");
  if (!token) {
    throw new Error("No authentication token found. Please log in.");
  }
  return token;
});
```

### 2. Auth Service Integration

#### Auth0 Integration

```typescript
const authPlugin = createAuthPlugin(async () => {
  const auth0 = getAuth0Instance(); // your Auth0 client
  return await auth0.getAccessTokenSilently();
});
```

#### Firebase Integration

```typescript
const authPlugin = createAuthPlugin(async () => {
  const user = auth.currentUser; // Firebase auth
  if (!user) throw new Error("User not authenticated");
  return await user.getIdToken();
});
```

#### Custom API Integration

```typescript
const authPlugin = createAuthPlugin(async () => {
  const response = await fetch("/api/auth/token", {
    method: "POST",
    credentials: "include", // includes session cookies
  });

  if (!response.ok) {
    throw new Error("Failed to get auth token");
  }

  const data = await response.json();
  return data.access_token;
});
```

### 3. Automatic Token Refresh

For production applications that need to handle token expiration gracefully.

```typescript
const authPlugin = createAuthPlugin(async () => {
  let token = localStorage.getItem("authToken");
  const expiry = localStorage.getItem("tokenExpiry");

  // Check if token is expired or about to expire (5 min buffer)
  const isExpired =
    !token || !expiry || Date.now() > parseInt(expiry) - 5 * 60 * 1000;

  if (isExpired) {
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) {
      // Redirect to login
      window.location.href = "/login";
      throw new Error("Authentication required");
    }

    try {
      // Refresh the token
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${refreshToken}`,
        },
      });

      if (!response.ok) {
        localStorage.clear();
        window.location.href = "/login";
        throw new Error("Session expired");
      }

      const data = await response.json();

      // Store new tokens
      localStorage.setItem("authToken", data.access_token);
      localStorage.setItem(
        "tokenExpiry",
        (Date.now() + data.expires_in * 1000).toString(),
      );

      if (data.refresh_token) {
        localStorage.setItem("refreshToken", data.refresh_token);
      }

      token = data.access_token;
    } catch (error) {
      console.error("Token refresh failed:", error);
      throw error;
    }
  }

  return token;
});
```

## React Integration

When using with React and the UDSL React adapter:

```typescript
// udsl-setup.ts
import { createUDSL } from "@udsl/core";
import { createAuthPlugin } from "@udsl/plugin-auth";

export function initUDSL() {
  const udsl = createUDSL({
    resources: {
      users: { get: "https://api.example.com/users" },
    },
  });

  const authPlugin = createAuthPlugin(() => {
    return localStorage.getItem("authToken") ?? "default-token";
  });

  udsl.registerPlugin(authPlugin);
  return udsl;
}
```

```tsx
// App.tsx
import { UDSLProvider } from "@udsl/react-adapter";
import { initUDSL } from "./udsl-setup";

const udslInstance = initUDSL();

function App() {
  return (
    <UDSLProvider instance={udslInstance}>
      <UserList />
    </UDSLProvider>
  );
}

// UserList.tsx - Authentication is handled automatically
import { useData } from "@udsl/react-adapter";

function UserList() {
  const { data: users, loading, error } = useData("users");

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {users?.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

## Error Handling

The auth plugin integrates with UDSL's error handling. If token retrieval fails, the request will fail with a descriptive error:

```typescript
const authPlugin = createAuthPlugin(() => {
  const token = localStorage.getItem("authToken");
  if (!token) {
    // This error will bubble up through UDSL
    throw new Error("Authentication required: Please log in");
  }
  return token;
});
```

## Security Best Practices

1. **Token Storage**: Store tokens securely (consider httpOnly cookies for sensitive apps)
2. **Token Expiration**: Always implement token refresh to handle expiration
3. **Error Handling**: Gracefully handle authentication failures
4. **HTTPS Only**: Always use HTTPS in production
5. **Token Validation**: Validate tokens on the backend

## TypeScript Support

The plugin is fully typed and provides excellent TypeScript integration:

```typescript
import type { UDSLPlugin } from "@udsl/core";

// The plugin is strongly typed
const authPlugin: UDSLPlugin = createAuthPlugin(() => "token");
```

## Plugin Architecture

The auth plugin implements the UDSL plugin interface:

```typescript
interface UDSLPlugin {
  beforeFetch?: (url: string, init: RequestInit) => Promise<void> | void;
  afterFetch?: (url: string, response: Response) => Promise<void> | void;
}
```

It uses the `beforeFetch` hook to inject the Authorization header before each request is made.

## Contributing

This plugin is part of the UDSL monorepo. See the main repository README for contribution guidelines.

## License

MIT License - see the main repository for details.
