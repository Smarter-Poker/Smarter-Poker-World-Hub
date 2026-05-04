-- Drop the 4-arg legacy overload of deduct_diamonds to resolve PGRST203 ambiguity
DROP FUNCTION IF EXISTS public.deduct_diamonds(uuid, integer, text, text);
