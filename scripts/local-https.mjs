#!/usr/bin/env node
// Staging on this machine, over HTTPS: https://staging.bookly-app.io (and every
// <slug>.staging.bookly-app.io) answered by `next dev` here, with staging's variables, a Neon
// branch of staging's database and the delivery channels that reach real people turned off.
// Decision: planning/v2/decisions/local-https-staging.md. How-to: CONTRIBUTING.md
// ("Local HTTPS on the staging domain").
//
//   pnpm local:https setup             mkcert certificate + user-level dnsmasq; prints the sudo steps
//   pnpm local:https dns on|off|status this machine answers the staging domain (on) or the internet does
//   pnpm local:https proxy up|down|logs Caddy on :443 and Mailpit (deploy/local-https/compose.yml)
//   pnpm local:https db branch|reset|migrate|status   the Neon branch local work uses
//   pnpm local:https dev [--live]      next dev on :3002 with staging's variables (see `env`)
//   pnpm local:https env [--live]      where each variable comes from (names only, never values)
//   pnpm local:https webhooks          forward Stripe test events here (Stripe CLI)
//
// Values from .env* files are never printed.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

const ROOT = path.resolve(import.meta.dirname, "..");
const STAGING_FILE = path.join(ROOT, ".env.cloud.staging");
const OVERRIDES_FILE = path.join(ROOT, ".env.cloud.staging.local");
const DIR = path.join(ROOT, "deploy/local-https");
const CERT = path.join(DIR, "certs/local.pem");
const KEY = path.join(DIR, "certs/local-key.pem");
const CONFIG_DIR = path.join(homedir(), ".config/bookly");
const DNS_CONF = path.join(CONFIG_DIR, "dnsmasq.conf");
const DNS_PORT = 5354;
const AGENT = "io.bookly.dnsmasq";
const AGENT_PLIST = path.join(homedir(), "Library/LaunchAgents", `${AGENT}.plist`);
const NEONCTL = "neonctl@2";
const BRANCH = `local-${userInfo()
  .username.toLowerCase()
  .replace(/[^a-z0-9-]/g, "-")}`;

const say = (s = "") => console.log(s);
const die = (s) => {
  console.error(`local-https: ${s}`);
  process.exit(1);
};
const has = (bin) => spawnSync("sh", ["-c", `command -v ${bin}`], { stdio: "ignore" }).status === 0;
const readEnv = (file) => (existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {});

function staging() {
  if (!existsSync(STAGING_FILE)) die(".env.cloud.staging is missing (staging's variables).");
  return readEnv(STAGING_FILE);
}
const domain = () => (staging().ROOT_DOMAIN ?? "staging.bookly-app.io").split(":")[0];

/** host/database with Neon's -pooler folded, as packages/db/src/migrate-guard.ts compares. */
function databaseKey(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase().replace(/^([^.]+)-pooler\./, "$1.")}/${u.pathname.slice(1)}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// The environment `dev` runs with.

/** Never locally: they would call into or share state with the real staging deployment. */
const ALWAYS_REMOVED = [
  "NODE_ENV", // next dev sets development
  "JOBS_WORKER", // → the in-process pg-boss worker on the branch
  "QSTASH_TOKEN", // QStash would call real staging back, and boot would rewrite its schedules
  "QSTASH_URL",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "UPSTASH_REDIS_REST_URL", // rate-limit counters stay in this process, not staging's Redis
  "UPSTASH_REDIS_REST_TOKEN",
];
/** Off unless --live: the branch holds copies of staging's people, bookings and subscriptions. */
const DELIVERY = [
  "RESEND_API_KEY", // email goes to Mailpit instead
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_SMS",
  "TWILIO_FROM_WHATSAPP",
  "VAPID_PUBLIC_KEY", // web push to staging users' real devices
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "RECALL_API_KEY", // note-taker bots joining real calls for copied bookings
  "RECALL_WEBHOOK_SECRET",
];
const STRIPE = /^STRIPE_(?!TAX$|METER_CAPTURE_EVENT$)/;
const LOCAL_ONLY = /^LOCAL_NEON_/;

function caRoot() {
  try {
    return execFileSync("mkcert", ["-CAROOT"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** { env, sources } where sources maps each name to staging | override | local | removed. */
function buildEnv({ live = false } = {}) {
  const base = staging();
  const overrides = readEnv(OVERRIDES_FILE);
  const env = {};
  const sources = {};
  const set = (k, v, src) => {
    env[k] = v;
    sources[k] = src;
  };
  const remove = (k) => {
    if (k in base || k in env || k in process.env) sources[k] = "removed";
    delete env[k];
  };

  for (const [k, v] of Object.entries(base)) set(k, v, "staging");
  for (const k of ALWAYS_REMOVED) remove(k);
  if (!live) {
    for (const k of DELIVERY) remove(k);
    set("EMAIL_DRIVER", "smtp", "local");
    set("SMTP_HOST", "127.0.0.1", "local");
    set("SMTP_PORT", "1025", "local");
    set("SMTP_SECURE", "false", "local");
  }
  // Stripe events are account-wide: a checkout made here also reaches real staging's webhook,
  // which knows the same workspaces. Staging's test keys only with --live; a Stripe sandbox of
  // its own, in the overrides file, always.
  const ownStripe = !!overrides.STRIPE_SECRET_KEY;
  if (!live || ownStripe) for (const k of Object.keys(env)) if (STRIPE.test(k)) remove(k);
  // next.config.ts fills unset names from .env.local; these would reach Mailpit as credentials.
  set("SMTP_USER", "", "local");
  set("SMTP_PASS", "", "local");
  set("TELEMETRY", "off", "local");
  set("REALTIME_PORT", "3003", "local");
  const ca = caRoot();
  if (ca) set("NODE_EXTRA_CA_CERTS", path.join(ca, "rootCA.pem"), "local"); // fetches to our own https host

  for (const [k, v] of Object.entries(overrides)) if (!LOCAL_ONLY.test(k)) set(k, v, "override");

  const stagingDb = databaseKey(base.DATABASE_URL);
  if (!overrides.DATABASE_URL)
    die(
      "no database branch yet. Run `pnpm local:https db branch` (local work never uses staging's database).",
    );
  for (const k of ["DATABASE_URL", "REALTIME_DATABASE_URL"])
    if (env[k] && databaseKey(env[k]) === stagingDb)
      die(
        `${k} in .env.cloud.staging.local is staging's own database. Use the Neon branch (db branch).`,
      );
  return { env, sources, live, ownStripe };
}

// ---------------------------------------------------------------------------------------------
// Certificates and DNS.

function certs() {
  if (!has("mkcert")) die("mkcert is not installed (brew install mkcert).");
  const d = domain();
  mkdirSync(path.dirname(CERT), { recursive: true });
  execFileSync(
    "mkcert",
    ["-cert-file", CERT, "-key-file", KEY, d, `*.${d}`, "localhost", "127.0.0.1", "::1"],
    { stdio: "inherit" },
  );
  chmodSync(KEY, 0o600);
  const ca = caRoot();
  if (!ca || !existsSync(path.join(ca, "rootCA.pem")))
    say("mkcert has no CA yet: run `mkcert -install` once (it asks for your password).");
}

function dnsmasqBin() {
  for (const p of ["/opt/homebrew/sbin/dnsmasq", "/usr/local/sbin/dnsmasq"])
    if (existsSync(p)) return p;
  return has("dnsmasq")
    ? execFileSync("sh", ["-c", "command -v dnsmasq"], { encoding: "utf8" }).trim()
    : null;
}

function writeDnsConf(mode) {
  const d = domain();
  mkdirSync(CONFIG_DIR, { recursive: true });
  const answer =
    mode === "on" ? [`address=/${d}/127.0.0.1`] : [`server=/${d}/1.1.1.1`, `server=/${d}/8.8.8.8`];
  writeFileSync(
    DNS_CONF,
    [
      `# Written by scripts/local-https.mjs. mode=${mode}`,
      `# Asked only for ${d} and its subdomains, through /etc/resolver/${d}.`,
      `port=${DNS_PORT}`,
      "listen-address=127.0.0.1",
      "bind-interfaces",
      "no-resolv",
      "no-hosts",
      `pid-file=${path.join(CONFIG_DIR, "dnsmasq.pid")}`,
      ...answer,
      "",
    ].join("\n"),
  );
}

const dnsMode = () =>
  existsSync(DNS_CONF)
    ? (readFileSync(DNS_CONF, "utf8").match(/mode=(on|off)/)?.[1] ?? "?")
    : "not set up";
const uid = () => process.getuid();
const agentLoaded = () =>
  spawnSync("launchctl", ["print", `gui/${uid()}/${AGENT}`], { stdio: "ignore" }).status === 0;

function installAgent() {
  const bin = dnsmasqBin();
  if (!bin) die("dnsmasq is not installed (brew install dnsmasq; no sudo needed).");
  if (!existsSync(DNS_CONF)) writeDnsConf("off");
  mkdirSync(path.dirname(AGENT_PLIST), { recursive: true });
  const log = path.join(homedir(), "Library/Logs/bookly-dnsmasq.log");
  writeFileSync(
    AGENT_PLIST,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${AGENT}</string>
  <key>ProgramArguments</key>
  <array><string>${bin}</string><string>--keep-in-foreground</string><string>--conf-file=${DNS_CONF}</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>${log}</string>
</dict>
</plist>
`,
  );
  if (!agentLoaded())
    execFileSync("launchctl", ["bootstrap", `gui/${uid()}`, AGENT_PLIST], { stdio: "inherit" });
  restartDns();
}

function restartDns() {
  if (agentLoaded()) execFileSync("launchctl", ["kickstart", "-k", `gui/${uid()}/${AGENT}`]);
  spawnSync("dscacheutil", ["-flushcache"], { stdio: "ignore" });
}

function resolverOk() {
  const f = `/etc/resolver/${domain()}`;
  return existsSync(f) && /port\s+5354/.test(readFileSync(f, "utf8"));
}

function sudoSteps() {
  const d = domain();
  return [
    "sudo mkdir -p /etc/resolver",
    `printf 'nameserver 127.0.0.1\\nport ${DNS_PORT}\\n' | sudo tee /etc/resolver/${d}`,
    "sudo killall -HUP mDNSResponder",
  ];
}

async function resolvesTo() {
  try {
    return (await lookup(domain(), { family: 4 })).address;
  } catch {
    return null;
  }
}

async function dnsStatus() {
  const addr = await resolvesTo();
  say(
    `DNS mode ${dnsMode()}; dnsmasq agent ${agentLoaded() ? "running" : "not loaded"}; ` +
      `/etc/resolver/${domain()} ${resolverOk() ? "present" : "MISSING"}`,
  );
  say(
    `${domain()} resolves to ${addr ?? "nothing"}${addr === "127.0.0.1" ? " (this machine)" : addr ? " (the real staging)" : ""}`,
  );
  if (!resolverOk()) say(`One-time, with sudo:\n  ${sudoSteps().join("\n  ")}`);
}

// ---------------------------------------------------------------------------------------------
// The Neon branch.

function neon(args, { json = true } = {}) {
  const r = spawnSync(
    "pnpm",
    ["-s", "dlx", NEONCTL, ...args, ...(json ? ["--output", "json"] : [])],
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"],
    },
  );
  if (r.status !== 0)
    throw new Error(
      `neonctl ${args.slice(0, 2).join(" ")} failed (run \`pnpm dlx ${NEONCTL} auth\` once).`,
    );
  return json ? JSON.parse(r.stdout) : r.stdout.trim();
}
const list = (x, key) => (Array.isArray(x) ? x : (x?.[key] ?? []));

function connectionString(projectId, branch, role, database, pooled) {
  return neon(
    [
      "connection-string",
      branch,
      "--project-id",
      projectId,
      "--role-name",
      role,
      "--database-name",
      database,
      ...(pooled ? ["--pooled"] : []),
    ],
    { json: false },
  );
}

/** Finds staging's project and branch by matching endpoint hosts; never prints a URL. */
function findStaging(projectHint) {
  const url = new URL(staging().DATABASE_URL);
  const role = decodeURIComponent(url.username);
  const database = url.pathname.slice(1);
  const key = databaseKey(staging().DATABASE_URL);
  const projects = projectHint
    ? [{ id: projectHint }]
    : list(neon(["projects", "list"]), "projects");
  for (const p of projects) {
    for (const b of list(neon(["branches", "list", "--project-id", p.id]), "branches")) {
      let cs;
      try {
        cs = connectionString(p.id, b.id, role, database, false);
      } catch {
        continue;
      }
      if (databaseKey(cs) === key) return { project: p, branch: b, role, database };
    }
  }
  die(
    "no Neon branch matches staging's DATABASE_URL. Pass --project-id <id> if it is in an organization.",
  );
}

function writeOverrides(values) {
  const lines = existsSync(OVERRIDES_FILE)
    ? readFileSync(OVERRIDES_FILE, "utf8").split("\n")
    : [
        "# Local overrides for `pnpm local:https dev` (git-ignored). Read after .env.cloud.staging.",
        "# Stripe sandbox of your own: put its STRIPE_* here (all of them, prices included).",
      ];
  const kept = lines.filter((l) => !Object.keys(values).some((k) => l.startsWith(`${k}=`)));
  while (kept.length && kept.at(-1) === "") kept.pop();
  const out = [...kept, ...Object.entries(values).map(([k, v]) => `${k}=${JSON.stringify(v)}`), ""];
  const old = process.umask(0o077);
  writeFileSync(OVERRIDES_FILE, out.join("\n"));
  process.umask(old);
  chmodSync(OVERRIDES_FILE, 0o600);
}

function dbBranch(projectHint) {
  const found = findStaging(projectHint);
  const pid = found.project.id;
  const existing = list(neon(["branches", "list", "--project-id", pid]), "branches").find(
    (b) => b.name === BRANCH,
  );
  if (existing) say(`Branch ${BRANCH} exists; reusing it.`);
  else {
    neon([
      "branches",
      "create",
      "--project-id",
      pid,
      "--name",
      BRANCH,
      "--parent",
      found.branch.id,
    ]);
    say(
      `Created ${BRANCH} from ${found.branch.name ?? found.branch.id} (copy-on-write: staging's data as of now).`,
    );
  }
  writeOverrides({
    DATABASE_URL: connectionString(pid, BRANCH, found.role, found.database, true),
    REALTIME_DATABASE_URL: connectionString(pid, BRANCH, found.role, found.database, false), // LISTEN needs a direct connection
    LOCAL_NEON_PROJECT_ID: pid,
    LOCAL_NEON_BRANCH: BRANCH,
  });
  say("Wrote DATABASE_URL and REALTIME_DATABASE_URL (the branch) to .env.cloud.staging.local.");
  say("Next: pnpm local:https db migrate   (this checkout's migrations, on the branch only)");
}

function dbReset() {
  const o = readEnv(OVERRIDES_FILE);
  if (!o.LOCAL_NEON_PROJECT_ID) die("no branch recorded; run `pnpm local:https db branch` first.");
  neon([
    "branches",
    "reset",
    o.LOCAL_NEON_BRANCH,
    "--parent",
    "--project-id",
    o.LOCAL_NEON_PROJECT_ID,
  ]);
  say(
    `${o.LOCAL_NEON_BRANCH} now matches staging again; run \`pnpm local:https db migrate\` for this checkout's migrations.`,
  );
}

function dbMigrate() {
  const { env } = buildEnv();
  const target = env.REALTIME_DATABASE_URL || env.DATABASE_URL; // direct connection for DDL
  const r = spawnSync("pnpm", ["--filter", "@bookly/db", "migrate"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...env, DATABASE_URL: target, BOOKLY_MIGRATE_SHARED: "" },
  });
  process.exit(r.status ?? 1);
}

// ---------------------------------------------------------------------------------------------
// Proxy, dev server, Stripe.

function compose(args, opts = {}) {
  return spawnSync(
    "docker",
    ["compose", "-f", path.join(DIR, "compose.yml"), "--env-file", "/dev/null", ...args],
    {
      stdio: "inherit",
      env: { ...process.env, BOOKLY_DOMAIN: domain() },
      ...opts,
    },
  );
}
const proxyUp = () =>
  spawnSync(
    "docker",
    ["compose", "-f", path.join(DIR, "compose.yml"), "ps", "--status", "running", "-q", "caddy"],
    {
      encoding: "utf8",
    },
  ).stdout.trim() !== "";

function stripeSecret(env) {
  if (!env.STRIPE_SECRET_KEY || !has("stripe")) return null;
  const r = spawnSync("stripe", ["listen", "--print-secret"], {
    encoding: "utf8",
    env: { ...process.env, STRIPE_API_KEY: env.STRIPE_SECRET_KEY },
  });
  return r.status === 0 ? r.stdout.trim() : null;
}

function describe({ sources, live, ownStripe, env }) {
  const by = (s) =>
    Object.keys(sources)
      .filter((k) => sources[k] === s)
      .sort();
  say(
    `Mode: ${live ? "LIVE (Resend, Twilio, web push and Recall reach real people)" : "isolated (email in Mailpit, no SMS, push or bots)"}`,
  );
  say(
    `Stripe: ${env.STRIPE_SECRET_KEY ? (ownStripe ? "your own sandbox (.env.cloud.staging.local)" : "staging's test account — its webhook sees these events too") : "off"}`,
  );
  say(`Database: the Neon branch in .env.cloud.staging.local; jobs: in-process pg-boss on it`);
  say(`From staging   ${by("staging").join(" ")}`);
  say(`Overridden     ${by("override").join(" ") || "-"}`);
  say(`Set locally    ${by("local").join(" ")}`);
  say(`Removed        ${by("removed").join(" ") || "-"}`);
  const leaks = Object.keys(readEnv(path.join(ROOT, ".env.local"))).filter(
    (k) => !(k in env) && sources[k] !== "removed",
  );
  if (leaks.length) say(`From .env.local (next.config.ts fills unset names): ${leaks.join(" ")}`);
}

async function dev(live) {
  const built = buildEnv({ live });
  if (!existsSync(CERT)) die("no certificate yet: run `pnpm local:https setup`.");
  const secret = stripeSecret(built.env);
  if (secret) {
    built.env.STRIPE_WEBHOOK_SECRET = built.env.STRIPE_CONNECT_WEBHOOK_SECRET = secret;
    built.sources.STRIPE_WEBHOOK_SECRET = built.sources.STRIPE_CONNECT_WEBHOOK_SECRET = "local";
  }
  describe(built);
  if (!proxyUp()) say("WARNING: the proxy is not running: pnpm local:https proxy up");
  const addr = await resolvesTo();
  if (addr !== "127.0.0.1")
    say(
      `WARNING: ${domain()} resolves to ${addr ?? "nothing"}, not this machine: pnpm local:https dns on`,
    );
  if (built.env.STRIPE_SECRET_KEY)
    say("Stripe events: run `pnpm local:https webhooks` in another terminal.");
  say(`\nhttps://${domain()}  ·  https://<slug>.${domain()}  ·  Mailpit http://localhost:8025\n`);

  const env = { ...process.env };
  for (const [k, s] of Object.entries(built.sources)) if (s === "removed") delete env[k];
  Object.assign(env, built.env);
  const child = spawn("pnpm", ["--filter", "@bookly/web", "dev"], {
    cwd: ROOT,
    stdio: "inherit",
    env,
  });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
  child.on("exit", (code) => process.exit(code ?? 0));
}

function webhooks() {
  const { env } = buildEnv({ live: process.argv.includes("--live") });
  if (!env.STRIPE_SECRET_KEY) die("Stripe is off locally (see `pnpm local:https env`).");
  if (!has("stripe"))
    die("the Stripe CLI is not installed (brew install stripe/stripe-cli/stripe).");
  const base = `https://${domain()}/api/webhooks/stripe`;
  const r = spawnSync(
    "stripe",
    ["listen", "--forward-to", base, "--forward-connect-to", `${base}/connect`],
    {
      stdio: "inherit",
      env: { ...process.env, STRIPE_API_KEY: env.STRIPE_SECRET_KEY },
    },
  );
  process.exit(r.status ?? 1);
}

// ---------------------------------------------------------------------------------------------

const [cmd = "help", sub] = process.argv.slice(2);
const live = process.argv.includes("--live");
const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

try {
  switch (cmd) {
    case "setup": {
      certs();
      installAgent();
      say(`Certificate: deploy/local-https/certs (git-ignored) for ${domain()} and *.${domain()}.`);
      say(`dnsmasq: user LaunchAgent ${AGENT} on 127.0.0.1:${DNS_PORT}, mode ${dnsMode()}.`);
      if (!resolverOk()) say(`\nOne-time, with sudo:\n  ${sudoSteps().join("\n  ")}`);
      say("\nThen: pnpm local:https db branch → db migrate → proxy up → dns on → dev");
      break;
    }
    case "certs":
      certs();
      break;
    case "dns":
      if (sub === "on" || sub === "off") {
        if (!agentLoaded()) installAgent();
        writeDnsConf(sub);
        restartDns();
        say(
          sub === "on"
            ? `${domain()} and *.${domain()} now resolve to this machine.`
            : `${domain()} resolves through the internet again (the real staging).`,
        );
        say(
          "Browsers cache DNS for a minute (Chrome: chrome://net-internals/#dns → Clear host cache).",
        );
      }
      await dnsStatus();
      break;
    case "proxy":
      if (sub === "up") {
        if (!existsSync(CERT)) die("no certificate yet: run `pnpm local:https setup`.");
        process.exit(compose(["up", "-d"]).status ?? 1);
      }
      if (sub === "down") process.exit(compose(["down"]).status ?? 1);
      if (sub === "logs") process.exit(compose(["logs", "-f", "--tail", "100"]).status ?? 1);
      process.exit(compose(["ps"]).status ?? 1);
      break;
    case "db":
      if (sub === "branch") dbBranch(flag("--project-id"));
      else if (sub === "reset") dbReset();
      else if (sub === "migrate") dbMigrate();
      else {
        const o = readEnv(OVERRIDES_FILE);
        say(
          o.LOCAL_NEON_BRANCH
            ? `Branch ${o.LOCAL_NEON_BRANCH} (project ${o.LOCAL_NEON_PROJECT_ID}).`
            : "No branch yet: pnpm local:https db branch",
        );
      }
      break;
    case "dev":
      await dev(live);
      break;
    case "env":
      describe(buildEnv({ live }));
      break;
    case "webhooks":
      webhooks();
      break;
    default:
      say(
        readFileSync(new URL(import.meta.url), "utf8")
          .split("\n")
          .slice(1, 16)
          .map((l) => l.replace(/^\/\/ ?/, ""))
          .join("\n"),
      );
  }
} catch (err) {
  die(err.message);
}
