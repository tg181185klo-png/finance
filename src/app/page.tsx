"use client";

import { useCallback, useEffect, useState } from "react";
import Dashboard from "@/components/Dashboard";
import LoginScreen from "@/components/LoginScreen";

export default function Home() {
  const [auth, setAuth] = useState<"loading" | "guest" | "user">("loading");

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth", { cache: "no-store" });
      setAuth(res.ok ? "user" : "guest");
    } catch {
      setAuth("guest");
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (auth === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-400">
        იტვირთება...
      </div>
    );
  }

  if (auth === "guest") {
    return <LoginScreen onSuccess={() => setAuth("user")} />;
  }

  return (
    <Dashboard
      onLogout={async () => {
        await fetch("/api/auth", { method: "DELETE" });
        setAuth("guest");
      }}
    />
  );
}
