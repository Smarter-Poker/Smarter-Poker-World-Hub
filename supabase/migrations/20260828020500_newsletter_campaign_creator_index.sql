-- Covers the auth.users foreign key used for administrator campaign audits.
begin;

create index if not exists newsletter_campaigns_created_by_idx
  on public.newsletter_campaigns (created_by)
  where created_by is not null;

commit;
