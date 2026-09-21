import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const features: [string, string][] = [
    [
      "Your booking page",
      "A clean page at your-name.bookly.app or your own domain, with your hours and event types.",
    ],
    [
      "Calendar aware",
      "Google and Outlook conflicts are respected; bookings land on your calendar with a Meet, Zoom, Teams or built-in video link.",
    ],
    [
      "Paid bookings",
      "Charge for consultations through Stripe. Refunds on cancel, no invoices to chase.",
    ],
    [
      "Reminders that work",
      "Email, SMS and WhatsApp reminders, follow-ups after the call, no-show tracking.",
    ],
    ["Teams", "Round-robin and collective event types spread bookings across your team."],
    [
      "Open source",
      "The same code you can self-host, run for you with backups, updates and support.",
    ],
  ];
  return (
    <div className="space-y-16">
      <section className="max-w-3xl space-y-6">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Scheduling that respects your calendar and your time.
        </h1>
        <p className="text-lg text-muted-foreground">
          Bookly gives you a booking page, calendar sync, video links, payments and reminders in one
          place. Start free, upgrade when you need more.
        </p>
        <div className="flex gap-3">
          <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
            Create your booking page
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href="/pricing" />}
          >
            See pricing
          </Button>
        </div>
      </section>
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(([t, d]) => (
          <div key={t} className="rounded-xl border p-5">
            <h2 className="font-medium">{t}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
