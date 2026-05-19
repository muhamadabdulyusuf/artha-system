import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ProductionForm } from "@/components/staff/ProductionForm";
import { WorksheetClosing } from "@/components/staff/WorksheetClosing";

export default function OpsKitchenPage() {
  return (
    <ProtectedRoute opsDepartment="kitchen">
      <div className="space-y-4">
        <ProductionForm department="kitchen" />
        <WorksheetClosing department="kitchen" title="Operasional Kitchen" />
      </div>
    </ProtectedRoute>
  );
}
