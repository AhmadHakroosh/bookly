"use client";

import { useEffect } from "react";
import { markHomeVisited } from "./home-actions";

/** Marks this Home visit after the page has shown the "since your last visit" numbers. */
export function HomeVisit() {
  useEffect(() => {
    void markHomeVisited();
  }, []);
  return null;
}
