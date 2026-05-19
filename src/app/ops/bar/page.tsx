import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ProductionForm } from "@/components/staff/ProductionForm";
import { WorksheetClosing } from "@/components/staff/WorksheetClosing";

export default function OpsBarPage() {
  return (
    <ProtectedRoute opsDepartment="bar">
      <div className="space-y-4">
        <ProductionForm department="bar" />
        <WorksheetClosing department="bar" title="Operasional Bar" />
      </div>
    </ProtectedRoute>
  );
}
