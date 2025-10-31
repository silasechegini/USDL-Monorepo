# UDSL React Adapter

The UDSL React Adapter provides seamless integration between [UDSL (Universal Data & State Layer)](../core/README.md) and React applications. It offers React hooks and components for data fetching, mutations, and state management with built-in caching, loading states, and error handling.

## Features

- **React Hooks** - `useData`, `useMutation`, and CRUD-specific hooks
- **Automatic Caching** - Leverages UDSL's SWR (Stale-While-Revalidate) implementation
- **Loading & Error States** - Built-in loading and error state management
- **Context Provider** - Clean dependency injection with `UDSLProvider`
- **TypeScript Support** - Full type safety with excellent IntelliSense
- **Zero Configuration** - Works out of the box with sensible defaults
- **Flexible Setup** - Supports both Provider pattern and global instance

## Installation

```bash
pnpm add @udsl/react-adapter @udsl/core
```

## Quick Start

### 1. Setup UDSL Instance

```typescript
// udsl-setup.ts
import { createUDSL } from "@udsl/core";

export const udslInstance = createUDSL({
  resources: {
    users: {
      get: "https://jsonplaceholder.typicode.com/users",
      cache: 300, // 5 minutes
    },
    posts: {
      get: "https://jsonplaceholder.typicode.com/posts",
      post: "https://jsonplaceholder.typicode.com/posts",
      cache: 180, // 3 minutes
    },
  },
});
```

### 2. Wrap Your App with Provider

```tsx
// App.tsx
import React from "react";
import { UDSLProvider } from "@udsl/react-adapter";
import { udslInstance } from "./udsl-setup";
import UserList from "./components/UserList";

function App() {
  return (
    <UDSLProvider instance={udslInstance}>
      <div className='App'>
        <h1>My UDSL App</h1>
        <UserList />
      </div>
    </UDSLProvider>
  );
}

export default App;
```

### 3. Use Data in Components

```tsx
// components/UserList.tsx
import React from "react";
import { useData } from "@udsl/react-adapter";

interface User {
  id: number;
  name: string;
  email: string;
}

function UserList() {
  const { data: users, loading, error } = useData<User[]>("users");

  if (loading) return <div>Loading users...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {users?.map((user) => (
        <li key={user.id}>
          <strong>{user.name}</strong> - {user.email}
        </li>
      ))}
    </ul>
  );
}

export default UserList;
```

## API Reference

### Components

#### `UDSLProvider`

Provides UDSL instance to child components via React Context.

```tsx
interface UDSLProviderProps {
  instance: UDSL;
  children: React.ReactNode;
}
```

**Example:**

```tsx
<UDSLProvider instance={udslInstance}>
  <App />
</UDSLProvider>
```

### Hooks

#### `useData<T>(key, params?)`

Fetches data for a resource with automatic caching, loading states, and error handling.

**Parameters:**

- `key: string` - Resource key defined in UDSL configuration
- `params?: Record<string, any>` - Optional parameters for the request

**Returns:**

```typescript
{
  data: T | null;
  loading: boolean;
  error: Error | null;
}
```

**Examples:**

```tsx
// Simple data fetching
const { data: users, loading, error } = useData<User[]>("users");

// With parameters
const { data: user, loading, error } = useData<User>("user", { id: 123 });

// With query parameters
const {
  data: posts,
  loading,
  error,
} = useData<Post[]>("posts", {
  limit: 10,
  page: 1,
});
```

#### `useMutation<T, TVariables>(mutationFn)`

Generic hook for performing mutations with loading and error states.

**Parameters:**

- `mutationFn: (udsl: UDSL, variables: TVariables) => Promise<T>` - Function that performs the mutation

**Returns:**

```typescript
{
  data: T | null;
  loading: boolean;
  error: Error | null;
  mutate: (variables: TVariables) => Promise<T>;
  reset: () => void;
}
```

**Example:**

```tsx
const createUser = useMutation<User, { name: string; email: string }>(
  (udsl, variables) => udsl.createResource("users", variables),
);

// Usage
const handleSubmit = async (userData) => {
  try {
    const newUser = await createUser.mutate(userData);
    console.log("User created:", newUser);
  } catch (error) {
    console.error("Failed to create user:", error);
  }
};
```

#### CRUD Mutation Hooks

Pre-built hooks for common CRUD operations:

##### `useCreate<T, TData>(key)`

```tsx
const createUser = useCreate<User, CreateUserData>("users");

await createUser.mutate({
  data: { name: "John", email: "john@example.com" },
  params: { notify: true },
});
```

##### `useUpdate<T, TData>(key)`

```tsx
const updateUser = useUpdate<User, UpdateUserData>("users");

await updateUser.mutate({
  id: 123,
  data: { name: "John Updated" },
  params: { notify: true },
});
```

##### `usePatch<T, TData>(key)`

```tsx
const patchUser = usePatch<User, Partial<User>>("users");

await patchUser.mutate({
  id: 123,
  data: { email: "newemail@example.com" },
});
```

##### `useDelete<T>(key)`

```tsx
const deleteUser = useDelete<User>("users");

await deleteUser.mutate({
  id: 123,
  params: { force: true },
});
```

#### `useUDSL()`

Gets the UDSL instance from context or global instance.

```tsx
const udsl = useUDSL();

// Direct UDSL usage
const handleRefresh = () => {
  udsl.invalidateResource("users");
};
```

### Utility Functions

#### `setGlobalUDSLInstance(instance)`

Sets a global UDSL instance as fallback when no Provider is used.

```typescript
import { setGlobalUDSLInstance } from "@udsl/react-adapter";
import { udslInstance } from "./udsl-setup";

// Set global instance
setGlobalUDSLInstance(udslInstance);

// Now you can use hooks without Provider
function MyComponent() {
  const { data } = useData("users"); // Works without Provider
  return <div>{data?.length} users</div>;
}
```

## Advanced Usage

### Error Handling

```tsx
function UserList() {
  const { data: users, loading, error } = useData<User[]>("users");

  if (loading) return <LoadingSpinner />;

  if (error) {
    // Handle different error types
    if (error.message.includes("Network")) {
      return <NetworkError onRetry={() => window.location.reload()} />;
    }

    if (error.message.includes("Authentication")) {
      return <AuthError onLogin={() => redirectToLogin()} />;
    }

    return <GenericError error={error} />;
  }

  return (
    <div>
      {users?.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
}
```

### Loading States

```tsx
function UserList() {
  const { data: users, loading, error } = useData<User[]>("users");

  return (
    <div>
      <h2>Users {loading && <Spinner />}</h2>

      {error && <ErrorBanner error={error} />}

      {users ? (
        <div className='user-grid'>
          {users.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
        </div>
      ) : (
        !loading && <EmptyState message='No users found' />
      )}
    </div>
  );
}
```

### Optimistic Updates

```tsx
function UserProfile({ userId }: { userId: number }) {
  const { data: user, loading } = useData<User>("user", { id: userId });
  const updateUser = useUpdate<User, Partial<User>>("users");

  const handleNameUpdate = async (newName: string) => {
    // Optimistic update
    const optimisticData = { ...user, name: newName };

    try {
      await updateUser.mutate({
        id: userId,
        data: { name: newName },
      });

      // Force refetch to sync with server
      const udsl = useUDSL();
      udsl.revalidate("user", { id: userId });
    } catch (error) {
      // Revert optimistic update on error
      console.error("Update failed:", error);
      // You might want to show the error and revert UI state
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{user?.name}</h1>
      <button onClick={() => handleNameUpdate("New Name")}>Update Name</button>
    </div>
  );
}
```

### Custom Mutations

```tsx
function PostManager() {
  // Custom mutation for complex operations
  const publishPost = useMutation<Post, { id: number; publishDate: Date }>(
    async (udsl, { id, publishDate }) => {
      // Multiple API calls in one mutation
      const post = await udsl.patchResource<Post>("posts", id, {
        status: "published",
        publishedAt: publishDate.toISOString(),
      });

      // Trigger notifications
      await udsl.createResource("notifications", {
        type: "post_published",
        postId: id,
      });

      return post;
    },
  );

  const handlePublish = async (postId: number) => {
    try {
      await publishPost.mutate({
        id: postId,
        publishDate: new Date(),
      });

      // Invalidate related caches
      const udsl = useUDSL();
      udsl.invalidateResource("posts");
      udsl.invalidateResource("notifications");
    } catch (error) {
      console.error("Failed to publish post:", error);
    }
  };

  return (
    <button onClick={() => handlePublish(123)} disabled={publishPost.loading}>
      {publishPost.loading ? "Publishing..." : "Publish Post"}
    </button>
  );
}
```

## TypeScript Usage

### Defining Resource Types

```typescript
// types/api.ts
export interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string;
}

export interface Post {
  id: number;
  title: string;
  content: string;
  authorId: number;
  createdAt: string;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  avatar?: string;
}
```

### Typed Hook Usage

```tsx
import { User, Post, CreateUserRequest } from "../types/api";

function MyComponent() {
  // Fully typed data, loading, and error
  const { data: users, loading, error } = useData<User[]>("users");

  // Typed mutations
  const createUser = useCreate<User, CreateUserRequest>("users");
  const updateUser = useUpdate<User, Partial<User>>("users");

  // TypeScript will enforce correct variable types
  const handleCreateUser = async () => {
    await createUser.mutate({
      data: {
        name: "John Doe",
        email: "john@example.com",
        // avatar is optional, TypeScript knows this
      },
    });
  };
}
```

## Integration with Authentication

```tsx
// With auth plugin
import { createUDSL } from "@udsl/core";
import { createAuthPlugin } from "@udsl/plugin-auth";

const authPlugin = createAuthPlugin(() => {
  return localStorage.getItem("authToken") || "";
});

const udslInstance = createUDSL({
  resources: {
    profile: { get: "/api/user/profile" },
    posts: {
      get: "/api/posts",
      post: "/api/posts",
    },
  },
});

udslInstance.registerPlugin(authPlugin);

// All requests will now include authentication
function ProfilePage() {
  // This request will automatically include auth headers
  const { data: profile, loading, error } = useData<UserProfile>("profile");

  if (loading) return <div>Loading profile...</div>;
  if (error) return <div>Please log in to view profile</div>;

  return <ProfileCard profile={profile} />;
}
```

## Best Practices

### 1. Resource Organization

```typescript
// Group related resources
const udslInstance = createUDSL({
  resources: {
    // User resources
    users: { get: "/api/users", post: "/api/users" },
    user: { get: "/api/users/:id", put: "/api/users/:id" },

    // Post resources
    posts: { get: "/api/posts", post: "/api/posts" },
    post: {
      get: "/api/posts/:id",
      put: "/api/posts/:id",
      delete: "/api/posts/:id",
    },

    // Cache appropriately
    userProfile: { get: "/api/user/profile", cache: 300 }, // 5 min cache
    notifications: { get: "/api/notifications", cache: 30 }, // 30 sec cache
  },
});
```

### 2. Error Boundaries

```tsx
class DataErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong with data loading.</div>;
    }

    return this.props.children;
  }
}

// Usage
<DataErrorBoundary>
  <UserList />
</DataErrorBoundary>;
```

### 3. Performance Optimization

```tsx
// Memoize expensive operations
const UserList = React.memo(function UserList() {
  const { data: users, loading, error } = useData<User[]>("users");

  const sortedUsers = useMemo(() => {
    return users?.sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {sortedUsers?.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
});
```

## Migration Guide

### From React Query

```tsx
// React Query
const { data, isLoading, error } = useQuery(["users"], fetchUsers);

// UDSL React Adapter
const { data, loading, error } = useData<User[]>("users");
```

### From SWR

```tsx
// SWR
const { data, error, isLoading } = useSWR("/api/users", fetcher);

// UDSL React Adapter
const { data, error, loading } = useData<User[]>("users");
```

## Contributing

This adapter is part of the UDSL monorepo. See the main repository README for contribution guidelines.

## License

MIT License - see the main repository for details.
