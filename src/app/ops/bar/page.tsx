import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { WorksheetClosing } from "@/components/staff/WorksheetClosing";

export default function OpsBarPage() {
  return (
    <ProtectedRoute opsDepartment="bar">
      <WorksheetClosing department="bar" title="Operasional Bar" />
    </ProtectedRoute>
  );
}
