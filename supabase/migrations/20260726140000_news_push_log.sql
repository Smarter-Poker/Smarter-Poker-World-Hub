create table if not exists news_push_log (
  article_id uuid primary key references poker_news(id) on delete cascade,
  sent_at timestamptz not null default now(),
  recipient_count integer not null default 0
);
alter table news_push_log enable row level security;
