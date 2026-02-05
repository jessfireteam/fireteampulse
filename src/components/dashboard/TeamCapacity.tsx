import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "./SectionHeader";
import { useTasksData, processTasksForCapacity } from "@/hooks/useFiberyData";
import { Skeleton } from "@/components/ui/skeleton";
import { RoleCapacityCard } from "./RoleCapacityCard";

export function TeamCapacity() {
  const { data, isLoading, error } = useTasksData();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Team Capacity" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Team Capacity" />
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-6">
            <p className="text-destructive">Failed to load tasks data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tasks = data?.findProjectSpecificTasks || [];
  const roleGroups = processTasksForCapacity(tasks, "all");

  return (
    <div className="space-y-6">
      <SectionHeader title="Team Capacity" />

      {roleGroups.length === 0 ? (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">No team members found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roleGroups.map((group) => (
            <RoleCapacityCard key={group.role} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
