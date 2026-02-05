import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

const ALLOWED_DOMAIN = "@fireteam.is";

export const useAuth = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        navigate("/login", { replace: true });
        setLoading(false);
        return;
      }

      if (!session.user.email?.endsWith(ALLOWED_DOMAIN)) {
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
        setLoading(false);
        return;
      }

      setUser(session.user);
      setLoading(false);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        setUser(null);
        navigate("/login", { replace: true });
        return;
      }

      if (!session.user.email?.endsWith(ALLOWED_DOMAIN)) {
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
        return;
      }

      setUser(session.user);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  return { user, loading, signOut };
};
