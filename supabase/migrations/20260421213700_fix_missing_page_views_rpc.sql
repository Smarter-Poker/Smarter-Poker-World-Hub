CREATE OR REPLACE FUNCTION increment_page_views(page_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.social_pages
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = page_uuid;
END;
$$;
