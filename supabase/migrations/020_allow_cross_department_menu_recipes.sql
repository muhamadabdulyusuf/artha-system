-- Menus can use ingredients from more than one department.
-- Stock usage is still booked against each ingredient's owning department.

DROP TRIGGER IF EXISTS recipe_line_department_match ON recipe_line;
DROP FUNCTION IF EXISTS assert_recipe_line_department_match();
