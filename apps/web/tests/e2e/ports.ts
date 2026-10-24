/*
 * The e2e server's port and the fake Resend API's, together so parallel worktrees can run the
 * suite side by side: set E2E_PORT (and a database of your own). 3010 and 3999 by default.
 */
export const E2E_PORT = Number(process.env.E2E_PORT) || 3010;
export const RESEND_FAKE_PORT = E2E_PORT + 989;
