import type { Department } from "@/lib/types/database";

export type SalesMenuCategory =
  | "main_course"
  | "sides"
  | "cookies"
  | "coffee"
  | "matcha"
  | "tea"
  | "cokelat"
  | "refreshment";

export const SALES_MENU_CATEGORY_LABEL: Record<SalesMenuCategory, string> = {
  main_course: "Main Course",
  sides: "Sides",
  cookies: "Cookies",
  coffee: "Coffee",
  matcha: "Matcha",
  tea: "Tea",
  cokelat: "Cokelat",
  refreshment: "Refreshment",
};

export const SALES_MENU_CATEGORY_DEPARTMENT: Record<SalesMenuCategory, Department> = {
  main_course: "kitchen",
  sides: "kitchen",
  cookies: "kitchen",
  coffee: "bar",
  matcha: "bar",
  tea: "bar",
  cokelat: "bar",
  refreshment: "bar",
};

export const SALES_MENU_CATEGORY_OPTIONS: SalesMenuCategory[] = [
  "coffee",
  "matcha",
  "tea",
  "cokelat",
  "refreshment",
  "main_course",
  "sides",
  "cookies",
];

function normalizeMenuName(menuName: string): string {
  return menuName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export function classifySalesMenuCategory(menuName: string, department: Department): SalesMenuCategory {
  const name = normalizeMenuName(menuName);

  if (department === "kitchen") {
    if (hasAny(name, [/\bcookies?\b/, /\bcake\b/, /\bcheesec?ake\b/, /\bdessert\b/, /\bbrownies?\b/])) {
      return "cookies";
    }
    if (
      hasAny(name, [
        /\bfries?\b/,
        /\brings?\b/,
        /\bskin\b/,
        /\badd\s*on\b/,
        /\bextra\b/,
        /\bchili\b/,
        /\bsauce\b/,
        /\bsambal\b/,
        /\bside\b/,
        /\btopping\b/,
        /\bsnack\b/,
      ])
    ) {
      return "sides";
    }
    return "main_course";
  }

  if (hasAny(name, [/\bmatcha\b/, /\bgreen\s*tea\b/, /\bgreentea\b/, /\bgwentea\b/])) {
    return "matcha";
  }
  if (hasAny(name, [/\bchoco\b/, /\bchocolate\b/, /\bcoklat\b/, /\bcokelat\b/, /\bcocoa\b/, /\bdark\s*coco\b/])) {
    return "cokelat";
  }
  if (hasAny(name, [/\btea\b/, /\bteh\b/, /\bearl\s*grey\b/, /\boolong\b/, /\bjasmine\b/])) {
    return "tea";
  }
  if (
    hasAny(name, [
      /\bcoffee\b/,
      /\bkopi\b/,
      /\bkopsus\b/,
      /\bespresso\b/,
      /\bamericano\b/,
      /\bcapp?uccino\b/,
      /\blatte\b/,
      /\bflat\s*white\b/,
      /\bpiccolo\b/,
      /\bmacchiato\b/,
      /\bmocha\b/,
    ])
  ) {
    return "coffee";
  }
  return "refreshment";
}

export function salesMenuCategoryLabel(category: SalesMenuCategory): string {
  return SALES_MENU_CATEGORY_LABEL[category];
}

export function salesMenuCategorySortValue(category: SalesMenuCategory): number {
  const index = SALES_MENU_CATEGORY_OPTIONS.indexOf(category);
  return index === -1 ? SALES_MENU_CATEGORY_OPTIONS.length : index;
}
