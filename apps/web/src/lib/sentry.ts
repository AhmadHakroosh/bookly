import type { init } from "@sentry/nextjs";

/**
 * What Sentry may collect. Sentry 11 collects request headers, cookies, bodies, database
 * query data and user info by default; this keeps the old restrictive baseline, since guests'
 * emails and phone numbers must stay out of error reports (privacy policy: error context only).
 * Shared by the browser, server and edge inits.
 */
type DataCollection = NonNullable<NonNullable<Parameters<typeof init>[0]>["dataCollection"]>;

export const sentryDataCollection: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: ["forwarded", "-ip", "remote-", "via", "-user", "cookie", "authorization"] },
    response: { deny: ["forwarded", "-ip", "remote-", "via", "-user", "set-cookie"] },
  },
  httpBodies: [],
  urlQueryParams: { deny: ["forwarded", "-ip", "remote-", "via", "-user", "token", "email"] },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
};
