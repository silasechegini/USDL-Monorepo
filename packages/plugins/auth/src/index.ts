import type { UDSLPlugin } from "@udsl/core";

export const createAuthPlugin = (
  getToken: () => string | Promise<string>,
): UDSLPlugin => {
  return {
    beforeFetch: async (url, init) => {
      const token = await getToken();
      init.headers = {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
      } as Record<string, string>;
    },
  };
};
