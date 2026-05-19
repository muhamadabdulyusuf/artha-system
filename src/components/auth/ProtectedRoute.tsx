"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  canAccessAdminRoute,
  canAccessOpsRoute,
} from "@/lib/auth/routeAccess";
import { getRouteForRole, getStaffSession, type StaffSession } from "@/lib/auth/session";
import type { Department, StaffRole } from "@/lib/types/database";

type ProtectedRouteProps = {
  children: ReactNode;
  allowedRoles?: StaffRole[];
  opsDepartment?: Department;
  onSession?: (session: StaffSession) => void;
};

export function ProtectedRoute({
  children,
  allowedRoles,
  opsDepartment,
  onSession,
}: ProtectedRouteProps) {
  const router = useRouter();
  const [session, setSession] = useState<StaffSession | null>(null);

  useEffect(() => {
    const current = getStaffSession();
    if (!current) {
      router.replace("/");
      return;
    }

    if (allowedRoles && !allowedRoles.includes(current.role)) {
      router.replace(getRouteForRole(current.role));
      return;
    }

    if (opsDepartment) {
      if (!canAccessOpsRoute(current.role, current.department, opsDepartment)) {
        router.replace(getRouteForRole(current.role));
        return;
      }
    } else if (!allowedRoles && !canAccessAdminRoute(current.role)) {
      router.replace(getRouteForRole(current.role));
      return;
    }

    setSession(current);
    onSession?.(current);
  }, [allowedRoles, opsDepartment, onSession, router]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Memuat…
      </div>
    );
  }

  return <>{children}</>;
}
