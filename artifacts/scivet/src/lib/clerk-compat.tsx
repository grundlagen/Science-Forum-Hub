import type { ReactNode } from "react";
import { Show } from "@clerk/react";

export function SignedIn({ children }: { children: ReactNode }) {
  return <Show when="signed-in">{children}</Show>;
}

export function SignedOut({ children }: { children: ReactNode }) {
  return <Show when="signed-out">{children}</Show>;
}
