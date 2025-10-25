import { createUDSL, UDSL } from "@udsl/core";

export function initUDSL(): UDSL {
  return createUDSL({
    resources: {
      users: { get: "https://jsonplaceholder.typicode.com/users", cache: 300 },
      products: { get: "https://fakestoreapi.com/products", cache: 600 },
    },
  });
}
