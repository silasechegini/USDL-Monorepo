# UDSL (Universal Data & State Layer) Monorepo

A **pluggable data orchestration SDK** that provides a unified interface for data fetching, caching, and state management across different frameworks and APIs. UDSL implements **Stale-While-Revalidate (SWR)** patterns with smart caching, automatic background revalidation, and extensible plugin architecture.

##  Features

-  **Stale-While-Revalidate (SWR)** - Serve cached data instantly while revalidating in the background.
-  **Smart Caching** - Automatic cache invalidation with configurable TTL.
-  **Plugin Architecture** - Extensible with authentication, logging, and custom transformations.
-  **Framework Adapters** - React hooks with more frameworks coming soon.
-  **TypeScript First** - Full type safety with excellent IntelliSense support.
-  **RESTful CRUD** - Built-in support for GET, POST, PUT, PATCH, DELETE operations.
-  **Error Handling** - Comprehensive error management with retry strategies.
-  **Promise Deduplication** - Prevents duplicate requests for the same resource.
-  **Authentication Ready** - Built-in auth plugin for Bearer token management.

##  Packages

| Package                                                     | Description                                       | Version |
| ----------------------------------------------------------- | ------------------------------------------------- | ------- |
| [`@udsl/core`](./packages/core/README.md)                   | Core UDSL functionality with SWR implementation   | `0.1.0` |
| [`@udsl/react-adapter`](./packages/react-adapter/README.md) | React hooks and components for UDSL               | `0.1.0` |
| [`@udsl/plugin-auth`](./packages/plugins/auth/README.md)    | Authentication plugin for Bearer token management | `0.1.0` |

##  Quick Start

### 1. Installation

```bash
# Install core and React adapter
pnpm add @udsl/core @udsl/react-adapter

# Optional: Add authentication plugin
pnpm add @udsl/plugin-auth
```

### 2. Basic Setup

```typescript
// udsl-setup.ts
import { createUDSL } from "@udsl/core";
import { createAuthPlugin } from "@udsl/plugin-auth";

// Create UDSL instance
const udsl = createUDSL({
  resources: {
    users: {
      get: "https://jsonplaceholder.typicode.com/users",
      cache: 300, // time is in seconds (5 minutes)
    },
    posts: {
      get: "https://jsonplaceholder.typicode.com/posts",
      post: "https://jsonplaceholder.typicode.com/posts",
      cache: 180, // time is in seconds (3 minutes)
    },
  },
});

// Optional: Add authentication
const authPlugin = createAuthPlugin(() => {
  return localStorage.getItem("authToken") || "";
});
udsl.registerPlugin(authPlugin);

export { udsl };
```

### 3. React Integration

```tsx
// App.tsx
import React from "react";
import { UDSLProvider } from "@udsl/react-adapter";
import { udsl } from "./udsl-setup";
import UserList from "./components/UserList";

function App() {
  return (
    <UDSLProvider instance={udsl}>
      <div className='App'>
        <h1>UDSL Demo</h1>
        <UserList />
      </div>
    </UDSLProvider>
  );
}

export default App;
```

### 4. Using Data in Components

```tsx
// components/UserList.tsx
import React from "react";
import { useData, useCreate } from "@udsl/react-adapter";

interface User {
  id: number;
  name: string;
  email: string;
}

function UserList() {
  const { data: users, loading, error } = useData<User[]>("users");
  const createUser = useCreate<User, Omit<User, "id">>("users");

  const handleCreateUser = async () => {
    await createUser.mutate({
      data: { name: "New User", email: "user@example.com" },
    });
  };

  if (loading) return <div>Loading users...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <button onClick={handleCreateUser} disabled={createUser.loading}>
        {createUser.loading ? "Creating..." : "Create User"}
      </button>
      <ul>
        {users?.map((user) => (
          <li key={user.id}>
            <strong>{user.name}</strong> - {user.email}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default UserList;
```

##  Project Structure

```
UDSL-Monorepo/
├── packages/
│   ├── core/                 # Core UDSL functionality
│   │   ├── src/
│   │   │   ├── udsl.ts      # Main UDSL class with SWR
│   │   │   ├── types.ts     # TypeScript definitions
│   │   │   └── index.ts     # Public API exports
│   │   └── README.md
│   ├── react-adapter/       # React integration
│   │   ├── src/
│   │   │   ├── useData.tsx  # Data fetching hook
│   │   │   ├── useMutation.tsx # Mutation hooks
│   │   │   ├── context.tsx  # React Context provider
│   │   │   └── index.ts     # Public API exports
│   │   └── README.md
│   └── plugins/
│       └── auth/            # Authentication plugin
│           ├── src/
│           │   └── index.ts # Auth plugin implementation
│           └── README.md
├── examples/
│   └── react-demo/         # React example application
│       ├── src/
│       │   ├── App.tsx     # Main app component
│       │   └── udsl-setup.ts # UDSL configuration
│       └── package.json
├── turbo.json              # Turbo build configuration
├── pnpm-workspace.yaml     # PNPM workspace config
└── README.md               # This file
```

##  SWR (Stale-While-Revalidate) Implementation

UDSL implements a robust SWR pattern that:

1. **Serves stale data immediately** - No loading delays for cached content
2. **Revalidates in background** - Fetches fresh data without blocking UI
3. **Deduplicates requests** - Prevents multiple simultaneous requests
4. **Smart cache invalidation** - Automatic cleanup with manual override options

### Example SWR Flow

```typescript
// First request - fetches fresh data
const users1 = await udsl.fetchResource("users"); // ~200ms

// Second request (within lifetime of cached resource) - returns cached data instantly
const users2 = await udsl.fetchResource("users"); // ~1ms

// After cache expires - serves stale data, revalidates in background
const users3 = await udsl.fetchResource("users"); // ~1ms (stale) + background fetch
```

## 🔌 Plugin System

Extend UDSL functionality with plugins:

### Authentication Plugin

```typescript
import { createAuthPlugin } from "@udsl/plugin-auth";

// Simple token from localStorage
const authPlugin = createAuthPlugin(() => {
  return localStorage.getItem("authToken") || "";
});

// Advanced with token refresh
const authPlugin = createAuthPlugin(async () => {
  let token = localStorage.getItem("authToken");
  const expiry = localStorage.getItem("tokenExpiry");

  if (!token || Date.now() > parseInt(expiry)) {
    // Refresh token logic
    const refreshToken = localStorage.getItem("refreshToken");
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${refreshToken}` },
    });
    const data = await response.json();

    localStorage.setItem("authToken", data.access_token);
    localStorage.setItem(
      "tokenExpiry",
      (Date.now() + data.expires_in * 1000).toString(),
    );
    token = data.access_token;
  }

  return token;
});

udsl.registerPlugin(authPlugin);

// you can also choose to implement your own custom authentication plugin. These are just examples to guide.
```

### Custom Plugin Example

```typescript
// Custom logging plugin
const loggingPlugin = {
  beforeFetch: (url: string, init: RequestInit) => {
    console.log(` Fetching: ${init.method} ${url}`);
  },
  afterFetch: (url: string, response: Response) => {
    console.log(` Response: ${response.status} ${url}`);
  },
};

udsl.registerPlugin(loggingPlugin);
```

##  Development

### Prerequisites

- Node.js 18+
- PNPM 9+

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd UDSL-Monorepo

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start development mode
pnpm dev
```

### Scripts

| Command      | Description                       |
| ------------ | --------------------------------- |
| `pnpm build` | Build all packages                |
| `pnpm dev`   | Start development mode with watch |
| `pnpm test`  | Run tests across all packages     |
| `pnpm lint`  | Lint all packages                 |
| `pnpm clean` | Clean and reinstall dependencies  |

### Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
cd packages/core && pnpm test

# Run tests with coverage
pnpm test --coverage

# Run tests in watch mode
pnpm test --watch
```

##  Examples

### Basic Data Fetching

```typescript
// Fetch users
const users = await udsl.fetchResource<User[]>("users");

// Fetch user by ID
const user = await udsl.fetchResource<User>("user", { id: 123 });

// Fetch with query parameters
const posts = await udsl.fetchResource<Post[]>("posts", {
  limit: 10,
  category: "tech",
});
```

### CRUD Operations

```typescript
// Create
const newUser = await udsl.createResource<User>("users", {
  name: "John Doe",
  email: "john@example.com",
});

// Update (full replacement)
const updatedUser = await udsl.updateResource<User>("users", 123, {
  name: "John Updated",
  email: "john.updated@example.com",
});

// Patch (partial update)
const patchedUser = await udsl.patchResource<User>("users", 123, {
  email: "new.email@example.com",
});

// Delete
await udsl.removeResource("users", 123);
```

### Cache Management

```typescript
// Get cache information
const cacheInfo = udsl.getCacheInfo("users");
console.log(cacheInfo); // { isStale: false, isRevalidating: false, ... }

// Manual revalidation
const freshUsers = await udsl.revalidate("users");

// Invalidate specific resource
udsl.invalidateResource("users");

// Clear all cache
udsl.invalidateCache();
```

##  Roadmap

- [ ] **Vue Adapter** - Vue 3 composition API support
- [ ] **Angular Adapter** - Angular services and observables
- [ ] **GraphQL Plugin** - GraphQL query and mutation support
- [ ] **Offline Plugin** - Offline-first capabilities with sync
- [ ] **Real-time Plugin** - WebSocket and SSE integration
- [ ] **Validation Plugin** - Zod/Yup schema validation
- [ ] **Retry Plugin** - Configurable retry strategies
- [ ] **Metrics Plugin** - Performance monitoring and analytics

##  Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `pnpm test`
6. Ensure code is properly formatted: `pnpm lint`
7. Commit your changes: `git commit -m 'Add some feature'`
8. Push to the branch: `git push origin feature/my-feature`
9. Submit a pull request

##  License

MIT License - see the [LICENSE](LICENSE) file for details.

##  Acknowledgments

- Inspired by [SWR](https://swr.vercel.app/) and [React Query](https://tanstack.com/query)
- Built with [TypeScript](https://www.typescriptlang.com/), [Turbo](https://turbo.build/), and [PNPM](https://pnpm.io/)
- Tested with [Vitest](https://vitest.dev/) and [Testing Library](https://testing-library.com/)

---

**UDSL** - Universal Data & State Layer: _Unify your data, amplify your development._
