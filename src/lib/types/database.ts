export type Department = "bar" | "kitchen";
export type IngredientKind = "raw" | "premix";
export type IngredientUnit = "ml" | "gram" | "pcs";
export type StaffRole =
  | "admin"
  | "op_manager"
  | "bar_staff"
  | "kitchen_staff"
  | "viewer";
export type ClosingStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "ADJUSTED"
  | "LOCKED"
  | "PENDING_APPROVAL_ADMIN";

export type StockLogEventType =
  | "RECEIVE"
  | "OUTSTOCK"
  | "OPNAME"
  | "CLOSING"
  | "ADJUSTMENT"
  | "PRODUCTION";

export type OpnamePendingStatus = "PENDING_APPROVAL_ADMIN" | "APPROVED" | "REJECTED";
export type WorksheetEditRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type StaffRow = {
  id: string;
  name: string;
  pin_code: string;
  password_hash: string;
  role: StaffRole;
  department: Department | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type IngredientRow = {
  id: string;
  name: string;
  department: Department;
  unit: string;
  purchase_unit: string | null;
  purchase_to_stock_factor: number;
  default_unit_price: number;
  kind: IngredientKind;
  current_stock: number;
  minimum_stock: number;
  slow_moving_threshold_days: number;
  is_stock_tracked: boolean;
  primary_supplier_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RecipeRow = {
  id: string;
  output_ingredient_id: string;
  yield_quantity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RecipeComponentRow = {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  qty_per_batch: number;
  created_at: string;
  updated_at: string;
};

export type ProductionLogRow = {
  id: string;
  business_date: string;
  department: Department;
  output_ingredient_id: string;
  recipe_id: string;
  batch_quantity: number;
  produced_by_staff_id: string;
  created_at: string;
};

export type WorksheetPremixLineRow = {
  id: string;
  session_id: string;
  output_ingredient_id: string;
  recipe_id: string;
  batch_quantity: number;
  staff_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MenuItemRow = {
  id: string;
  menu_name: string;
  department: Department;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MenuRecipeVersionRow = {
  id: string;
  menu_item_id: string;
  version: number;
  valid_from: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RecipeLineRow = {
  id: string;
  recipe_version_id: string;
  ingredient_id: string;
  quantity_per_serving: number;
  created_at: string;
  updated_at: string;
};

export type RecipeLineWithIngredient = RecipeLineRow & {
  ingredient: Pick<IngredientRow, "id" | "name" | "unit" | "department">;
};

export type BusinessDayRow = {
  business_date: string;
  status: ClosingStatus;
  created_at: string;
  updated_at: string;
};

export type WorksheetSessionRow = {
  id: string;
  business_date: string;
  department: Department;
  status: ClosingStatus;
  submitted_at: string | null;
  submitted_by_staff_id: string | null;
  locked_at: string | null;
  locked_by_staff_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WorksheetEditRequestRow = {
  id: string;
  session_id: string;
  business_date: string;
  department: Department;
  requested_by_staff_id: string | null;
  reason: string;
  status: WorksheetEditRequestStatus;
  reviewed_by_staff_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

export type WorksheetInLineRow = {
  id: string;
  session_id: string;
  ingredient_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
  updated_at: string;
};

export type WorksheetReceiveEntryRow = {
  id: string;
  session_id: string;
  ingredient_id: string;
  staff_id: string | null;
  quantity: number;
  created_at: string;
};

export type WorksheetSoldLineRow = {
  id: string;
  session_id: string;
  menu_item_id: string;
  quantity_sold: number;
  created_at: string;
  updated_at: string;
};

export type WorksheetSoldEntryRow = {
  id: string;
  session_id: string;
  menu_item_id: string;
  staff_id: string | null;
  quantity_sold: number;
  created_at: string;
  updated_at: string;
};

export type WorksheetMenuIssueLineRow = {
  id: string;
  session_id: string;
  menu_item_id: string;
  quantity: number;
  reason: string;
  note: string;
  staff_id: string | null;
  photo_url: string | null;
  photo_public_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WorksheetOutLineRow = {
  id: string;
  session_id: string;
  ingredient_id: string;
  quantity: number;
  note: string;
  staff_id: string | null;
  photo_url: string | null;
  photo_public_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WorksheetOpnameLineRow = {
  id: string;
  session_id: string;
  ingredient_id: string;
  closing_stock: number;
  staff_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipeLineForCalc = {
  ingredient_id: string;
  quantity_per_serving: number;
};

export type MenuWithRecipe = MenuItemRow & {
  recipe_version_id: string | null;
  recipe_lines: RecipeLineForCalc[];
};

export type StockLedgerRow = {
  id: string;
  business_date: string;
  ingredient_id: string;
  opening_stock: number;
  in_qty: number;
  theoretical_usage: number;
  adjustment_qty: number;
  closing_stock: number;
  created_at: string;
  updated_at: string;
};

export type StockLogRow = {
  id: string;
  ingredient_id: string;
  business_date: string | null;
  event_type: StockLogEventType;
  qty_before: number;
  qty_after: number;
  reason: string | null;
  message: string;
  worksheet_session_id: string | null;
  created_by_staff_id: string | null;
  created_at: string;
};

export type WorksheetOpnamePendingRow = {
  id: string;
  session_id: string;
  business_date: string;
  ingredient_id: string;
  system_stock: number;
  physical_stock: number;
  variance_qty: number;
  variance_pct: number;
  status: OpnamePendingStatus;
  submitted_by_staff_id: string | null;
  reviewed_by_staff_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplierRow = {
  id: string;
  name: string;
  category: string;
  pic_name: string;
  min_order_amount: number;
  phone_number: string;
  link_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SupplierIngredientPriceRow = {
  id: string;
  supplier_id: string;
  ingredient_id: string;
  unit_price: number;
  valid_from: string;
  created_at: string;
  updated_at: string;
};

export type PurchaseOrderRow = {
  id: string;
  supplier_id: string;
  status: "DRAFT" | "SUBMITTED" | "CANCELLED";
  total_amount: number;
  created_by_staff_id: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseOrderLineRow = {
  id: string;
  purchase_order_id: string;
  ingredient_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
  updated_at: string;
};

export type PurchaseRequestDepartment = Department | "general";
export type PurchaseRequestMethod = "Online" | "Offline";
export type PurchaseRequestPoStatus = "Pending" | "Approved" | "Rejected";
export type PurchaseRequestStatus =
  | "Belum Dibeli"
  | "On Progress"
  | "Purchased"
  | "Shipped"
  | "Arrived"
  | "Cancelled";

export type PurchaseRequestTrackerRow = {
  id: string;
  request_date: string;
  ingredient_id: string | null;
  item_name: string;
  department: PurchaseRequestDepartment;
  qty: number;
  unit: string;
  supplier_id: string | null;
  supplier_name: string;
  supplier_contact: string;
  unit_price: number;
  total_price: number;
  purchase_method: PurchaseRequestMethod;
  purchase_link: string;
  pic_request_staff_id: string | null;
  pic_request_name: string;
  approved_by_staff_id: string | null;
  approved_by_name: string;
  po_status: PurchaseRequestPoStatus;
  purchase_status: PurchaseRequestStatus;
  estimated_arrival_date: string | null;
  arrival_date: string | null;
  arrival_day_diff: number | null;
  note: string;
  stock_applied_at: string | null;
  stock_applied_qty: number;
  stock_log_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DemandEventRow = {
  id: string;
  title: string;
  event_type: string;
  department: Department | null;
  start_date: string;
  end_date: string;
  expected_uplift_pct: number;
  notes: string;
  source: string;
  external_id: string | null;
  created_by_staff_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AiBusinessMemoryRow = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  department: Department | null;
  importance: number;
  source: string;
  created_by_staff_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorksheetStaffSettingRow = {
  department: Department;
  tab_id: string;
  is_enabled: boolean;
  updated_at: string;
};

export type MenuCategory = "food" | "beverage";

export type Database = {
  public: {
    Tables: {
      staff: {
        Row: StaffRow;
        Insert: {
          id?: string;
          name: string;
          pin_code: string;
          password_hash?: string;
          role: StaffRole;
          department?: Department | null;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          pin_code?: string;
          password_hash?: string;
          role?: StaffRole;
          department?: Department | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      ingredient: {
        Row: IngredientRow;
        Insert: {
          id?: string;
          name: string;
          department: Department;
          unit: string;
          purchase_unit?: string | null;
          purchase_to_stock_factor?: number;
          default_unit_price?: number;
          kind?: IngredientKind;
          current_stock?: number;
          minimum_stock?: number;
          slow_moving_threshold_days?: number;
          is_stock_tracked?: boolean;
          primary_supplier_id?: string | null;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          department?: Department;
          unit?: string;
          purchase_unit?: string | null;
          purchase_to_stock_factor?: number;
          default_unit_price?: number;
          kind?: IngredientKind;
          current_stock?: number;
          minimum_stock?: number;
          slow_moving_threshold_days?: number;
          is_stock_tracked?: boolean;
          primary_supplier_id?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      menu_item: {
        Row: MenuItemRow;
        Insert: {
          id?: string;
          menu_name: string;
          department: Department;
          price?: number;
          is_active?: boolean;
        };
        Update: {
          menu_name?: string;
          department?: Department;
          price?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      menu_recipe_version: {
        Row: MenuRecipeVersionRow;
        Insert: {
          id?: string;
          menu_item_id: string;
          version: number;
          valid_from: string;
          is_active?: boolean;
        };
        Update: {
          menu_item_id?: string;
          version?: number;
          valid_from?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };
      recipe_line: {
        Row: RecipeLineRow;
        Insert: {
          id?: string;
          recipe_version_id: string;
          ingredient_id: string;
          quantity_per_serving: number;
        };
        Update: {
          recipe_version_id?: string;
          ingredient_id?: string;
          quantity_per_serving?: number;
        };
        Relationships: [];
      };
      business_day: {
        Row: BusinessDayRow;
        Insert: { business_date: string; status?: ClosingStatus };
        Update: { status?: ClosingStatus };
        Relationships: [];
      };
      worksheet_staff_setting: {
        Row: WorksheetStaffSettingRow;
        Insert: {
          department: Department;
          tab_id: string;
          is_enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          is_enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      worksheet_session: {
        Row: WorksheetSessionRow;
        Insert: {
          id?: string;
          business_date: string;
          department: Department;
          status?: ClosingStatus;
          submitted_at?: string | null;
          submitted_by_staff_id?: string | null;
          locked_at?: string | null;
          locked_by_staff_id?: string | null;
        };
        Update: {
          status?: ClosingStatus;
          submitted_at?: string | null;
          submitted_by_staff_id?: string | null;
          locked_at?: string | null;
          locked_by_staff_id?: string | null;
        };
        Relationships: [];
      };
      worksheet_edit_request: {
        Row: WorksheetEditRequestRow;
        Insert: {
          id?: string;
          session_id: string;
          business_date: string;
          department: Department;
          requested_by_staff_id?: string | null;
          reason: string;
          status?: WorksheetEditRequestStatus;
          reviewed_by_staff_id?: string | null;
          reviewed_at?: string | null;
          review_note?: string | null;
        };
        Update: {
          status?: WorksheetEditRequestStatus;
          reviewed_by_staff_id?: string | null;
          reviewed_at?: string | null;
          review_note?: string | null;
        };
        Relationships: [];
      };
      worksheet_in_line: {
        Row: WorksheetInLineRow;
        Insert: {
          id?: string;
          session_id: string;
          ingredient_id: string;
          quantity: number;
          unit_price?: number;
          line_total?: number;
        };
        Update: { quantity?: number; unit_price?: number; line_total?: number };
        Relationships: [];
      };
      worksheet_receive_entry: {
        Row: WorksheetReceiveEntryRow;
        Insert: {
          id?: string;
          session_id: string;
          ingredient_id: string;
          staff_id?: string | null;
          quantity: number;
          created_at?: string;
        };
        Update: {
          staff_id?: string | null;
          quantity?: number;
        };
        Relationships: [];
      };
      worksheet_sold_line: {
        Row: WorksheetSoldLineRow;
        Insert: {
          id?: string;
          session_id: string;
          menu_item_id: string;
          quantity_sold: number;
        };
        Update: { quantity_sold?: number };
        Relationships: [];
      };
      worksheet_sold_entry: {
        Row: WorksheetSoldEntryRow;
        Insert: {
          id?: string;
          session_id: string;
          menu_item_id: string;
          staff_id?: string | null;
          quantity_sold: number;
        };
        Update: {
          staff_id?: string | null;
          quantity_sold?: number;
        };
        Relationships: [];
      };
      worksheet_menu_issue_line: {
        Row: WorksheetMenuIssueLineRow;
        Insert: {
          id?: string;
          session_id: string;
          menu_item_id: string;
          quantity: number;
          reason?: string;
          note?: string;
          staff_id?: string | null;
          photo_url?: string | null;
          photo_public_id?: string | null;
        };
        Update: {
          quantity?: number;
          reason?: string;
          note?: string;
          staff_id?: string | null;
          photo_url?: string | null;
          photo_public_id?: string | null;
        };
        Relationships: [];
      };
      worksheet_out_line: {
        Row: WorksheetOutLineRow;
        Insert: {
          id?: string;
          session_id: string;
          ingredient_id: string;
          quantity: number;
          note?: string;
          staff_id?: string | null;
          photo_url?: string | null;
          photo_public_id?: string | null;
        };
        Update: {
          quantity?: number;
          note?: string;
          staff_id?: string | null;
          photo_url?: string | null;
          photo_public_id?: string | null;
        };
        Relationships: [];
      };
      worksheet_opname_line: {
        Row: WorksheetOpnameLineRow;
        Insert: {
          id?: string;
          session_id: string;
          ingredient_id: string;
          closing_stock: number;
          staff_id?: string | null;
        };
        Update: { closing_stock?: number; staff_id?: string | null };
        Relationships: [];
      };
      worksheet_premix_line: {
        Row: WorksheetPremixLineRow;
        Insert: {
          id?: string;
          session_id: string;
          output_ingredient_id: string;
          recipe_id: string;
          batch_quantity: number;
          staff_id?: string | null;
        };
        Update: { batch_quantity?: number; recipe_id?: string; staff_id?: string | null };
        Relationships: [];
      };
      stock_ledger: {
        Row: StockLedgerRow;
        Insert: {
          id?: string;
          business_date: string;
          ingredient_id: string;
          opening_stock?: number;
          in_qty?: number;
          theoretical_usage?: number;
          adjustment_qty?: number;
          closing_stock?: number;
        };
        Update: {
          opening_stock?: number;
          in_qty?: number;
          theoretical_usage?: number;
          adjustment_qty?: number;
          closing_stock?: number;
        };
        Relationships: [];
      };
      stock_log: {
        Row: StockLogRow;
        Insert: {
          id?: string;
          ingredient_id: string;
          business_date?: string | null;
          event_type: StockLogEventType;
          qty_before: number;
          qty_after: number;
          reason?: string | null;
          message: string;
          worksheet_session_id?: string | null;
          created_by_staff_id?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      worksheet_opname_pending: {
        Row: WorksheetOpnamePendingRow;
        Insert: {
          id?: string;
          session_id: string;
          business_date: string;
          ingredient_id: string;
          system_stock: number;
          physical_stock: number;
          variance_qty: number;
          variance_pct: number;
          status?: OpnamePendingStatus;
          submitted_by_staff_id?: string | null;
          reviewed_by_staff_id?: string | null;
          reviewed_at?: string | null;
          review_note?: string | null;
        };
        Update: {
          status?: OpnamePendingStatus;
          reviewed_by_staff_id?: string | null;
          reviewed_at?: string | null;
          review_note?: string | null;
        };
        Relationships: [];
      };
      supplier: {
        Row: SupplierRow;
        Insert: {
          id?: string;
          name: string;
          category?: string;
          pic_name?: string;
          min_order_amount?: number;
          phone_number?: string;
          link_url?: string;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          category?: string;
          pic_name?: string;
          min_order_amount?: number;
          phone_number?: string;
          link_url?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };
      supplier_ingredient_price: {
        Row: SupplierIngredientPriceRow;
        Insert: {
          id?: string;
          supplier_id: string;
          ingredient_id: string;
          unit_price: number;
          valid_from?: string;
        };
        Update: {
          unit_price?: number;
          valid_from?: string;
        };
        Relationships: [];
      };
      purchase_order: {
        Row: PurchaseOrderRow;
        Insert: {
          id?: string;
          supplier_id: string;
          status?: "DRAFT" | "SUBMITTED" | "CANCELLED";
          total_amount?: number;
          created_by_staff_id?: string | null;
          submitted_at?: string | null;
        };
        Update: {
          status?: "DRAFT" | "SUBMITTED" | "CANCELLED";
          total_amount?: number;
          submitted_at?: string | null;
        };
        Relationships: [];
      };
      purchase_order_line: {
        Row: PurchaseOrderLineRow;
        Insert: {
          id?: string;
          purchase_order_id: string;
          ingredient_id: string;
          quantity: number;
          unit_price: number;
          line_total: number;
        };
        Update: {
          quantity?: number;
          unit_price?: number;
          line_total?: number;
        };
        Relationships: [];
      };
      purchase_request_tracker: {
        Row: PurchaseRequestTrackerRow;
        Insert: {
          id?: string;
          request_date?: string;
          ingredient_id?: string | null;
          item_name: string;
          department?: PurchaseRequestDepartment;
          qty: number;
          unit: string;
          supplier_id?: string | null;
          supplier_name?: string;
          supplier_contact?: string;
          unit_price?: number;
          total_price?: number;
          purchase_method?: PurchaseRequestMethod;
          purchase_link?: string;
          pic_request_staff_id?: string | null;
          pic_request_name?: string;
          approved_by_staff_id?: string | null;
          approved_by_name?: string;
          po_status?: PurchaseRequestPoStatus;
          purchase_status?: PurchaseRequestStatus;
          estimated_arrival_date?: string | null;
          arrival_date?: string | null;
          arrival_day_diff?: number | null;
          note?: string;
          stock_applied_at?: string | null;
          stock_applied_qty?: number;
          stock_log_id?: string | null;
        };
        Update: {
          request_date?: string;
          ingredient_id?: string | null;
          item_name?: string;
          department?: PurchaseRequestDepartment;
          qty?: number;
          unit?: string;
          supplier_id?: string | null;
          supplier_name?: string;
          supplier_contact?: string;
          unit_price?: number;
          total_price?: number;
          purchase_method?: PurchaseRequestMethod;
          purchase_link?: string;
          pic_request_staff_id?: string | null;
          pic_request_name?: string;
          approved_by_staff_id?: string | null;
          approved_by_name?: string;
          po_status?: PurchaseRequestPoStatus;
          purchase_status?: PurchaseRequestStatus;
          estimated_arrival_date?: string | null;
          arrival_date?: string | null;
          note?: string;
        };
        Relationships: [];
      };
      demand_event: {
        Row: DemandEventRow;
        Insert: {
          id?: string;
          title: string;
          event_type?: string;
          department?: Department | null;
          start_date: string;
          end_date: string;
          expected_uplift_pct?: number;
          notes?: string;
          source?: string;
          external_id?: string | null;
          created_by_staff_id?: string | null;
        };
        Update: {
          title?: string;
          event_type?: string;
          department?: Department | null;
          start_date?: string;
          end_date?: string;
          expected_uplift_pct?: number;
          notes?: string;
          source?: string;
          external_id?: string | null;
        };
        Relationships: [];
      };
      ai_business_memory: {
        Row: AiBusinessMemoryRow;
        Insert: {
          id?: string;
          title?: string;
          content: string;
          tags?: string[];
          department?: Department | null;
          importance?: number;
          source?: string;
          created_by_staff_id?: string | null;
          archived_at?: string | null;
        };
        Update: {
          title?: string;
          content?: string;
          tags?: string[];
          department?: Department | null;
          importance?: number;
          source?: string;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      recipes: {
        Row: RecipeRow;
        Insert: {
          id?: string;
          output_ingredient_id: string;
          yield_quantity?: number;
          is_active?: boolean;
        };
        Update: {
          output_ingredient_id?: string;
          yield_quantity?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      recipe_component: {
        Row: RecipeComponentRow;
        Insert: {
          id?: string;
          recipe_id: string;
          ingredient_id: string;
          qty_per_batch: number;
        };
        Update: {
          recipe_id?: string;
          ingredient_id?: string;
          qty_per_batch?: number;
        };
        Relationships: [];
      };
      production_logs: {
        Row: ProductionLogRow;
        Insert: {
          id?: string;
          business_date: string;
          department: Department;
          output_ingredient_id: string;
          recipe_id: string;
          batch_quantity: number;
          produced_by_staff_id: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      verify_staff_pin: {
        Args: { p_pin: string };
        Returns: {
          id: string;
          name: string;
          role: StaffRole;
          department: Department | null;
        }[];
      };
      list_active_login_staff: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          name: string;
          role: StaffRole;
          department: Department | null;
        }[];
      };
      verify_staff_password: {
        Args: { p_name: string; p_password: string };
        Returns: {
          id: string;
          name: string;
          role: StaffRole;
          department: Department | null;
        }[];
      };
      produce_premix: {
        Args: {
          p_ingredient_id: string;
          p_quantity: number;
          p_department: Department;
          p_staff_id: string;
          p_business_date?: string;
        };
        Returns: {
          ok: boolean;
          output_ingredient_id: string;
          batch_quantity: number;
          business_date: string;
        };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
