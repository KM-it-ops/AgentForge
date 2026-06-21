"use client";

import CodeMirror from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";
import { useEffect, useMemo, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SPEC_FILE_NAMES, SPEC_TAB_LABELS } from "@/lib/schemas";

export type SpecFilesState = Record<string, string>;

type SpecEditorProps = {
  specFiles: SpecFilesState;
  onChange: (name: string, value: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
};

function tabLabel(name: string): string {
  if (name in SPEC_TAB_LABELS) {
    return SPEC_TAB_LABELS[name as keyof typeof SPEC_TAB_LABELS];
  }
  if (name === "mcp.yaml") return "MCP";
  return name;
}

export function SpecEditor({ specFiles, onChange, activeTab, onTabChange }: SpecEditorProps) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const extensions = useMemo(() => [yaml()], []);

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col">
      <TabsList className="mx-3 mt-2 h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
        {SPEC_FILE_NAMES.map((file) => {
          const optional = file === "mcp.yaml" && !specFiles[file];
          return (
            <TabsTrigger
              key={file}
              value={file}
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs"
            >
              {tabLabel(file)}
              {optional ? " ·" : ""}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {SPEC_FILE_NAMES.map((file) => (
        <TabsContent key={file} value={file} className="mt-0 min-h-0 flex-1 px-3 pb-3">
          <div className="overflow-hidden rounded-md border">
            <CodeMirror
              value={specFiles[file] ?? ""}
              height="320px"
              extensions={extensions}
              theme={dark ? oneDark : "light"}
              onChange={(value) => onChange(file, value)}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
              }}
              className="text-sm [&_.cm-editor]:min-h-[320px] [&_.cm-scroller]:font-mono"
            />
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function emptySpecShell(): SpecFilesState {
  return Object.fromEntries(SPEC_FILE_NAMES.map((f) => [f, ""]));
}
