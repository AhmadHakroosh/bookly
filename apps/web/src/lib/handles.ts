/**
 * Rules for the two names a person picks that become part of a URL: the workspace address
 * (`<slug>.<ROOT_DOMAIN>`) and a member's username (`/<username>`). Pure and shared by the forms
 * (live feedback) and the server actions (the check that counts).
 */

export type HandleKind = "address" | "username";

export type HandleCheck = { ok: true; value: string } | { ok: false; error: string };

/** Lowercase, ASCII-folded, non-alphanumerics collapsed to hyphens: the suggestion from a name. */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const MIN: Record<HandleKind, number> = { address: 3, username: 2 };
export const MAX_HANDLE = 40;

/** Subdomains that belong to the platform, its environments or mail, or that no tenant should own. */
const RESERVED_ADDRESSES = new Set([
  // platform hosts and environments
  "www",
  "app",
  "api",
  "admin",
  "console",
  "meet",
  "book",
  "booking",
  "bookings",
  "help",
  "docs",
  "status",
  "staging",
  "stage",
  "dev",
  "develop",
  "development",
  "test",
  "testing",
  "qa",
  "uat",
  "preview",
  "previews",
  "sandbox",
  "demo",
  "beta",
  "alpha",
  "canary",
  "next",
  "prod",
  "production",
  "internal",
  "local",
  "localhost",
  "root",
  "cloud",
  "cdn",
  "static",
  "assets",
  "img",
  "images",
  "files",
  "media",
  "edge",
  "proxy",
  "gateway",
  "vpn",
  "git",
  "ci",
  "monitor",
  "metrics",
  "logs",
  // mail and dns
  "mail",
  "smtp",
  "imap",
  "pop",
  "pop3",
  "mx",
  "mx1",
  "mx2",
  "ns",
  "ns1",
  "ns2",
  "dns",
  "ftp",
  "sftp",
  "email",
  "noreply",
  "no-reply",
  "postmaster",
  "hostmaster",
  "webmaster",
  "abuse",
  // the product and its operator
  "bookly",
  "bookly-app",
  "booklyapp",
  "cloudeo",
  "official",
  "system",
  "team",
  "staff",
  // trust and account words a phishing page would want
  "support",
  "helpdesk",
  "billing",
  "payments",
  "payment",
  "pay",
  "checkout",
  "invoice",
  "invoices",
  "account",
  "accounts",
  "login",
  "logon",
  "signin",
  "sign-in",
  "signup",
  "sign-up",
  "register",
  "auth",
  "oauth",
  "sso",
  "verify",
  "verification",
  "secure",
  "security",
  "password",
  "passwords",
  "reset",
  "recover",
  "recovery",
  "unlock",
  "update",
  "confirm",
  "alert",
  "alerts",
  "notice",
  "suspended",
  "wallet",
  "bank",
  "id",
  "identity",
  "my",
  "me",
  "portal",
  "dashboard",
  "manage",
  "settings",
  "profile",
  "connect",
  "legal",
  "privacy",
  "terms",
  "unsubscribe",
  "webhook",
  "webhooks",
  "callback",
  "download",
  "downloads",
  "install",
  "setup",
]);

/** Path segments the app itself serves, so a username can never shadow them. */
const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "booking",
  "book",
  "docs",
  "r",
  "unsubscribe",
  "waitlist",
  "login",
  "logout",
  "signin",
  "signup",
  "signout",
  "register",
  "embed",
  "meet",
  "setup",
  "forgot-password",
  "reset-password",
  "accept-invitation",
  "platform",
  "console",
  "workspaces",
  "about",
  "pricing",
  "features",
  "changelog",
  "contact",
  "dpa",
  "privacy",
  "terms",
  "security",
  "og",
  "sitemap",
  "robots",
  "manifest",
  "llms",
  "favicon",
  "icon",
  "apple-icon",
  "static",
  "assets",
  "public",
  "_next",
  "next",
  "bookly",
  "bookly-app",
  "official",
  "system",
  "null",
  "undefined",
]);

/**
 * Names nobody but their owner should look like, matched inside the handle after leetspeak and
 * hyphens are folded away, so `b00k-ly` and `paypa1` are caught along with the plain spelling.
 */
const PROTECTED_BRANDS = [
  "bookly",
  "cloudeo",
  "stripe",
  "paypal",
  "google",
  "gmail",
  "youtube",
  "microsoft",
  "outlook",
  "office365",
  "azure",

  "icloud",
  "amazon",

  "facebook",
  "instagram",
  "whatsapp",
  "linkedin",
  "twitter",
  "tiktok",

  "netflix",
  "spotify",
  "dropbox",
  "docusign",
  "coinbase",
  "binance",
  "metamask",

  "wellsfargo",
  "hsbc",
  "barclays",
  "revolut",

  "venmo",
  "cashapp",
  "zelle",
  "calendly",
  "calcom",
  "hubspot",
  "salesforce",
  "intercom",
  "shopify",

  "fedex",
  "dhl",

  "usps",
];

/** Words that, as a whole hyphen-separated part, make an address read like a security page. */
const TRUST_WORDS = new Set([
  "login",
  "logon",
  "signin",
  "verify",
  "verification",
  "secure",
  "security",
  "account",
  "accounts",
  "support",
  "helpdesk",
  "billing",
  "password",
  "wallet",
  "bank",
  "official",
  "update",
  "confirm",
  "alert",
  "suspended",
  "unlock",
  "recovery",
  "recover",
  "auth",
  "sso",
  "invoice",
  "payment",
  "refund",
  "id",
  "identity",
]);

const LEET: Record<string, string> = {
  "0": "o",
  "1": "l",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
};

/** The handle with hyphens dropped and digits read as the letters they stand in for. */
export const skeleton = (s: string, oneAs: "l" | "i" = "l") =>
  s.replace(/-/g, "").replace(/[0-9]/g, (d) => (d === "1" ? oneAs : (LEET[d] ?? d)));

/** The protected brand a handle imitates, or null. Exact ownership is not a thing here: the brand's own workspace is set up by the operator. */
export function imitatedBrand(handle: string): string | null {
  // A "1" stands in for either letter, so both readings are checked.
  const bare = [skeleton(handle, "l"), skeleton(handle, "i")];
  return PROTECTED_BRANDS.find((b) => bare.some((x) => x.includes(b))) ?? null;
}

/** The trust word a handle is built from (`acme-login`, `secure-pay`), or null. */
export function trustWord(handle: string): string | null {
  return handle.split("-").find((part) => TRUST_WORDS.has(part)) ?? null;
}

/**
 * Validates what the person typed without rewriting it, so every refusal names the exact
 * problem. Only the case is normalised. Ok results carry the value to store.
 */
export function checkHandle(raw: string, kind: HandleKind): HandleCheck {
  const value = raw.trim().toLowerCase();
  const noun = kind === "address" ? "address" : "username";
  if (value.length === 0)
    return { ok: false, error: `Pick ${kind === "address" ? "an" : "a"} ${noun}.` };
  if (/[^a-z0-9-]/.test(value))
    return { ok: false, error: "Only lowercase letters, numbers and hyphens." };
  if (value.length < MIN[kind]) return { ok: false, error: `At least ${MIN[kind]} characters.` };
  if (value.length > MAX_HANDLE) return { ok: false, error: `At most ${MAX_HANDLE} characters.` };
  if (value.startsWith("-") || value.endsWith("-"))
    return { ok: false, error: "Can't start or end with a hyphen." };
  if (value.includes("--")) return { ok: false, error: "No two hyphens in a row." };
  const reserved = kind === "address" ? RESERVED_ADDRESSES : RESERVED_USERNAMES;
  if (reserved.has(value)) return { ok: false, error: `That ${noun} is reserved.` };
  const brand = imitatedBrand(value);
  if (brand)
    return {
      ok: false,
      error: `That ${noun} looks like it imitates ${brand}. Pick something clearly yours.`,
    };
  if (kind === "address") {
    const word = trustWord(value);
    if (word)
      return {
        ok: false,
        error: `“${word}” isn't allowed in an address; it reads like a sign-in or payment page.`,
      };
  }
  return { ok: true, value };
}
