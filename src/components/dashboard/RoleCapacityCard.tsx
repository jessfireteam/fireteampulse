import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RoleGroup, TaskTypeRow } from "@/hooks/useFiberyData";
import { cn } from "@/lib/utils";
import { TrendSparkline } from "./TrendSparkline";

function OverdueCell({ value }: { value: number }) {
  return (
    <TableCell className={cn(
      "text-center font-mono text-sm font-semibold px-2",
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
    if (ratio >= 1.2) return "text-destructive";
    if (ratio <= 0.8) return "text-emerald-500";
    return "text-muted-foreground";
  };
  
  return (
    <TableCell className={cn("text-center font-mono text-sm font-semibold px-2", getColor())}>
      {due7d}
    </TableCell>
  );
}

function DataCell({ value }: { value: number }) {
  return (
    <TableCell className={cn(
      "text-center font-mono text-sm px-2",
      value === 0 && "text-muted-foreground/50"
    )}>
      {value}
    </TableCell>
  );
}

function PersonRow({ name, row }: { name: string; row: TaskTypeRow }) {
  const avg7d = row.avg30Day / 4.3;
  
  return (
    <TableRow className="border-border/30 hover:bg-muted/20">
      <TableCell className="font-medium text-foreground text-sm py-2 px-3">{name}</TableCell>
      <TableCell className="text-center font-mono text-sm px-2">
        {row.avg30Day.toFixed(0)}
      </TableCell>
      <TableCell className="text-center font-mono text-sm px-2">
        {avg7d.toFixed(1)}
      </TableCell>
      <TableCell className="text-center px-1">
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
  Account: { label: 'Account', taskLabel: 'Approvals' },
  Copywriters: { label: 'Copywriters', taskLabel: 'Brief Work' },
  Design: { label: 'Design', taskLabel: 'Design' },
  Video: { label: 'Video', taskLabel: 'Video Editing' },
  Other: { label: 'Other', taskLabel: 'Various' },
};

interface RoleCapacityCardProps {
  group: RoleGroup;
}

export function RoleCapacityCard({ group }: RoleCapacityCardProps) {
  const roleInfo = ROLE_LABELS[group.role];
  
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
      <CardHeader className="py-3 px-4 bg-primary/10 border-b border-border/30">
        <CardTitle className="text-sm font-bold text-primary flex items-center justify-between">
          <span>{roleInfo.label}</span>
          <span className="text-xs font-normal text-muted-foreground">{roleInfo.taskLabel}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-muted-foreground font-semibold text-xs py-2 px-3">Person</TableHead>
              <TableHead className="text-center text-muted-foreground font-semibold text-xs px-2 w-10">30d</TableHead>
              <TableHead className="text-center text-muted-foreground font-semibold text-xs px-2 w-10">7d</TableHead>
              <TableHead className="text-center text-muted-foreground font-semibold text-xs px-1 w-14">Trend</TableHead>
              <TableHead className="text-center text-muted-foreground font-semibold text-xs px-2 w-10">Over</TableHead>
              <TableHead className="text-center text-muted-foreground font-semibold text-xs px-2 w-10">7d</TableHead>
              <TableHead className="text-center text-muted-foreground font-semibold text-xs px-2 w-10">30d</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.people.map((person) => {
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
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
