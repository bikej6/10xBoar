import { describe, expect, it } from "vitest";
// Import via the `@/` alias to prove Vitest resolves tsconfig paths through getViteConfig().
import { cn } from "@/lib/utils";

describe("test runner smoke", () => {
  it("runs a trivial assertion", () => {
    expect(true).toBe(true);
  });

  it("resolves the @/ path alias", () => {
    expect(cn("a", "b")).toContain("a");
  });
});
