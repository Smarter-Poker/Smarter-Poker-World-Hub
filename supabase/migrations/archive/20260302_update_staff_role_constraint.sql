-- Update the role check constraint to include new roles: dualrate, cashier, security
-- The old constraint only allowed: owner, manager, floor, brush, dealer

ALTER TABLE commander_staff DROP CONSTRAINT IF EXISTS commander_staff_role_check;

ALTER TABLE commander_staff ADD CONSTRAINT commander_staff_role_check 
  CHECK (role IN ('owner', 'manager', 'dualrate', 'floor', 'brush', 'cashier', 'dealer', 'security'));
