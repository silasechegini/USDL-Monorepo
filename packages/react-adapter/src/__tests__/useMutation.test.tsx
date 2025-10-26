import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import React from "react";
import { createUDSL } from "@udsl/core";
import { UDSLProvider } from "../context";
import {
  useMutation,
  useCreate,
  useUpdate,
  usePatch,
  useDelete,
} from "../useMutation";

// Mock fetch globally
const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

// Test component for useMutation
const MutationTestComponent = ({
  mutationFn,
}: {
  mutationFn: (udsl: any, variables: any) => Promise<any>;
}) => {
  const { data, loading, error, mutate, reset } = useMutation(mutationFn);

  const handleMutate = () => {
    mutate({ test: "data" }).catch(() => {
      // Handle error in the component
    });
  };

  return (
    <div>
      {loading && <div data-testid='loading'>Loading...</div>}
      {error && <div data-testid='error'>{error.message}</div>}
      {data && <div data-testid='data'>{JSON.stringify(data)}</div>}

      <button data-testid='mutate' onClick={handleMutate}>
        Mutate
      </button>
      <button data-testid='reset' onClick={reset}>
        Reset
      </button>
    </div>
  );
};

// Test component for CRUD hooks
const CrudTestComponent = ({
  operation,
  resourceKey = "users",
}: {
  operation: "createResource" | "updateResource" | "patchResource" | "deleteResource";
  resourceKey?: string;
}) => {
  const createMutation = useCreate(resourceKey);
  const updateMutation = useUpdate(resourceKey);
  const patchMutation = usePatch(resourceKey);
  const deleteMutation = useDelete(resourceKey);

  const mutation = {
    createResource: createMutation,
    updateResource: updateMutation,
    patchResource: patchMutation,
    deleteResource: deleteMutation,
  }[operation];

  const handleMutate = () => {
    const variables = {
      createResource: { data: { name: "New User" } },
      updateResource: { id: 1, data: { name: "Updated User" } },
      patchResource: { id: 1, data: { email: "new@email.com" } },
      deleteResource: { id: 1 },
    }[operation];

    (mutation.mutate as any)(variables).catch(() => {
      // Handle error in the component
    });
  };

  if (mutation.loading) return <div data-testid='loading'>Loading...</div>;
  if (mutation.error)
    return <div data-testid='error'>{mutation.error.message}</div>;
  if (mutation.data)
    return <div data-testid='data'>{JSON.stringify(mutation.data)}</div>;

  return (
    <div>
      <button data-testid='mutate' onClick={handleMutate}>
        {operation.charAt(0).toUpperCase() + operation.slice(1)}
      </button>
      <button data-testid='reset' onClick={mutation.reset}>
        Reset
      </button>
    </div>
  );
};

describe("Mutation Hooks", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("useMutation", () => {
    test("executes mutation successfully", async () => {
      const mockResult = { id: 1, success: true };
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => mockResult,
                }),
              100,
            ),
          ),
      );

      const mockMutationFn = vi
        .fn()
        .mockImplementation(async (udsl, variables) => {
          return await udsl.createResource("users", variables);
        });

      const udsl = createUDSL({
        resources: { users: { post: "https://api.example.com/users" } },
      });

      const user = userEvent.setup();

      render(
        <UDSLProvider instance={udsl}>
          <MutationTestComponent mutationFn={mockMutationFn} />
        </UDSLProvider>,
      );

      const mutateButton = screen.getByTestId("mutate");
      await user.click(mutateButton);

      // Should show loading first
      expect(screen.getByTestId("loading")).toBeInTheDocument();

      // Wait for mutation to complete
      await waitFor(() => {
        expect(screen.getByTestId("data")).toBeInTheDocument();
      });

      expect(screen.getByTestId("data")).toHaveTextContent(
        JSON.stringify(mockResult),
      );
      expect(mockMutationFn).toHaveBeenCalledWith(udsl, { test: "data" });
    });

    test("handles mutation errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      const mockMutationFn = vi
        .fn()
        .mockImplementation(async (udsl, variables) => {
          return await udsl.createResource("users", variables);
        });

      const udsl = createUDSL({
        resources: { users: { post: "https://api.example.com/users" } },
      });

      const user = userEvent.setup();

      render(
        <UDSLProvider instance={udsl}>
          <MutationTestComponent mutationFn={mockMutationFn} />
        </UDSLProvider>,
      );

      const mutateButton = screen.getByTestId("mutate");
      await user.click(mutateButton);

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByTestId("error")).toBeInTheDocument();
      });

      expect(screen.getByTestId("error")).toHaveTextContent(
        "Network error: 400",
      );
    });

    test("resets mutation state", async () => {
      const mockResult = { id: 1, success: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const mockMutationFn = vi
        .fn()
        .mockImplementation(async (udsl, variables) => {
          return await udsl.createResource("users", variables);
        });

      const udsl = createUDSL({
        resources: { users: { post: "https://api.example.com/users" } },
      });

      const user = userEvent.setup();

      render(
        <UDSLProvider instance={udsl}>
          <MutationTestComponent mutationFn={mockMutationFn} />
        </UDSLProvider>,
      );

      // Execute mutation
      const mutateButton = screen.getByTestId("mutate");
      await user.click(mutateButton);

      await waitFor(() => {
        expect(screen.getByTestId("data")).toBeInTheDocument();
      });

      // Reset
      const resetButton = screen.getByTestId("reset");
      await user.click(resetButton);

      // Should show initial state (buttons)
      expect(screen.getByTestId("mutate")).toBeInTheDocument();
      expect(screen.getByTestId("reset")).toBeInTheDocument();
      expect(screen.queryByTestId("data")).not.toBeInTheDocument();
    });
  });

  describe("CRUD Hooks", () => {
    test("useCreate creates a new resource", async () => {
      const mockResult = { id: 1, name: "New User" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const udsl = createUDSL({
        resources: { users: { post: "https://api.example.com/users" } },
      });

      const user = userEvent.setup();

      render(
        <UDSLProvider instance={udsl}>
          <CrudTestComponent operation='createResource' />
        </UDSLProvider>,
      );

      const createButton = screen.getByTestId("mutate");
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByTestId("data")).toBeInTheDocument();
      });

      expect(screen.getByTestId("data")).toHaveTextContent(
        JSON.stringify(mockResult),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "New User" }),
        }),
      );
    });

    test("useUpdate updates an existing resource", async () => {
      const mockResult = { id: 1, name: "Updated User" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const udsl = createUDSL({
        resources: { users: { put: "https://api.example.com/users/:id" } },
      });

      const user = userEvent.setup();

      render(
        <UDSLProvider instance={udsl}>
          <CrudTestComponent operation='updateResource' />
        </UDSLProvider>,
      );

      const updateButton = screen.getByTestId("mutate");
      await user.click(updateButton);

      await waitFor(() => {
        expect(screen.getByTestId("data")).toBeInTheDocument();
      });

      expect(screen.getByTestId("data")).toHaveTextContent(
        JSON.stringify(mockResult),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users/1",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ name: "Updated User" }),
        }),
      );
    });

    test("usePatch patches an existing resource", async () => {
      const mockResult = { id: 1, name: "User", email: "new@email.com" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const udsl = createUDSL({
        resources: { users: { patch: "https://api.example.com/users/:id" } },
      });

      const user = userEvent.setup();

      render(
        <UDSLProvider instance={udsl}>
          <CrudTestComponent operation='patchResource' />
        </UDSLProvider>,
      );

      const patchButton = screen.getByTestId("mutate");
      await user.click(patchButton);

      await waitFor(() => {
        expect(screen.getByTestId("data")).toBeInTheDocument();
      });

      expect(screen.getByTestId("data")).toHaveTextContent(
        JSON.stringify(mockResult),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users/1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ email: "new@email.com" }),
        }),
      );
    });

    test("useDelete deletes a resource", async () => {
      const mockResult = { success: true, message: "User deleted" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const udsl = createUDSL({
        resources: { users: { delete: "https://api.example.com/users/:id" } },
      });

      const user = userEvent.setup();

      render(
        <UDSLProvider instance={udsl}>
          <CrudTestComponent operation='deleteResource' />
        </UDSLProvider>,
      );

      const deleteButton = screen.getByTestId("mutate");
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByTestId("data")).toBeInTheDocument();
      });

      expect(screen.getByTestId("data")).toHaveTextContent(
        JSON.stringify(mockResult),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/users/1",
        expect.objectContaining({
          method: "DELETE",
        }),
      );
    });

    test("handles missing endpoint configuration", async () => {
      const udsl = createUDSL({
        resources: { users: { get: "https://api.example.com/users" } },
      });

      const user = userEvent.setup();

      render(
        <UDSLProvider instance={udsl}>
          <CrudTestComponent operation='createResource' />
        </UDSLProvider>,
      );

      const createButton = screen.getByTestId("mutate");
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByTestId("error")).toBeInTheDocument();
      });

      expect(screen.getByTestId("error")).toHaveTextContent(
        "POST endpoint not defined for: users",
      );
    });
  });
});
