import { UDSL } from "@udsl/core";

// Demo showing SWR implementation
async function swrDemo() {
  const udsl = new UDSL({
    resources: {
      users: {
        get: "https://jsonplaceholder.typicode.com/users",
        cache: 5, // 5 second cache
      },
      user: {
        get: "https://jsonplaceholder.typicode.com/users/:id",
        cache: 10, // 10 second cache
      },
    },
  });

  console.log("UDSL SWR Implementation Demo\n");

  try {
    // 1. First request - fetches fresh data
    console.log("First request (fresh data):");
    const start1 = Date.now();
    const users1 = await udsl.fetchResource("users");
    console.log(
      `   Fetched ${users1.length} users in ${Date.now() - start1}ms`,
    );
    console.log(`   Cache info:`, udsl.getCacheInfo("users"));

    // 2. Second request - returns cached data immediately
    console.log("Second request (cached data):");
    const start2 = Date.now();
    const users2 = await udsl.fetchResource("users");
    console.log(
      `   Returned ${users2.length} users in ${Date.now() - start2}ms`,
    );
    console.log(`   Cache info:`, udsl.getCacheInfo("users"));

    // 3. Wait for cache to expire
    console.log("Waiting 6 seconds for cache to expire...");
    await new Promise((resolve) => setTimeout(resolve, 6000));

    // 4. Request with expired cache - SWR in action
    console.log("Request with stale cache (SWR):");
    const start3 = Date.now();
    const users3 = await udsl.fetchResource("users");
    console.log(
      `   Returned ${users3.length} users in ${
        Date.now() - start3
      }ms (stale data served immediately)`,
    );
    console.log(`   Cache info:`, udsl.getCacheInfo("users"));

    // 5. Wait a bit for background revalidation
    console.log("Waiting for background revalidation...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 6. Request after revalidation
    console.log("Request after background revalidation:");
    const start4 = Date.now();
    const users4 = await udsl.fetchResource("users");
    console.log(
      `   Returned ${users4.length} users in ${
        Date.now() - start4
      }ms (fresh data from background revalidation)`,
    );
    console.log(`   Cache info:`, udsl.getCacheInfo("users"));

    // 7. Manual revalidation
    console.log("Manual revalidation:");
    const start5 = Date.now();
    const users5 = await udsl.revalidate("users");
    console.log(
      `   Revalidated ${users5?.length} users in ${Date.now() - start5}ms`,
    );
    console.log(`   Cache info:`, udsl.getCacheInfo("users"));

    // 8. Parameterized request
    console.log("Parameterized request (user by ID):");
    const start6 = Date.now();
    const user = await udsl.fetchResource("user", { id: 1 });
    console.log(`   Fetched user "${user.name}" in ${Date.now() - start6}ms`);
    console.log(`   Cache info:`, udsl.getCacheInfo("user", { id: 1 }));
  } catch (error) {
    console.error("Demo failed:", error);
  }
}

export { swrDemo };
