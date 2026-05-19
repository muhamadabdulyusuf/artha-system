export type Department = "bar" | "kitchen";
export type IngredientUnit = "ml" | "gram" | "pcs";
export type StaffRole = "admin" | "op_manager" | "bar_staff" | "kitchen_staff";
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
  | "ADJUSTMENT";

export type OpnamePendingStatus = "PENDING_APPROVAL_ADMIN" | "APPROVED" | "REJECTED";

export type StaffRow = {
  id: string;
  name: string;
  pin_code: string;
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
  current_stock: number;
  minimum_stock: number;
  slow_moving_threshold_days: number;
  is_active: boolean;
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

export type WorksheetInLineRow = {
  id: string;
  session_id: string;
  ingredient_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
};

export type WorksheetSoldLineRow = {
  id: string;
  session_id: string;
  menu_item_id: string;
  quantity_sold: number;
  created_at: string;
  updated_at: string;
};

export type WorksheetOutLineRow = {
  id: string;
  session_id: string;
  ingredient_id: string;
  quantity: number;
  note: string;
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
  min_order_amount: number;
  phone_number: string;
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
          role: StaffRole;
          department?: Department | null;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          pin_code?: string;
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
          current_stock?: number;
          minimum_stock?: number;
          slow_moving_threshold_days?: number;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          department?: Department;
          unit?: string;
          current_stock?: number;
          minimum_stock?: number;
          slow_moving_threshold_days?: number;
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
      worksheet_in_line: {
        Row: WorksheetInLineRow;
        Insert: {
          id?: string;
          session_id: string;
          ingredient_id: string;
          quantity: number;
        };
        Update: { quantity?: number };
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
      worksheet_out_line: {
        Row: WorksheetOutLineRow;
        Insert: {
          id?: string;
          session_id: string;
          ingredient_id: string;
          quantity: number;
          note?: string;
        };
        Update: { quantity?: number; note?: string };
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
          min_order_amount?: number;
          phone_number?: string;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          min_order_amount?: number;
          phone_number?: string;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
