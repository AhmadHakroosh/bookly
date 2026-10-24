"use client";

import { useTransition } from "react";
import {
  LayoutGridIcon,
  MessageSquarePlusIcon,
  PlusIcon,
  SplitIcon,
  SquareCheckIcon,
} from "lucide-react";
import { BusyOverlay } from "@/components/busy-overlay";
import { SplitButton, type SplitItem } from "@/components/ui/split-button";
import { createRoutingForm } from "./routing/actions";
import { createEventType } from "./scheduling-actions";

/**
 * "+ Create ▾" in Home's header (`app ui.png`). It offers what Bookly can create from anywhere
 * today: a task and a message open their forms (`?new=1`), an event type and a routing form are
 * created and opened in their editors. Booking and contact join when hosts can create those.
 */
export function CreateMenu({ tasks, messages }: { tasks: boolean; messages: boolean }) {
  const [pending, start] = useTransition();
  const items: SplitItem[] = [
    ...(tasks ? [{ label: "Task", icon: SquareCheckIcon, href: "/admin/tasks?new=1" }] : []),
    ...(messages
      ? [{ label: "Message", icon: MessageSquarePlusIcon, href: "/admin/messages?new=1" }]
      : []),
    { label: "Event type", icon: LayoutGridIcon, onSelect: () => start(() => createEventType()) },
    { label: "Routing form", icon: SplitIcon, onSelect: () => start(() => createRoutingForm()) },
  ];
  return (
    <>
      <BusyOverlay show={pending} label="Creating…" />
      <SplitButton items={items}>
        <PlusIcon data-icon="inline-start" />
        Create
      </SplitButton>
    </>
  );
}
