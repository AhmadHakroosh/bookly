import { BookingBriefSkeleton } from "@/components/skeletons/pages";
import { Suspense } from "react";
import { BookingDetail } from "../booking-detail";

export const metadata = { title: "Meeting brief" };

async function BookingBriefPage({ params }: PageProps<"/admin/bookings/[id]">) {
  const { id } = await params;
  return <BookingDetail id={id} />;
}

export default function BookingBriefPageBoundary(props: PageProps<"/admin/bookings/[id]">) {
  return (
    <Suspense fallback={<BookingBriefSkeleton />}>
      <BookingBriefPage {...props} />
    </Suspense>
  );
}
