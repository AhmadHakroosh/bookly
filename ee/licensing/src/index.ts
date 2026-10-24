// SPDX-License-Identifier: Elastic-2.0
import type { EeModule } from "@bookly/editions";
import { PUBLIC_KEYS } from "./keys";
import { createVerifier } from "./verify";

/**
 * The license module: it implements no feature itself, it verifies the key that unlocks the
 * others. Core finds it through the generated registry; without it every commercial feature is
 * unavailable (Community).
 */
const license: EeModule = {
  id: "license",
  features: [],
  verifier: createVerifier(PUBLIC_KEYS),
};

export default license;
