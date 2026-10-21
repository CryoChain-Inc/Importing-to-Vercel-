-- Marking a stop collected is final. Removes the undo function if an earlier draft of the previous migration created it.
drop function if exists public.reopen_stop(uuid);
