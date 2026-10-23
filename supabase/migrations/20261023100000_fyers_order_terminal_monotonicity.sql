-- Defense in depth for databases where the original order-state function
-- migration has already been applied. The reducer remains authoritative, but
-- this trigger prevents accidental terminal-state regression at the table edge.
create or replace function public.enforce_broker_order_terminal_monotonicity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'FILLED' and new.status <> 'FILLED' then
    new.status := 'FILLED';
    new.payload := jsonb_set(coalesce(new.payload, '{}'::jsonb), '{status}', to_jsonb('FILLED'::text), true);
    new.filled_quantity := greatest(coalesce(new.filled_quantity, 0), coalesce(old.filled_quantity, 0));
  elsif old.status = 'CANCELLED' and new.status = 'FILLED' then
    if new.quantity is null or new.quantity <= 0
       or coalesce(new.filled_quantity, 0) < new.quantity then
      new.status := 'CANCELLED';
      new.payload := jsonb_set(coalesce(new.payload, '{}'::jsonb), '{status}', to_jsonb('CANCELLED'::text), true);
    end if;
  elsif old.status in ('REJECTED', 'EXPIRED') and new.status <> old.status then
    new.status := old.status;
    new.payload := jsonb_set(coalesce(new.payload, '{}'::jsonb), '{status}', to_jsonb(old.status), true);
  end if;
  return new;
end;
$$;

drop trigger if exists broker_order_terminal_monotonicity on public.broker_order_states;
create trigger broker_order_terminal_monotonicity
before update on public.broker_order_states
for each row execute function public.enforce_broker_order_terminal_monotonicity();

revoke all on function public.enforce_broker_order_terminal_monotonicity() from public, anon, authenticated;
