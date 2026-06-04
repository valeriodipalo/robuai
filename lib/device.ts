"use client";

// Anonymous per-device identity (no login in v1). Stored in localStorage and
// sent with every API call so chats are scoped to this device.
const KEY = "robuai_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}
