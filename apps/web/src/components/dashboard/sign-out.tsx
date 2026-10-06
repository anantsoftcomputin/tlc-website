"use client";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useRouter } from "next/navigation";
export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/session", { method: "DELETE" });
        await signOut(getFirebaseAuth());
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
