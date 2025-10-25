import { describe, test, expect, vi } from "vitest";
import { createAuthPlugin } from "../index";

describe("Auth Plugin", () => {
  test("adds authorization header with token", async () => {
    const mockToken = "test-token-123";
    const getToken = vi.fn().mockResolvedValue(mockToken);
    
    const authPlugin = createAuthPlugin(getToken);
    
    const mockInit: RequestInit = {
      method: "GET",
      headers: {},
    };
    
    await authPlugin.beforeFetch!("https://api.example.com/users", mockInit);
    
    expect(getToken).toHaveBeenCalledOnce();
    expect(mockInit.headers).toEqual({
      Authorization: `Bearer ${mockToken}`,
    });
  });

  test("preserves existing headers while adding authorization", async () => {
    const mockToken = "test-token-456";
    const getToken = vi.fn().mockResolvedValue(mockToken);
    
    const authPlugin = createAuthPlugin(getToken);
    
    const mockInit: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Custom-Header": "custom-value",
      },
    };
    
    await authPlugin.beforeFetch!("https://api.example.com/users", mockInit);
    
    expect(getToken).toHaveBeenCalledOnce();
    expect(mockInit.headers).toEqual({
      "Content-Type": "application/json",
      "X-Custom-Header": "custom-value",
      Authorization: `Bearer ${mockToken}`,
    });
  });

  test("handles synchronous token getter", async () => {
    const mockToken = "sync-token-789";
    const getToken = vi.fn().mockReturnValue(mockToken);
    
    const authPlugin = createAuthPlugin(getToken);
    
    const mockInit: RequestInit = {
      method: "GET",
      headers: {},
    };
    
    await authPlugin.beforeFetch!("https://api.example.com/users", mockInit);
    
    expect(getToken).toHaveBeenCalledOnce();
    expect(mockInit.headers).toEqual({
      Authorization: `Bearer ${mockToken}`,
    });
  });

  test("handles undefined headers", async () => {
    const mockToken = "token-undefined-headers";
    const getToken = vi.fn().mockResolvedValue(mockToken);
    
    const authPlugin = createAuthPlugin(getToken);
    
    const mockInit: RequestInit = {
      method: "GET",
      // headers is undefined
    };
    
    await authPlugin.beforeFetch!("https://api.example.com/users", mockInit);
    
    expect(getToken).toHaveBeenCalledOnce();
    expect(mockInit.headers).toEqual({
      Authorization: `Bearer ${mockToken}`,
    });
  });

  test("handles async token getter error", async () => {
    const getToken = vi.fn().mockRejectedValue(new Error("Token fetch failed"));
    
    const authPlugin = createAuthPlugin(getToken);
    
    const mockInit: RequestInit = {
      method: "GET",
      headers: {},
    };
    
    await expect(
      authPlugin.beforeFetch!("https://api.example.com/users", mockInit)
    ).rejects.toThrow("Token fetch failed");
    
    expect(getToken).toHaveBeenCalledOnce();
  });

  test("overwrites existing authorization header", async () => {
    const mockToken = "new-token-override";
    const getToken = vi.fn().mockResolvedValue(mockToken);
    
    const authPlugin = createAuthPlugin(getToken);
    
    const mockInit: RequestInit = {
      method: "GET",
      headers: {
        Authorization: "Bearer old-token",
        "Content-Type": "application/json",
      },
    };
    
    await authPlugin.beforeFetch!("https://api.example.com/users", mockInit);
    
    expect(getToken).toHaveBeenCalledOnce();
    expect(mockInit.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: `Bearer ${mockToken}`,
    });
  });
});