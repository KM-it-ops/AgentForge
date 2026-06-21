"use client";

import { Activity, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DoctorResponse } from "@/lib/schemas";

type DoctorPanelProps = {
  result: DoctorResponse | null;
  loading: boolean;
  error: string | null;
  onRun: () => void;
};

export function DoctorPanel({ result, loading, error, onRun }: DoctorPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Activity className="text-muted-foreground size-4" />
          <h2 className="text-sm font-medium">Doctor</h2>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onRun}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={loading ? "size-3 animate-spin" : "size-3"} />
          {loading ? "Running…" : "Run doctor"}
        </Button>
      </div>

      <ScrollArea className="flex-1 p-3">
        {error && (
          <p className="text-destructive mb-3 font-mono text-xs whitespace-pre-wrap">{error}</p>
        )}

        {!result && !loading && !error && (
          <p className="text-muted-foreground text-sm">
            Run real AgentForge doctor checks (node, npm, git, spec, emitters).
          </p>
        )}

        {result && (
          <div className="mb-3">
            <Badge variant={result.ok ? "default" : "destructive"}>
              {result.ok ? "All checks passed" : "Issues found"}
            </Badge>
          </div>
        )}

        <ul className="space-y-2">
          {result?.checks.map((check) => (
            <li key={check.name} className="rounded-md border px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={check.pass ? "default" : "destructive"} className="text-[10px]">
                  {check.pass ? "pass" : "fail"}
                </Badge>
                <span className="font-medium">{check.name}</span>
              </div>
              <p className="text-muted-foreground mt-1 font-mono text-xs break-all">
                {check.message}
              </p>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
