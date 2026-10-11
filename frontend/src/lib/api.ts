import type { ApiErrorBody, Envelope, Session } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(public readonly body: ApiErrorBody) {
    super(body.message);
  }
  get code(): string {
    return this.body.errorCode;
  }
  /** Validation details keyed by field, for inline form errors. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.body.details ?? []).map((d) => [d.field, d.issue]));
  }
}

type Query = Record<string, string | number | boolean | undefined | null | string[] | object>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Query;
  /** Return the raw Blob (file downloads). */
  blob?: boolean;
  /** Skip the Authorization header and refresh logic (public routes). */
  anonymous?: boolean;
}

/*
 * Auth model (output/garage-auth-design.md): the access token lives in memory only;
 * the refresh token is an httpOnly cookie the browser sends to /auth/refresh.
 */
let accessToken: string | null = null;
let refreshInFlight: Promise<Session | null> | null = null;
let onSessionChange: (session: Session | null) => void = () => {};

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};
export const registerSessionListener = (fn: (session: Session | null) => void): void => {
  onSessionChange = fn;
};

const toQueryString = (query?: Query): string => {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

/**
 * One refresh at a time per tab: concurrent 401s share the same promise, so a burst of
 * expired requests can't trip the server's refresh-token reuse detection (auth risk R-6).
 */
export const refreshSession = (): Promise<Session | null> => {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Client-Type": "web" },
        body: "{}",
      });
      if (!res.ok) return null;
      const session = ((await res.json()) as Envelope<Session>).data;
      accessToken = session.accessToken;
      return session;
    } catch {
      return null;
    } finally {
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
};

const send = async (path: string, options: RequestOptions): Promise<Response> => {
  const isForm = options.body instanceof FormData;
  const headers: Record<string, string> = { "Accept-Language": "en", "X-Client-Type": "web" };
  if (!isForm && options.body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken && !options.anonymous) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(`${API_URL}${path}${toQueryString(options.query)}`, {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    body: isForm ? (options.body as FormData) : options.body === undefined ? undefined : JSON.stringify(options.body),
  });
};

const toError = async (res: Response, path: string): Promise<ApiError> => {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return new ApiError(
    body ?? { statusCode: res.status, errorCode: "NETWORK_ERROR", message: `Request to ${path} failed (${res.status})` },
  );
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await send(path, options);
  } catch {
    throw new ApiError({ statusCode: 0, errorCode: "NETWORK_ERROR", message: "Can't reach the server. Check your connection and try again." });
  }

  if (res.status === 401 && !options.anonymous && !path.startsWith("/auth/")) {
    const session = await refreshSession();
    if (session) {
      onSessionChange(session);
      res = await send(path, options);
    } else {
      onSessionChange(null);
    }
  }
  if (!res.ok) throw await toError(res, path);
  if (res.status === 204) return undefined as T;
  if (options.blob) return (await res.blob()) as T;
  return (await res.json()) as T;
}

/** Unwraps `{ data }` from single-record envelopes. */
export async function apiData<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await api<Envelope<T>>(path, options)).data;
}
