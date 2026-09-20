import { Button } from "@/components/ui/button";
import { startConnect } from "@/app/(admin)/admin/integrations-actions";

/** Starts the OAuth flow via a server action (a plain link would let Next prefetch the redirect). */
export function ConnectButton({
  provider,
  back,
  label = "Connect",
  variant = "default",
}: {
  provider: string;
  back: string;
  label?: string;
  variant?: "default" | "outline";
}) {
  return (
    <form action={startConnect.bind(null, provider, back)}>
      <Button type="submit" size={variant === "outline" ? "sm" : undefined} variant={variant}>
        {label}
      </Button>
    </form>
  );
}
