import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-32 text-center">
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">That page is not here</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        It may have moved, or the link was wrong. The home page has everything.
      </p>
      <Button className="mt-6" nativeButton={false} render={<Link href="/" />}>
        Back to Bookly
      </Button>
    </div>
  );
}
