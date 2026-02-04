import { Flame } from "lucide-react";

export function DashboardHeader() {
  return (
    <header className="mb-8 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
          <Flame className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">FireTeam Dashboard</h1>
          <p className="text-sm text-muted-foreground">Agency performance at a glance</p>
        </div>
      </div>
    </header>
  );
}