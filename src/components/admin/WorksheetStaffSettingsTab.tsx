"use client";

import { RoleTaskSettingsPanel } from "@/components/admin/RoleTaskSettingsPanel";
import { ServiceRevenueControlPanel } from "@/components/admin/ServiceRevenueControlPanel";
import { ServiceSettlementPanel } from "@/components/admin/ServiceSettlementPanel";
import { StaffAccountsPanel } from "@/components/admin/StaffAccountsPanel";

export function WorksheetStaffSettingsTab() {
  return (
    <div className="space-y-8">
      <ServiceRevenueControlPanel />
      <div className="h-px bg-slate-50" />
      <ServiceSettlementPanel />
      <div className="h-px bg-slate-50" />
      <StaffAccountsPanel />
      <div className="h-px bg-slate-50" />
      <RoleTaskSettingsPanel />
    </div>
  );
}
