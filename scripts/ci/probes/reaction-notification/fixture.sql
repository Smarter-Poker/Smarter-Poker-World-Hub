-- Exact reviewed handler and trigger definitions; isolated notification tables.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE profiles(id uuid PRIMARY KEY,full_name text,username text);
CREATE TABLE social_posts(id uuid PRIMARY KEY,author_id uuid);
CREATE TABLE social_reels(id uuid PRIMARY KEY,author_id uuid);
CREATE TABLE content_authors(profile_id uuid PRIMARY KEY,is_active boolean);
CREATE TABLE social_interactions(id integer PRIMARY KEY,user_id uuid,post_id uuid,interaction_type text NOT NULL);
CREATE TABLE notifications(user_id uuid,actor_id uuid,type text,title text,message text,data jsonb);
CREATE OR REPLACE FUNCTION public.fn_notify_post_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    liker_name TEXT;
    post_author_id UUID;
BEGIN
    IF NEW.interaction_type NOT IN ('like','love','haha','wow','sad','angry') THEN
        RETURN NEW;
    END IF;

    -- Check social_reels first, then social_posts
    SELECT author_id INTO post_author_id FROM public.social_reels WHERE id = NEW.post_id;
    IF post_author_id IS NULL THEN
        SELECT author_id INTO post_author_id FROM public.social_posts WHERE id = NEW.post_id;
    END IF;

    IF post_author_id IS NOT NULL AND post_author_id != NEW.user_id THEN
        -- Skip notifications from AI horse bots / content authors
        IF EXISTS (SELECT 1 FROM public.content_authors WHERE profile_id = NEW.user_id AND is_active = true) THEN
            RETURN NEW;
        END IF;
        SELECT COALESCE(full_name, username, 'Someone') INTO liker_name FROM public.profiles WHERE id = NEW.user_id;
        INSERT INTO public.notifications (user_id, actor_id, type, title, message, data)
        VALUES (
            post_author_id,
            NEW.user_id,
            'like',
            liker_name,
            'liked your post',
            jsonb_build_object('post_id', NEW.post_id, 'actor_id', NEW.user_id, 'actor_name', liker_name)
        );
    END IF;
    RETURN NEW;
END;
$function$
;
REVOKE ALL ON FUNCTION public.fn_notify_post_like() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_notify_post_like() TO service_role;
CREATE TRIGGER trg_notify_post_like AFTER INSERT ON public.social_interactions FOR EACH ROW EXECUTE FUNCTION public.fn_notify_post_like();
CREATE TRIGGER trg_notify_interaction_like AFTER INSERT ON public.social_interactions FOR EACH ROW WHEN(NEW.interaction_type IN ('like','love','haha','wow','sad','angry')) EXECUTE FUNCTION public.fn_notify_post_like();
INSERT INTO profiles VALUES('00000000-0000-4000-8000-000000000001','Author','author'),('00000000-0000-4000-8000-000000000002','Actor','actor');
INSERT INTO social_posts VALUES('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001');
INSERT INTO social_reels VALUES('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001');
