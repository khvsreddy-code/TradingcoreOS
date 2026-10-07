-- Harden the realtime gateway ownership RPC surface.
-- These SECURITY DEFINER functions are server-to-server only; the browser never
-- calls them directly.
revoke execute on function public.claim_realtime_gateway_owner(text,text,integer) from public, anon, authenticated;
revoke execute on function public.renew_realtime_gateway_owner(text,text,integer) from public, anon, authenticated;
revoke execute on function public.release_realtime_gateway_owner(text,text) from public, anon, authenticated;

grant execute on function public.claim_realtime_gateway_owner(text,text,integer) to service_role;
grant execute on function public.renew_realtime_gateway_owner(text,text,integer) to service_role;
grant execute on function public.release_realtime_gateway_owner(text,text) to service_role;
