import type { StaffRole } from "@/lib/types/database";

export type OperationalRecordType = "overtime" | "daily_worker";
export type OperationalPaymentStatus = "draft" | "paid";

export type ActivityLogEntry = {
  id: string;
  timestamp: string;
  note: string;
};

export type StaffOption = {
  id: string;
  name: string;
  role: StaffRole;
};

export interface OvertimeRecord {
  id: string;
  record_type: "overtime";
  staff_id: string | null;
  name: string;
  date: string;
  hourly_rate: number;
  total_hours: number;
  activity_log: ActivityLogEntry[];
  total_pay: number;
  status: OperationalPaymentStatus;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyWorkerRecord {
  id: string;
  record_type: "daily_worker";
  staff_id: null;
  name: string;
  date: string;
  hourly_rate: number;
  total_hours: number;
  daily_rate: number;
  work_days: number;
  total_daily_wage: number;
  activity_log: ActivityLogEntry[];
  total_pay: number;
  status: OperationalPaymentStatus;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export type OperationalTrackerRecord = OvertimeRecord | DailyWorkerRecord;

export type AddStaffMode = OperationalRecordType;

export type AddStaffPayload = {
  record_type: OperationalRecordType;
  staff_id: string | null;
  name: string;
  date: string;
  hourly_rate: number;
  total_hours: number;
  daily_rate: number;
  work_days: number;
  activity_log: ActivityLogEntry[];
};

export type OperationalTrackerDbRow = {
  id: string;
  record_type: OperationalRecordType;
  staff_id: string | null;
  name: string;
  date: string;
  hourly_rate: number;
  total_hours: number;
  daily_rate: number | null;
  work_days: number | null;
  total_daily_wage: number | null;
  activity_log: ActivityLogEntry[];
  total_pay: number;
  status: OperationalPaymentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  creator?: { name: string } | { name: string }[] | null;
};
