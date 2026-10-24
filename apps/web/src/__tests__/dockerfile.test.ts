import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The Docker image installs dependencies from the package manifests alone (a cached layer),
 * then copies the sources. A workspace package whose manifest is not copied there loses its own
 * dependencies in the image; that happened to packages/storage. Every new package is listed.
 */

const REPO = path.resolve(__dirname, "../../../..");

const workspacePackages = () =>
  ["apps", "packages", "ee"].flatMap((dir) =>
    existsSync(path.join(REPO, dir))
      ? readdirSync(path.join(REPO, dir), { withFileTypes: true })
          .filter(
            (d) => d.isDirectory() && existsSync(path.join(REPO, dir, d.name, "package.json")),
          )
          .map((d) => `${dir}/${d.name}`)
      : [],
  );

describe("Dockerfile", () => {
  it("copies every workspace package's manifest into the dependency layer", () => {
    const dockerfile = readFileSync(path.join(REPO, "Dockerfile"), "utf8");
    const missing = workspacePackages().filter(
      (p) => !dockerfile.includes(`COPY ${p}/package.json ${p}/`),
    );
    expect(missing).toEqual([]);
  });
});
