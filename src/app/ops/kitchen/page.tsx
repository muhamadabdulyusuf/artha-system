import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { WorksheetClosing } from "@/components/staff/WorksheetClosing";

export default function OpsKitchenPage() {
  return (
    <ProtectedRoute opsDepartment="kitchen">
      <WorksheetClosing department="kitchen" title="Operasional Kitchen" />
    </ProtectedRoute>
  );
}
