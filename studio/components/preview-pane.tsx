"use client";

import { FileCode2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { CompileResponse } from "@/lib/schemas";

type PreviewPaneProps = {
  files: CompileResponse["files"] | null;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  loading: boolean;
  error: string | null;
};

export function PreviewPane({
  files,
  selectedPath,
  onSelect,
  loading,
  error,
}: PreviewPaneProps) {
  const selected = files?.find((f) => f.path === selectedPath) ?? files?.[0] ?? null;

  if (loading) {
    return (
      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
        <p className="text-sm">Compiling with real adapter emitter…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col p-4">
        <pre className="bg-destructive/10 text-destructive max-h-full overflow-auto rounded-md border p-4 font-mono text-xs whitespace-pre-wrap">
          {error}
        </pre>
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <FileCode2 className="size-10 opacity-40" />
        <p className="text-sm">Compile to preview emitted files</p>
        <p className="font-mono text-xs opacity-70">Real output from adapters/*/emit.js</p>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(140px,200px)_1fr]">
      <ScrollArea className="border-r">
        <ul className="p-2">
          {files.map((file) => (
            <li key={file.path}>
              <button
                type="button"
                onClick={() => onSelect(file.path)}
                className={cn(
                  "hover:bg-muted w-full rounded px-2 py-1.5 text-left font-mono text-[11px] leading-tight break-all",
                  selected?.path === file.path && "bg-muted font-medium",
                )}
              >
                {file.path}
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <span className="truncate font-mono text-xs">{selected?.path}</span>
          <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">
            {files.length} files
          </Badge>
        </div>
        <ScrollArea className="flex-1">
          <pre className="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {selected?.content ?? ""}
          </pre>
        </ScrollArea>
      </div>
    </div>
  );
}
