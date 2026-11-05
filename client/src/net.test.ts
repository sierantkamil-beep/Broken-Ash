import { expect, it } from "vitest";
import { toServerUrl } from "./net";

it("turns whatever the partner typed into a server URL", () => {
  expect(toServerUrl("100.64.0.2")).toBe("ws://100.64.0.2:2580");
  expect(toServerUrl("host:3000")).toBe("ws://host:3000");
  expect(toServerUrl("http://host:3000/")).toBe("ws://host:3000");
  expect(toServerUrl("2001:db8::1")).toBe("ws://[2001:db8::1]:2580");
  expect(toServerUrl("[2001:db8::1]:9")).toBe("ws://[2001:db8::1]:9");
});
