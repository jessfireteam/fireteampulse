import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "./SectionHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTasksData, processTasksForCapacity, RoleGroup, TaskTypeRow } from "@/hooks/useFiberyData";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TrendSparkline } from "./TrendSparkline";

function AvgCell({ value }: { value: number }) {
  return (
    <TableCell className="text-center font-mono text-sm">
      {value.toFixed(1)}
    </TableCell>
  );
}

function OverdueCell({ value }: { value: number }) {
  return (
    <TableCell className={cn(
      "text-center font-mono text-sm font-semibold",
      value > 0 ? "text-destructive" : "text-muted-foreground/50"
    )}>
      {value}
    </TableCell>
  );
}

function Due7dCell({ due7d, avg7d }: { due7d: number; avg7d: number }) {
  const getColor = () => {
    if (avg7d === 0) return "text-muted-foreground";
    const ratio = due7d / avg7d;
    if (ratio >= 1.2) return "text-destructive"; // 20%+ higher = overloaded
    if (ratio <= 0.8) return "text-emerald-500"; // 20%+ lower = capacity
    return "text-muted-foreground"; // normal
  };
  
  return (
    <TableCell className={cn("text-center font-mono text-sm font-semibold", getColor())}>
      {due7d}
    </TableCell>
  );
}

function DataCell({ value }: { value: number }) {
  return (
    <TableCell 
      className={cn(
        "text-center font-mono text-sm",
        value === 0 && "text-muted-foreground/50"
      )}
    >
      {value}
    </TableCell>
  );
}

function PersonRow({ name, row }: { name: string; row: TaskTypeRow }) {
  const avg7d = row.avg30Day / 4.3;
  
  return (
    <TableRow className="border-border/30 hover:bg-muted/20">
      <TableCell className="font-medium text-foreground">{name}</TableCell>
      <AvgCell value={row.avg30Day} />
      <TableCell className="text-center font-mono text-sm">
        {avg7d.toFixed(1)}
      </TableCell>
      <TableCell className="text-center">
        <TrendSparkline 
          data={[row.weekMinus5, row.weekMinus4, row.weekMinus3, row.weekMinus2, row.weekMinus1]} 
        />
      </TableCell>
      <OverdueCell value={row.overdue} />
      <Due7dCell due7d={row.due7Days} avg7d={avg7d} />
      <DataCell value={row.due30Days} />
    </TableRow>
  );
}

const ROLE_LABELS: Record<RoleGroup['role'], { label: string; taskLabel: string }> = {
  Account: { label: 'Account', taskLabel: 'Review' },
  Copywriters: { label: 'Copywriters', taskLabel: 'Brief Work' },
  Design: { label: 'Design', taskLabel: 'Design' },
  Video: { label: 'Video', taskLabel: 'Video Editing' },
};

export function TeamCapacity() {
  const [roleFilter, setRoleFilter] = useState("all");
  const { data, isLoading, error } = useTasksData();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Team Capacity" />
        <Skeleton className="h-96" />
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
  const roleGroups = processTasksForCapacity(tasks, roleFilter);

  // Filter role groups based on tab selection
  const filteredGroups = roleFilter === "all" 
    ? roleGroups 
    : roleGroups.filter(g => {
        if (roleFilter === "video") return g.role === "Video";
        if (roleFilter === "design") return g.role === "Design";
        return true;
      });

  return (
    <div className="space-y-6">
      <SectionHeader title="Team Capacity">
        <Tabs value={roleFilter} onValueChange={setRoleFilter}>
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              All
            </TabsTrigger>
            <TabsTrigger value="video" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Video
            </TabsTrigger>
            <TabsTrigger value="design" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Design
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </SectionHeader>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-semibold w-48">Person</TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold w-20">30d</TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold w-20">7d Avg</TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold w-28">Trend</TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold w-20">Overdue</TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold w-20">Due 7d</TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold w-20">Due 30d</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No team members found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGroups.map((group, groupIndex) => {
                    const roleInfo = ROLE_LABELS[group.role];
                    
                    return (
                      <>
                        {/* Role header row */}
                        <TableRow 
                          key={`${group.role}-header`} 
                          className={cn(
                            "border-border/50 bg-primary/10",
                            groupIndex > 0 && "border-t-2 border-t-border"
                          )}
                        >
                          <TableCell className="font-bold text-primary text-base" colSpan={1}>
                            {roleInfo.label}
                          </TableCell>
                          <TableCell colSpan={6} className="text-sm text-muted-foreground">
                            Primary: {roleInfo.taskLabel}
                          </TableCell>
                        </TableRow>
                        
                        {/* Person rows - show primary task type only */}
                        {group.people.map((person) => {
                          // Find the primary task type row
                          const primaryRow = person.taskTypes.find(
                            t => t.taskType === person.primaryTaskType
                          ) || person.subtotal;
                          
                          return (
                            <PersonRow 
                              key={person.name}
                              name={person.name}
                              row={primaryRow}
                            />
                          );
                        })}
                      </>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
