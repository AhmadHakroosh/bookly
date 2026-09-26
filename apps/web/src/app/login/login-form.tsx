"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import type { SocialProvider } from "@/lib/social-providers";
import { OrDivider, SocialButtons } from "@/components/social-buttons";

export function LoginForm({
  next,
  providers,
}: {
  next: string;
  providers: readonly SocialProvider[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function withPending(fn: () => Promise<void>) {
    setPending(true);
    try {
      await fn();
    } finally {
      setPending(false);
    }
  }

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await withPending(async () => {
      const { error } = await authClient.signIn.email({
        email: String(f.get("email")),
        password: String(f.get("password")),
      });
      if (error) return void toast.error(error.message ?? "Sign-in failed");
      router.push(next);
      router.refresh();
    });
  }

  async function onMagic(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await withPending(async () => {
      const { error } = await authClient.signIn.magicLink({
        email: String(f.get("email")),
        callbackURL: next,
      });
      if (error) return void toast.error(error.message ?? "Could not send link");
      toast.success("Check your email for a sign-in link.");
    });
  }

  return (
    <>
      {providers.length > 0 && (
        <>
          <SocialButtons
            providers={providers}
            callbackURL={next}
            errorCallbackURL={`/login?next=${encodeURIComponent(next)}`}
          />
          <OrDivider />
        </>
      )}
      <Tabs defaultValue="password">
        <TabsList className="w-full">
          <TabsTrigger value="password" className="flex-1">
            Password
          </TabsTrigger>
          <TabsTrigger value="magic" className="flex-1">
            Email link
          </TabsTrigger>
        </TabsList>
        <TabsContent value="password">
          <form onSubmit={onPassword} className="mt-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <p className="-mt-2 text-right text-xs">
                <Link
                  href={`/forgot-password?next=${encodeURIComponent(next)}`}
                  className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Forgot your password?
                </Link>
              </p>
              <Button type="submit" className="w-full" disabled={pending}>
                Sign in
              </Button>
            </FieldGroup>
          </form>
        </TabsContent>
        <TabsContent value="magic">
          <form onSubmit={onMagic} className="mt-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="magic-email">Email</FieldLabel>
                <Input id="magic-email" name="email" type="email" autoComplete="email" required />
              </Field>
              <Button type="submit" className="w-full" disabled={pending}>
                Send sign-in link
              </Button>
            </FieldGroup>
          </form>
        </TabsContent>
      </Tabs>
    </>
  );
}
