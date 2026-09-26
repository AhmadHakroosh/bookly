-- Accounts created before email verification existed: every user who set a password proved
-- nothing about their mailbox, and Better Auth 1.7 removes such "unproven" password accounts
-- the first time the person signs in with a magic link. These users predate the check, so they
-- are marked verified once; from now on sign-up verifies the address before it can be used.
UPDATE "users"
SET "email_verified" = true
WHERE "email_verified" = false
  AND "id" IN (SELECT "user_id" FROM "accounts" WHERE "provider_id" = 'credential');
