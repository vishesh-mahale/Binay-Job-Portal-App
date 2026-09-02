-- Migration: 04_password_change_trigger.sql
-- Purpose: Security-hardened fail-closed trigger to auto-update last_password_changed_at when auth.users.encrypted_password changes.

CREATE OR REPLACE FUNCTION public.handle_auth_user_password_update()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
        UPDATE public.users
        SET last_password_changed_at = NOW(),
            updated_at = NOW()
        WHERE id = NEW.id;

        -- Strict Fail-Closed Enforcement: If public.users row is missing, raise exception to rollback transaction
        IF NOT FOUND THEN
            RAISE EXCEPTION '[handle_auth_user_password_update] Fail-closed: matching public.users profile row missing for user_id %', NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_password_updated ON auth.users;
CREATE TRIGGER on_auth_user_password_updated
    AFTER UPDATE OF encrypted_password ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_auth_user_password_update();
