import { loadEnv } from "@bookly/config";
import type { IntegrationProvider } from "@bookly/db/schema";
import type { OAuthTokens } from "./types";
import { ProviderError } from "./types";

type OAuthConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  /** Extra query params on the authorize URL. */
  authorizeParams?: Record<string, string>;
  /** Zoom wants HTTP basic auth on the token endpoint. */
  basicAuth?: boolean;
};

const e = () => loadEnv();

export const OAUTH: Record<IntegrationProvider, OAuthConfig> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    clientId: () => e().GOOGLE_CLIENT_ID,
    clientSecret: () => e().GOOGLE_CLIENT_SECRET,
    authorizeParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  microsoft: {
    authorizeUrl: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || "common"}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT || "common"}/oauth2/v2.0/token`,
    scopes: [
      "openid",
      "email",
      "offline_access",
      "User.Read",
      "Calendars.ReadWrite",
      "OnlineMeetings.ReadWrite",
    ],
    clientId: () => e().MICROSOFT_CLIENT_ID,
    clientSecret: () => e().MICROSOFT_CLIENT_SECRET,
    authorizeParams: { response_mode: "query", prompt: "select_account" },
  },
  zoom: {
    authorizeUrl: "https://zoom.us/oauth/authorize",
    tokenUrl: "https://zoom.us/oauth/token",
    scopes: [],
    clientId: () => e().ZOOM_CLIENT_ID,
    clientSecret: () => e().ZOOM_CLIENT_SECRET,
    basicAuth: true,
  },
};

export const PROVIDERS: IntegrationProvider[] = ["google", "microsoft", "zoom"];

export function isProvider(p: string): p is IntegrationProvider {
  return (PROVIDERS as string[]).includes(p);
}

/** A provider is available for connecting when its OAuth client is configured. */
export function providerConfigured(p: IntegrationProvider): boolean {
  return !!(OAUTH[p].clientId() && OAUTH[p].clientSecret());
}

export function redirectUri(p: IntegrationProvider) {
  return `${e().APP_URL.replace(/\/$/, "")}/api/integrations/${p}/callback`;
}

export function authorizeUrl(p: IntegrationProvider, state: string) {
  const c = OAUTH[p];
  const u = new URL(c.authorizeUrl);
  u.searchParams.set("client_id", c.clientId() ?? "");
  u.searchParams.set("redirect_uri", redirectUri(p));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  if (c.scopes.length) u.searchParams.set("scope", c.scopes.join(" "));
  for (const [k, v] of Object.entries(c.authorizeParams ?? {})) u.searchParams.set(k, v);
  return u.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(p: IntegrationProvider, params: Record<string, string>) {
  const c = OAUTH[p];
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (c.basicAuth) {
    headers.authorization = `Basic ${Buffer.from(`${c.clientId()}:${c.clientSecret()}`).toString("base64")}`;
  } else {
    body.set("client_id", c.clientId() ?? "");
    body.set("client_secret", c.clientSecret() ?? "");
  }
  const res = await fetch(c.tokenUrl, { method: "POST", headers, body });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw new ProviderError(
      `${p} token request failed: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim(),
      res.status,
      res.status === 400 || res.status === 401,
    );
  }
  return json;
}

export function toTokens(json: TokenResponse): OAuthTokens {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
    scope: json.scope ?? null,
  };
}

export async function exchangeCode(p: IntegrationProvider, code: string): Promise<OAuthTokens> {
  return toTokens(
    await tokenRequest(p, { grant_type: "authorization_code", code, redirect_uri: redirectUri(p) }),
  );
}

export async function refreshTokens(
  p: IntegrationProvider,
  refreshToken: string,
): Promise<OAuthTokens> {
  const json = await tokenRequest(p, { grant_type: "refresh_token", refresh_token: refreshToken });
  const t = toTokens(json);
  // Google does not resend the refresh token; keep the old one.
  if (!t.refreshToken) t.refreshToken = refreshToken;
  return t;
}
