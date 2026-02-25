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

function OverdueCell({ inherited, true: trueOD }: { inherited: number; true: number }) {
  const total = inherited + trueOD;
  return (
    <TableCell className={cn(
      "text-center font-mono text-base font-semibold px-2",
      total > 0 ? "text-destructive" : "text-muted-foreground/50"
    )}>
      {total === 0 ? "0" : (
        <span title={`${trueOD} true + ${inherited} inherited`}>
          {trueOD > 0 && <span>{trueOD}</span>}
          {trueOD > 0 && inherited > 0 && <span className="text-muted-foreground/60">+</span>}
          {inherited > 0 && <span className="text-amber-500">{inherited}</span>}
        </span>
      )}
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
    <TableCell className={cn("text-center font-mono text-base font-semibold px-2", getColor())}>
      {due7d}
    </TableCell>
  );
}

function DataCell({ value }: { value: number }) {
  return (
    <TableCell className={cn(
      "text-center font-mono text-base px-2",
      value === 0 && "text-muted-foreground/50"
    )}>
      {value}
    </TableCell>
  );
}

function PersonRow({ name, row, taskLabel }: { name: string; row: TaskTypeRow; taskLabel?: string }) {
  const avg7d = row.avg30Day / 4.3;
  
  return (
    <TableRow className="border-border/30 hover:bg-muted/20">
      <TableCell className="py-2 px-3">
        <div className="font-medium text-foreground text-sm">{name}</div>
        {taskLabel && <div className="text-xs text-muted-foreground">{taskLabel}</div>}
      </TableCell>
      <TableCell className="text-center font-mono text-base px-2">
        {row.avg30Day.toFixed(0)}
      </TableCell>
      <TableCell className="text-center font-mono text-base px-2">
        {avg7d.toFixed(1)}
      </TableCell>
      <TableCell className="text-center px-1">
        <TrendSparkline data={row.weekCounts} />
      </TableCell>
      <OverdueCell inherited={row.inheritedOverdue} true={row.trueOverdue} />
      <Due7dCell due7d={row.due7Days} avg7d={avg7d} />
      <DataCell value={row.due30Days} />
    </TableRow>
  );
}

const ROLE_LABELS: Record<RoleGroup['role'], { label: string; taskLabel: string }> = {
  Account: { label: 'Account', taskLabel: 'Briefs Sent' },
  'Creative Review': { label: 'Creative Review', taskLabel: 'Creative Review' },
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
    <Card className="border-border/50 bg-card">
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
              <TableHead className="text-center text-muted-foreground font-semibold text-xs px-2 w-12">7d Avg</TableHead>
              <TableHead className="text-center text-muted-foreground font-semibold text-xs px-1 w-20">Trend</TableHead>
              <TableHead className="text-center text-muted-foreground font-semibold text-xs px-2 w-14">
                <div>Overdue</div>
                <div className="flex items-center justify-center gap-1.5 mt-0.5 font-normal text-[10px]">
                  <span className="flex items-center gap-0.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive" />true</span>
                  <span className="flex items-center gap-0.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />inherited</span>
                </div>
              </TableHead>
              <TableHead className="text-center text-muted-foreground font-semibold text-xs px-2 w-14">Next 7d</TableHead>
              <TableHead className="text-center text-muted-foreground font-semibold text-xs px-2 w-14">Next 30d</TableHead>
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
                  taskLabel={group.role === 'Other' ? person.primaryTaskType : undefined}
                />
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
