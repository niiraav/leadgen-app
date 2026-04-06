-- Add email verification columns
alter table leads add column if not exists email_status text default 'unverified';
alter table leads add column if not exists email_status_checked_at timestamptz;
alter table lead_activities add column if not exists resolved boolean default false;
