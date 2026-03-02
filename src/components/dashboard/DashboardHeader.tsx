import { Flame } from "lucide-react";
import { NavLink } from "@/components/NavLink";

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
      <nav className="flex items-center gap-1 rounded-lg bg-muted/30 p-1">
        <NavLink
          to="/"
          end
          className="px-3 py-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground"
          activeClassName="bg-primary/20 text-primary font-medium"
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/team-capacity"
          className="px-3 py-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground"
          activeClassName="bg-primary/20 text-primary font-medium"
        >
          Team Capacity
        </NavLink>
        <NavLink
          to="/creator-costs"
          className="px-3 py-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground"
          activeClassName="bg-primary/20 text-primary font-medium"
        >
          Creator Costs
        </NavLink>
        <NavLink
          to="/pipeline"
          className="px-3 py-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground"
          activeClassName="bg-primary/20 text-primary font-medium"
        >
          Pipeline
        </NavLink>
      </nav>
    </header>
  );
}