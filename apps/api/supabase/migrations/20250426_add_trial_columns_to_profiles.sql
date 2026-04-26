-- Add trial tracking columns to profiles table
-- Phase 1 of billing consolidation

alter table public.profiles
  add column if not exists trial_used boolean default false,
  add column if not exists trial_started_at timestamp with time zone default null;

comment on column public.profiles.trial_used is 'Whether the user has already started a free trial (one-time only)';
comment on column public.profiles.trial_started_at is 'Timestamp when the trial was started, used for countdown banner';
