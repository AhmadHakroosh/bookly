import { SubmitButton } from "@/components/submit-button";
import { startConnect } from "@/app/(admin)/admin/integrations-actions";

/** Starts the OAuth flow via a server action (a plain link would let Next prefetch the redirect). */
export function ConnectButton({
  provider,
  back,
  label = "Connect",
  variant = "default",
  size,
}: {
  provider: string;
  back: string;
  label?: string;
  variant?: "default" | "outline";
  size?: "sm";
}) {
  return (
    <form action={startConnect.bind(null, provider, back)}>
      <SubmitButton variant={variant} size={size}>
        {label}
      </SubmitButton>
    </form>
  );
}
