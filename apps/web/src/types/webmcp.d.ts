/*
 * WebMCP declarative tools (https://webmachinelearning.github.io/webmcp/): a `<form>` with
 * `toolname` and `tooldescription` is a tool an AI agent can call, and each named control is a
 * parameter whose `toolparamdescription` tells the agent what to put in it.
 */
import "react";

declare module "react" {
  interface FormHTMLAttributes<T> extends HTMLAttributes<T> {
    toolname?: string;
    tooldescription?: string;
    /** Let the agent submit the form itself instead of handing it back to the person. */
    toolautosubmit?: boolean;
  }
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    toolparamdescription?: string;
  }
  interface TextareaHTMLAttributes<T> extends HTMLAttributes<T> {
    toolparamdescription?: string;
  }
  interface SelectHTMLAttributes<T> extends HTMLAttributes<T> {
    toolparamdescription?: string;
  }
}
