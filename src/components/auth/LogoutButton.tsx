"use client";

import { useRouter } from "next/navigation";
import { clearStaffSession } from "@/lib/auth/session";

type LogoutButtonProps = {
  className?: string;
  children?: React.ReactNode;
};

export function LogoutButton({ className, children }: LogoutButtonProps) {
  const router = useRouter();

  const handleLogout = () => {
    clearStaffSession();
    router.replace("/");
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={
        className ??
        "min-h-12 w-full rounded-xl border border-red-500/40 bg-red-500/10 px-4 font-semibold text-red-300"
      }
    >
      {children ?? "Log Out"}
    </button>
  );
}
