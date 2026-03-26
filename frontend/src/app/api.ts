import type { MagnusUser } from "./types";

const STORAGE_SESSION_KEY = "magnus_session";
const STORAGE_USER_KEY = "magnus_user";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function parseBody(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function addAuthHeaders(init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});

  if (typeof window !== "undefined") {
    const session = window.localStorage.getItem(STORAGE_SESSION_KEY);
    if (session && !headers.has("x-magnus-session")) {
      headers.set("x-magnus-session", session);
    }

    const rawUser = window.localStorage.getItem(STORAGE_USER_KEY);
    if (rawUser && !headers.has("X-Account-Id")) {
      try {
        const user = JSON.parse(rawUser) as MagnusUser;
        if (user?.username) {
          headers.set("X-Account-Id", user.username);
        }
      } catch {
        // Ignore malformed local storage and continue without extra headers.
      }
    }
  }

  return {
    ...init,
    headers,
  };
}

export async function requestJson<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, addAuthHeaders(init));
  const body = await parseBody(response);

  if (!response.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? String((body as { error?: string }).error || "Request failed")
        : typeof body === "string" && body
          ? body
          : "Request failed";
    throw new ApiError(message, response.status, body);
  }

  return body as T;
}

export function jsonRequest<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown,
  init: RequestInit = {},
) {
  const authInit = addAuthHeaders(init);
  const headers = new Headers(authInit.headers || {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return requestJson<T>(path, {
    ...authInit,
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function accountHeaders(user: MagnusUser | null, extra: Record<string, string> = {}) {
  const headers = new Headers(extra);
  if (user?.username) {
    headers.set("X-Account-Id", user.username);
  }
  return headers;
}

export function magnusHeaders(session: string | null, extra: Record<string, string> = {}) {
  const headers = new Headers(extra);
  if (session) {
    headers.set("x-magnus-session", session);
  }
  return headers;
}

export function withAccountQuery(path: string, user: MagnusUser | null) {
  if (!user?.username) return path;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("account_id", user.username);
  return `${url.pathname}${url.search}`;
}
