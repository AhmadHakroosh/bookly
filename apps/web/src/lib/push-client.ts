"use client";

import { useSyncExternalStore } from "react";

/*
 * Browser side of desktop notifications: the service worker (`/sw.js`, scope /admin), the push
 * subscription, and the permission prompt. Every function is safe to call in a browser without
 * support; it reports "unsupported" instead of throwing.
 */

export type PushSupport = "unsupported" | "default" | "granted" | "denied";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (!("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission;
}

const PERMISSION_EVENT = "bookly:notification-permission";

function onPermissionChange(cb: () => void) {
  window.addEventListener(PERMISSION_EVENT, cb);
  let status: PermissionStatus | null = null;
  navigator.permissions
    ?.query({ name: "notifications" })
    .then((s) => {
      status = s;
      s.addEventListener("change", cb);
    })
    .catch(() => {});
  return () => {
    window.removeEventListener(PERMISSION_EVENT, cb);
    status?.removeEventListener("change", cb);
  };
}

/** The notification permission as React state (null while rendering on the server). */
export const usePushSupport = (): PushSupport | null =>
  useSyncExternalStore(onPermissionChange, pushSupport, () => null);

/** Asks for permission once and tells every `usePushSupport` the answer. */
export async function requestPermission(): Promise<NotificationPermission> {
  const p = await Notification.requestPermission();
  window.dispatchEvent(new Event(PERMISSION_EVENT));
  return p;
}

export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", {
      scope: "/admin",
      updateViaCache: "none",
    });
  } catch (e) {
    console.error("[push] service worker registration failed", e);
    return null;
  }
}

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** The current subscription of this browser, if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registerWorker();
  if (!reg || !("pushManager" in reg)) return null;
  return reg.pushManager.getSubscription().catch(() => null);
}

/**
 * Asks for permission (when not decided yet) and subscribes with the install's VAPID key.
 * Returns the subscription, or null when the member said no or push is unavailable.
 */
export async function subscribe(vapidKey: string): Promise<PushSubscription | null> {
  if (pushSupport() === "unsupported") return null;
  const permission =
    Notification.permission === "default" ? await requestPermission() : Notification.permission;
  if (permission !== "granted") return null;
  const reg = await registerWorker();
  if (!reg || !("pushManager" in reg)) return null;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager
    .subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) })
    .catch((e) => {
      console.error("[push] subscribe failed", e);
      return null;
    });
}

/** Shows a notification from the open page (used when Web Push is not configured). */
export async function showLocal(title: string, body: string | null, url: string, tag: string) {
  if (pushSupport() !== "granted") return;
  const reg = await registerWorker();
  if (reg) {
    await reg.showNotification(title, {
      body: body ?? "",
      icon: "/notification-icon.png",
      badge: "/notification-badge.png",
      tag,
      data: { url },
    });
    return;
  }
  const n = new Notification(title, { body: body ?? "", icon: "/notification-icon.png", tag });
  n.onclick = () => {
    window.focus();
    window.location.assign(url);
  };
}
