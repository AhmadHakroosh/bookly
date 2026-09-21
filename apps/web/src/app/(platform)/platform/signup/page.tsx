import { Suspense } from "react";
import { loadEnv } from "@bookly/config";
import { getSession } from "@/server/session";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Get started" };

async function SignupPage() {
  const session = await getSession();
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Create your booking page</h1>
      <p className="mt-1 text-sm text-muted-foreground">Free to start. No card needed.</p>
      <div className="mt-8">
        <SignupForm rootDomain={loadEnv().ROOT_DOMAIN ?? ""} signedIn={!!session} />
      </div>
    </div>
  );
}

export default function SignupPageBoundary() {
  return (
    <Suspense fallback={null}>
      <SignupPage />
    </Suspense>
  );
}
