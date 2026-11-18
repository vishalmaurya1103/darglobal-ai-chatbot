import { defineConfig } from "@neon/config/v1";

/** Read by `npx neon deploy`. Preview branches expire on their own; the default branch is left alone. */
export default defineConfig({
  auth: false,
  branch: (branch) => (branch.isDefault || branch.exists ? {} : { ttl: "7d" }),
});
