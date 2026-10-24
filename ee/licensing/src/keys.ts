// SPDX-License-Identifier: Elastic-2.0
/**
 * Public keys that sign Bookly licenses, by key id. Add a key to rotate; never remove one
 * while licenses signed with it are still in force. The private keys are held by Cloudeo
 * Solutions, LLC and never enter this repository (scripts/issue.ts keygen).
 */
export const PUBLIC_KEYS: Record<string, string> = {
  k1: "w_D6lBXfVVXC9D7bxy6me4XW_czYhWptwdqiAq3C65o",
};
