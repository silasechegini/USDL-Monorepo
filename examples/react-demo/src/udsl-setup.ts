import { createUDSL, UDSL } from "@udsl/core";
import { createAuthPlugin } from "@udsl/plugin-auth";
import { createTelemetryPlugin } from "@udsl/plugin-telemetry";

export function initUDSL(): UDSL {
  // Create UDSL instance first
  const udslInstance = createUDSL({
    resources: {
      users: { get: "https://jsonplaceholder.typicode.com/users", cache: 300 },
      products: { get: "https://fakestoreapi.com/products", cache: 600 },
    },
  });

  /**
   * PRACTICAL AUTH EXAMPLES:
   *
   * Example 1: Token from localStorage (most common in SPAs)
   * Example 2: Token from authentication service (like Auth0, Firebase, etc.)
   * Example 3: Token with automatic refresh
   */

  const authPlugin = createAuthPlugin(() => {
    /**
     * passing a default token if none is found in localStorage,
     * just for the sake of this demo.  In a real application, you might want to
     * handle missing tokens differently (e.g., redirect to login).
     */
    const token = localStorage.getItem("authToken") ?? "custom-default-token";
    if (!token) {
      // In a real app, you might redirect to login instead
      throw new Error("No authentication token found. Please log in.");
    }
    return token;
  });

  /**
   * Example 2: Token from authentication service (like Auth0, Firebase, etc.)
   */
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

  /**
   * Example 3: Token with automatic refresh
   */
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

  /**
   * TELEMETRY & OBSERVABILITY SETUP:
   *
   * The telemetry plugin provides comprehensive observability for your UDSL operations.
   * Note: In a real application, you'd initialize OpenTelemetry BEFORE importing UDSL.
   *
   * For production setup, create a separate telemetry.ts file and import it first:
   *
   * // telemetry.ts
   * import { NodeSDK } from '@opentelemetry/sdk-node';
   * import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
   * import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http';
   *
   * const exporter = new OTLPTraceExporter({
   *   url: 'https://api.honeycomb.io/v1/traces', // or your preferred observability platform
   *   headers: {
   *     'x-honeycomb-team': process.env.HONEYCOMB_API_KEY,
   *     'x-honeycomb-dataset': 'udsl-app'
   *   }
   * });
   *
   * const sdk = new NodeSDK({
   *   serviceName: 'my-udsl-app',
   *   serviceVersion: '1.0.0',
   *   traceExporter: exporter,
   *   instrumentations: [getNodeAutoInstrumentations()],
   * });
   *
   * sdk.start();
   *
   * // main.tsx
   * import './telemetry'; // Must be first!
   * import { createRoot } from 'react-dom/client';
   * import App from './App';
   */

  const telemetryPlugin = createTelemetryPlugin({
    serviceName: "react-demo-app",
    serviceVersion: "0.1.0",
    defaultAttributes: {
      "app.environment": "development",
      "app.framework": "react",
      "app.demo": true,
    },
    traceCacheOperations: true,
    tracePluginExecution: true,
    spanNameFormatter: (
      operation: string,
      resourceKey: string,
      method?: string,
    ) => {
      // Custom span naming for better observability
      return `UDSL_${operation.toUpperCase()}_${resourceKey}${
        method ? `_${method}` : ""
      }`;
    },
  });

  // Register the telemetry plugin
  udslInstance.registerPlugin(telemetryPlugin);

  /**
   * Plugin Order Matters:
   *
   * 1. Telemetry Plugin - Should be first to capture all operations
   * 2. Auth Plugin - Adds authentication to requests
   * 3. Other plugins - Custom business logic, validation, etc.
   *
   * This order ensures that telemetry captures the complete request lifecycle
   * including authentication token addition and any transformations.
   */

  return udslInstance;
}
