import type { Metadata } from "next";
import { SOLUTIONS, SolutionsPage, solutionMetadata } from "./solutions";

export const metadata: Metadata = solutionMetadata(SOLUTIONS[0]!);

export default function Page() {
  return <SolutionsPage slug="consultants" />;
}
