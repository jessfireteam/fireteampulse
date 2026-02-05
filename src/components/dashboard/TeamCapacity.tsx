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
import { TrendSparkline } from "./TrendSparkline";

function DataCell({ value, highlight = false }: { value: number; highlight?: boolean }) {
  return (
    <TableCell 
      className={cn(
        "text-center font-mono text-sm",
        highlight && value > 0 && "text-warning",
        value === 0 && "text-muted-foreground/50"
      )}
    >
      {value}
    </TableCell>
  );
}

function AvgCell({ value }: { value: number }) {
  return (
    <TableCell className="text-center font-mono text-sm">
      {value.toFixed(1)}
    </TableCell>
  );
}

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
                  <TableHead className="text-muted-foreground font-semibold w-40">Person</TableHead>
                  <TableHead className="text-muted-foreground font-semibold w-48">Task Type</TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold w-20">30d Avg</TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold w-28">Trend</TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold w-20">Due 7d</TableHead>
                  <TableHead className="text-center text-muted-foreground font-semibold w-20">Due 30d</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No team members found
                    </TableCell>
                  </TableRow>
                ) : (
                  teamData.map((person, personIndex) => (
                    <>
                      {/* Person header row */}
                      <TableRow 
                        key={`${person.name}-header`} 
                        className={cn(
                          "border-border/50 bg-muted/30",
                          personIndex > 0 && "border-t-2 border-t-border"
                        )}
                      >
                        <TableCell className="font-semibold text-foreground" colSpan={6}>
                          {person.name}
                        </TableCell>
                      </TableRow>
                      
                      {/* Task type rows */}
                      {person.taskTypes.map((row) => (
                        <TableRow 
                          key={`${person.name}-${row.taskType}`} 
                          className="border-border/30 hover:bg-muted/20"
                        >
                          <TableCell></TableCell>
                          <TableCell className="text-sm text-foreground/80">{row.taskType}</TableCell>
                          <AvgCell value={row.avg30Day} />
                          <TableCell className="text-center">
                            <TrendSparkline 
                              data={[row.weekMinus5, row.weekMinus4, row.weekMinus3, row.weekMinus2, row.weekMinus1]} 
                            />
                          </TableCell>
                          <DataCell value={row.due7Days} highlight />
                          <DataCell value={row.due30Days} highlight />
                        </TableRow>
                      ))}
                      
                      {/* Subtotal row */}
                      <TableRow 
                        key={`${person.name}-subtotal`} 
                        className="border-border/50 bg-primary/5"
                      >
                        <TableCell></TableCell>
                        <TableCell className="font-semibold text-sm text-primary">Subtotal</TableCell>
                        <TableCell className="text-center font-mono text-sm font-semibold text-primary">
                          {person.subtotal.avg30Day.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-center">
                          <TrendSparkline 
                            data={[
                              person.subtotal.weekMinus5, 
                              person.subtotal.weekMinus4, 
                              person.subtotal.weekMinus3, 
                              person.subtotal.weekMinus2, 
                              person.subtotal.weekMinus1
                            ]} 
                          />
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm font-semibold text-warning">
                          {person.subtotal.due7Days}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm font-semibold text-warning">
                          {person.subtotal.due30Days}
                        </TableCell>
                      </TableRow>
                    </>
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
