import fs from "node:fs";
import { expect, it } from "vitest";
import { buildCatalogue, OUT } from "./catalogue";

it("docs/catalogue.md is up to date (run `pnpm catalogue`)", () => {
  expect(fs.readFileSync(OUT, "utf8")).toBe(buildCatalogue());
});
