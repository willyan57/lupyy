-- Crush silencioso não deve gerar linha em `notifications` (evita vazar nome no app + contador).
-- A app também filtra silent_crush / mystery_interest em `filterInboxNotifications`.

CREATE OR REPLACE FUNCTION public.notifications_suppress_silent_interest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.type IN ('silent_crush', 'mystery_interest') THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notifications_suppress_silent_interest() IS
  'BEFORE INSERT: bloqueia notificações de crush silencioso / mistério (não alertar o destinatário).';

DROP TRIGGER IF EXISTS notifications_suppress_silent_interest ON public.notifications;

CREATE TRIGGER notifications_suppress_silent_interest
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notifications_suppress_silent_interest();

-- Opcional: limpar notificações antigas já gravadas (descomente se quiser)
-- DELETE FROM public.notifications WHERE type IN ('silent_crush', 'mystery_interest');
