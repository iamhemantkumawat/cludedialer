/// <reference types="@cloudflare/workers-types" />

declare global {
  interface Env {
    [key: string]: unknown;
  }
}

export {};
