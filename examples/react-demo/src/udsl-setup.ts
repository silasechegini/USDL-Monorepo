import { createUDSL, UDSL } from "@udsl/core";
import { createAuthPlugin } from "@udsl/plugin-auth";

export function initUDSL(): UDSL {
  // Create UDSL instance first
  const udslInstance = createUDSL({
    resources: {
      users: { get: "https://jsonplaceholder.typicode.com/users", cache: 300 },
      products: { get: "https://fakestoreapi.com/products", cache: 600 },
    },
  });

  // PRACTICAL AUTH EXAMPLES:

  // Example 1: Token from localStorage (most common in SPAs)
  const authPlugin = createAuthPlugin(() => {
    const token = localStorage.getItem("authToken") ?? "custom-default-token";
    if (!token) {
      // In a real app, you might redirect to login instead
      throw new Error("No authentication token found. Please log in.");
    }
    return token;
  });

  // Example 2: Token from authentication service (like Auth0, Firebase, etc.)
  // const authPlugin = createAuthPlugin(async () => {
  //   // This is how you'd integrate with popular auth services:
  //
  //   // Auth0 example:
  //   // const auth0 = getAuth0Instance(); // your auth0 client
  //   // return await auth0.getAccessTokenSilently();
  //
  //   // Firebase example:
  //   // const user = auth.currentUser; // Firebase auth
  //   // return await user.getIdToken();
  //
  //   // Custom API example:
  //   const response = await fetch('/api/auth/token', {
  //     method: 'POST',
  //     credentials: 'include', // includes cookies for session-based auth
  //   });
  //   if (!response.ok) throw new Error('Failed to get auth token');
  //   const data = await response.json();
  //   return data.access_token;
  // });

  // Example 3: Token with automatic refresh
  // const authPlugin = createAuthPlugin(async () => {
  //   let token = localStorage.getItem('authToken');
  //   const expiry = localStorage.getItem('tokenExpiry');
  //
  //   // Check if token is expired or about to expire (within 5 minutes)
  //   const isExpired = !token || !expiry || Date.now() > (parseInt(expiry) - 5 * 60 * 1000);
  //
  //   if (isExpired) {
  //     const refreshToken = localStorage.getItem('refreshToken');
  //     if (!refreshToken) {
  //       // Redirect to login or show login modal
  //       window.location.href = '/login';
  //       throw new Error('Authentication required');
  //     }
  //
  //     try {
  //       // Refresh the token
  //       const response = await fetch('/api/auth/refresh', {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //           'Authorization': `Bearer ${refreshToken}`
  //         }
  //       });
  //
  //       if (!response.ok) {
  //         // Refresh failed, redirect to login
  //         localStorage.clear();
  //         window.location.href = '/login';
  //         throw new Error('Session expired');
  //       }
  //
  //       const data = await response.json();
  //
  //       // Store new token and expiry
  //       localStorage.setItem('authToken', data.access_token);
  //       localStorage.setItem('tokenExpiry', (Date.now() + data.expires_in * 1000).toString());
  //       if (data.refresh_token) {
  //         localStorage.setItem('refreshToken', data.refresh_token);
  //       }
  //
  //       token = data.access_token;
  //     } catch (error) {
  //       console.error('Token refresh failed:', error);
  //       throw error;
  //     }
  //   }
  //
  //   return token;
  // });

  // Register the auth plugin
  udslInstance.registerPlugin(authPlugin);

  return udslInstance;
}
