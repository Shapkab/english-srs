alter table if exists jobs
add column if not exists last_error text;
