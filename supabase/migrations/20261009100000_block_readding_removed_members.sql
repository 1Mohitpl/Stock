-- A removed member must be invited again; they cannot simply be re-approved.
--
-- Removal sets profiles.status = 'rejected'. The members UI used to expose an
-- Approve action for any non-approved row, which flipped 'rejected' back to
-- 'approved' and silently restored access for the same auth account.
--
-- This guard only blocks the UPDATE rejected -> approved. The legitimate
-- re-invite path is unaffected: handle_new_user() INSERTs a brand new profile
-- with status 'approved' when someone accepts a fresh invite.
CREATE OR REPLACE FUNCTION public.block_readding_removed_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'rejected' AND NEW.status = 'approved' THEN
    RAISE EXCEPTION
      'This member was removed and cannot be re-approved. Send a new invite instead.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS profiles_block_readd ON public.profiles;
CREATE TRIGGER profiles_block_readd
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.block_readding_removed_member();
