-- Add a dedicated Master Admin enum value.
-- Run this file alone in SQL Editor before 044_split_master_admin_and_admin.sql.

ALTER TYPE staff_role ADD VALUE IF NOT EXISTS 'master_admin' BEFORE 'admin';
