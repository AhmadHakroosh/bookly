import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicContainer, PublicSkeleton } from "../../container";
import { leaveWaitlist } from "@/server/waitlist";

export const metadata: Metadata = { title: "Waitlist", robots: { index: false } };

async function LeavePage({ params }: PageProps<"/waitlist/[token]">) {
  const { token } = await params;
  const entry = await leaveWaitlist(token);
  return (
    <PublicContainer className="py-12">
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight">
          {entry ? "You left the waitlist" : "Link not found"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {entry
            ? "You will not get further emails about this spot."
            : "This waitlist link is not valid any more."}
        </p>
      </div>
    </PublicContainer>
  );
}

export default function LeavePageBoundary(props: PageProps<"/waitlist/[token]">) {
  return (
    <Suspense fallback={<PublicSkeleton />}>
      <LeavePage {...props} />
    </Suspense>
  );
}
