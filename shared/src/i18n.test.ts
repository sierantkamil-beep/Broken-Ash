import { expect, it } from "vitest";
import { plural } from "./i18n.js";

it("picks Polish plural forms", () => {
  const f = (n: number) => plural(n, "sekunda", "sekundy", "sekund");
  expect([1, 2, 4, 5, 12, 14, 22, 25, 112, 0].map(f)).toEqual(["sekunda", "sekundy", "sekundy", "sekund", "sekund", "sekund", "sekundy", "sekund", "sekund", "sekund"]);
});
