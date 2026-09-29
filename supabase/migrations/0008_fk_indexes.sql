-- Covering indexes for foreign keys (account deletion cascades, ownership lookups).
create index if not exists cells_user on public.cells (user_id);
create index if not exists organizations_owner on public.organizations (owner_id);
