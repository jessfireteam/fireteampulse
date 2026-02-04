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
import { useTasksData, processTasksForCapacity } from "@/hooks/useFiberyData";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
  const teamData = processTasksForCapacity(tasks, roleFilter);

  const getCellStyle = (value: number, type: "assigned") => {
    if (type === "assigned") {
      if (value > 10) return "bg-destructive/20 text-destructive";
      if (value > 5) return "bg-warning/20 text-warning";
    }
    return "";
  };

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
                  <TableHead className="text-muted-foreground font-semibold">Person</TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold">
                    Done (7 days)
                  </TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold">
                    Done (30 days)
                  </TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold">
                    Due (7 days)
                  </TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold">
                    Due (30 days)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No team members found
                    </TableCell>
                  </TableRow>
                ) : (
                  teamData.map((person) => (
                    <TableRow key={person.name} className="border-border/50">
                      <TableCell className="font-medium">{person.name}</TableCell>
                      <TableCell className="text-center font-mono">
                        {person.completedLastWeek}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {person.completedLastMonth}
                      </TableCell>
                      <TableCell className={cn("text-center font-mono", getCellStyle(person.assignedThisWeek, "assigned"))}>
                        {person.assignedThisWeek}
                      </TableCell>
                      <TableCell className={cn("text-center font-mono", getCellStyle(person.assignedThisMonth, "assigned"))}>
                        {person.assignedThisMonth}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}