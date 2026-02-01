-- Create exec_sql helper function for running migrations via API
CREATE OR REPLACE FUNCTION public.exec_sql(sql_query text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    EXECUTE sql_query;
    RETURN 'Success';
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'Error: ' || SQLERRM;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.exec_sql TO authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql TO service_role;
