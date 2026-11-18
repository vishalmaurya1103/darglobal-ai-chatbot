import { afterEach, describe, expect, it } from "vitest";
import { assertJsonContentType, assertSameOrigin, clientKey, readJsonBody, RequestRejected } from "./request-guard";

const ORIGINAL_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const post = (headers: Record<string, string>, body = "{}") =>
  new Request("http://localhost:3000/api/chat", { method: "POST", headers, body });

describe("assertSameOrigin", () => {
  it("accepts a request from the app's own origin", () => {
    process.env.APP_URL = "https://assistant.example.com";
    expect(() => assertSameOrigin(post({ origin: "https://assistant.example.com" }))).not.toThrow();
  });

  it("accepts an explicitly allow-listed origin", () => {
    process.env.APP_URL = "https://assistant.example.com";
    process.env.ALLOWED_ORIGINS = "https://preview.example.com";
    expect(() => assertSameOrigin(post({ origin: "https://preview.example.com" }))).not.toThrow();
  });

  it("refuses an unknown origin", () => {
    process.env.APP_URL = "https://assistant.example.com";
    expect(() => assertSameOrigin(post({ origin: "https://evil.example" }))).toThrow(RequestRejected);
  });

  // Same-origin fetches from some clients, and server-to-server calls, send no Origin.
  it("allows a request with no Origin header", () => {
    expect(() => assertSameOrigin(post({}))).not.toThrow();
  });
});

describe("assertJsonContentType", () => {
  it("accepts application/json, including a charset parameter", () => {
    expect(() => assertJsonContentType(post({ "content-type": "application/json; charset=utf-8" }))).not.toThrow();
  });

  it("refuses anything else", () => {
    expect(() => assertJsonContentType(post({ "content-type": "text/plain" }))).toThrow(RequestRejected);
  });
});

describe("clientKey", () => {
  // Honouring x-forwarded-for unconditionally would let one client mint unlimited
  // rate-limit identities, which is the standard way this control gets bypassed.
  it("ignores forwarding headers unless the deployment declares a trusted proxy", () => {
    delete process.env.TRUST_PROXY_HEADERS;
    expect(clientKey(post({ "x-forwarded-for": "1.2.3.4" }))).toBe("unknown");
  });

  it("uses the left-most forwarded address when a proxy is trusted", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    expect(clientKey(post({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when a proxy is trusted", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    expect(clientKey(post({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
  });
});

describe("readJsonBody", () => {
  it("parses a valid JSON body", async () => {
    await expect(readJsonBody(post({}, '{"messages":[]}'))).resolves.toEqual({ messages: [] });
  });

  it("rejects invalid JSON", async () => {
    await expect(readJsonBody(post({}, "{broken"))).rejects.toThrow(RequestRejected);
  });

  it("rejects a body over the size ceiling", async () => {
    await expect(readJsonBody(post({}, JSON.stringify({ a: "x".repeat(20_000) })))).rejects.toThrow(RequestRejected);
  });

  it("rejects a declared content-length over the ceiling before reading", async () => {
    await expect(readJsonBody(post({ "content-length": "999999" }))).rejects.toThrow(RequestRejected);
  });
});
