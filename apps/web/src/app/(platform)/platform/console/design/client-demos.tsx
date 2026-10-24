"use client";

import { useState } from "react";
import {
  CalendarPlusIcon,
  LayoutGridIcon,
  MessageSquarePlusIcon,
  PlusIcon,
  SquareCheckIcon,
  UserPlusIcon,
} from "lucide-react";
import { ChecklistRow } from "@/components/ui/checklist-row";
import { SplitButton } from "@/components/ui/split-button";

/** The parts of the gallery that hold state or take icons as props (client-only). */
export function CreateDemo() {
  return (
    <SplitButton
      href="/console/design"
      menuLabel="More things to create"
      items={[
        { label: "Booking", icon: CalendarPlusIcon, href: "/console/design" },
        { label: "Contact", icon: UserPlusIcon, href: "/console/design" },
        { label: "Task", icon: SquareCheckIcon, href: "/console/design" },
        { label: "Event type", icon: LayoutGridIcon, href: "/console/design" },
        { label: "Message", icon: MessageSquarePlusIcon, href: "/console/design" },
      ]}
    >
      <PlusIcon data-icon="inline-start" />
      Create
    </SplitButton>
  );
}

export function ChecklistDemo() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const rows = [
    {
      title: "Send proposal to Priya Shah",
      meta: "Priya Shah • Northstar Studio",
      due: "Due today",
      urgent: true,
    },
    { title: "Review intake form", meta: "Alex Morgan • Morgan & Co.", due: "Due tomorrow" },
    {
      title: "Prepare coaching worksheet",
      meta: "Sam Rivera • Leadership coaching",
      due: "Due Thu, Oct 29",
    },
  ];
  return (
    <div className="divide-y">
      {rows.map((r) => (
        <ChecklistRow
          key={r.title}
          {...r}
          checked={!!done[r.title]}
          onCheckedChange={(v) => setDone((d) => ({ ...d, [r.title]: v }))}
        />
      ))}
    </div>
  );
}
