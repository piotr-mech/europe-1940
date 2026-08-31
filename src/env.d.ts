/// <reference types="vite/client" />

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
  }
}
