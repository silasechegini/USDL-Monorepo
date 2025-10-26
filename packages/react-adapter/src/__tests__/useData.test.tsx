import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { createUDSL } from "@udsl/core";
import { UDSLProvider, setGlobalUDSLInstance } from "../context";
import { useData } from "../useData";

// Mock fetch globally
const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

// Test component that uses useData hook
const TestComponent = ({
  resourceKey,
  params,
}: {
  resourceKey: string;
  params?: Record<string, any>;
}) => {
  const { data, loading, error } = useData(resourceKey, params);

  if (loading) return <div data-testid='loading'>Loading...</div>;
  if (error) return <div data-testid='error'>{error.message}</div>;
  if (data) return <div data-testid='data'>{JSON.stringify(data)}</div>;
  return <div data-testid='no-data'>No data</div>;
};

describe("useData Hook", () => {
  const mockUsers = [
    { id: 1, name: "John Doe" },
    { id: 2, name: "Jane Smith" },
  ];

  beforeEach(() => {
    mockFetch.mockClear();
    // Clear global instance
    setGlobalUDSLInstance(null as any);
  });

  test("fetches data successfully with UDSLProvider", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    });

    const udsl = createUDSL({
      resources: { users: { get: "https://api.example.com/users" } },
    });

    render(
      <UDSLProvider instance={udsl}>
        <TestComponent resourceKey='users' />
      </UDSLProvider>,
    );

    // Initially should show loading
    expect(screen.getByTestId("loading")).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByTestId("data")).toBeInTheDocument();
    });

    expect(screen.getByTestId("data")).toHaveTextContent(
      JSON.stringify(mockUsers),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/users",
      expect.objectContaining({
        method: "GET",
        headers: {},
      }),
    );
  });

  test("fetches data successfully with global instance", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    });

    const udsl = createUDSL({
      resources: { users: { get: "https://api.example.com/users" } },
    });

    setGlobalUDSLInstance(udsl);

    render(<TestComponent resourceKey='users' />);

    // Initially should show loading
    expect(screen.getByTestId("loading")).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByTestId("data")).toBeInTheDocument();
    });

    expect(screen.getByTestId("data")).toHaveTextContent(
      JSON.stringify(mockUsers),
    );
  });

  test("handles fetch errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const udsl = createUDSL({
      resources: { users: { get: "https://api.example.com/users" } },
    });

    render(
      <UDSLProvider instance={udsl}>
        <TestComponent resourceKey='users' />
      </UDSLProvider>,
    );

    // Initially should show loading
    expect(screen.getByTestId("loading")).toBeInTheDocument();

    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByTestId("error")).toBeInTheDocument();
    });

    expect(screen.getByTestId("error")).toHaveTextContent("Network error: 404");
  });

  test("shows error when no UDSL instance is available", async () => {
    render(<TestComponent resourceKey='users' />);

    // Should immediately show error (no loading state)
    await waitFor(() => {
      expect(screen.getByTestId("error")).toBeInTheDocument();
    });

    expect(screen.getByTestId("error")).toHaveTextContent(
      "UDSL instance not set. Either call setGlobalUDSLInstance() or wrap your app in UDSLProvider and pass instance to it.",
    );
  });

  test("handles unknown resource", async () => {
    const udsl = createUDSL({
      resources: { users: { get: "https://api.example.com/users" } },
    });

    render(
      <UDSLProvider instance={udsl}>
        <TestComponent resourceKey='nonexistent' />
      </UDSLProvider>,
    );

    // Initially should show loading
    expect(screen.getByTestId("loading")).toBeInTheDocument();

    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByTestId("error")).toBeInTheDocument();
    });

    expect(screen.getByTestId("error")).toHaveTextContent(
      "Resource not found: nonexistent",
    );
  });

  test("passes parameters correctly", async () => {
    const mockUser = { id: 1, name: "John Doe" };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockUser,
    });

    const udsl = createUDSL({
      resources: { user: { get: "https://api.example.com/user" } },
    });

    render(
      <UDSLProvider instance={udsl}>
        <TestComponent resourceKey='user' params={{ id: 1, active: true }} />
      </UDSLProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("data")).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/user?id=1&active=true",
      expect.objectContaining({
        method: "GET",
        headers: {},
      }),
    );
  });

  test("re-fetches when key or params change", async () => {
    const mockUser1 = { id: 1, name: "User 1" };
    const mockUser2 = { id: 2, name: "User 2" };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUser1,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockUser2,
      });

    const udsl = createUDSL({
      resources: {
        user: { get: "https://api.example.com/user" },
        profile: { get: "https://api.example.com/profile" },
      },
    });

    const { rerender } = render(
      <UDSLProvider instance={udsl}>
        <TestComponent resourceKey='user' params={{ id: 1 }} />
      </UDSLProvider>,
    );

    // Wait for first data to load
    await waitFor(() => {
      expect(screen.getByTestId("data")).toBeInTheDocument();
    });
    expect(screen.getByTestId("data")).toHaveTextContent(
      JSON.stringify(mockUser1),
    );

    // Change the key
    rerender(
      <UDSLProvider instance={udsl}>
        <TestComponent resourceKey='profile' params={{ id: 1 }} />
      </UDSLProvider>,
    );

    // Should show loading again
    expect(screen.getByTestId("loading")).toBeInTheDocument();

    // Wait for second data to load
    await waitFor(() => {
      expect(screen.getByTestId("data")).toBeInTheDocument();
    });
    expect(screen.getByTestId("data")).toHaveTextContent(
      JSON.stringify(mockUser2),
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("handles component unmount during fetch", async () => {
    // Simulate a slow response
    let resolvePromise: (value: any) => void;
    const slowPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockFetch.mockReturnValueOnce(slowPromise);

    const udsl = createUDSL({
      resources: { users: { get: "https://api.example.com/users" } },
    });

    const { unmount } = render(
      <UDSLProvider instance={udsl}>
        <TestComponent resourceKey='users' />
      </UDSLProvider>,
    );

    // Wait a bit to ensure useEffect has run and fetch has been called
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockFetch).toHaveBeenCalledOnce();

    // Unmount before the promise resolves
    unmount();

    // Now resolve the promise - this should not cause state updates
    resolvePromise!({
      ok: true,
      json: async () => mockUsers,
    });

    // Wait a bit more to ensure any async operations complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    // If there are no errors or warnings, the cleanup worked correctly
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  test("uses cached data when available", async () => {
    const mockUser = { id: 1, name: "Cached User" };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockUser,
    });

    const udsl = createUDSL({
      resources: {
        user: {
          get: "https://api.example.com/user/1",
          cache: 60, // 60 seconds cache
        },
      },
    });

    // First render
    const { unmount } = render(
      <UDSLProvider instance={udsl}>
        <TestComponent resourceKey='user' />
      </UDSLProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("data")).toBeInTheDocument();
    });

    unmount();

    // Second render should use cached data
    render(
      <UDSLProvider instance={udsl}>
        <TestComponent resourceKey='user' />
      </UDSLProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("data")).toBeInTheDocument();
    });

    // Should only have called fetch once due to caching
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
