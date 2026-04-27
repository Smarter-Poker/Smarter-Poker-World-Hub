SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'fn_create_social_post';
