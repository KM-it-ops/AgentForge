"use client";

import { Hammer, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { DoctorPanel } from "@/components/doctor-panel";
import { PreviewPane } from "@/components/preview-pane";
import { emptySpecShell, SpecEditor } from "@/components/spec-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ADAPTERS,
  type CompileResponse,
  type DoctorResponse,
  type StudioAdapter,
} from "@/lib/schemas";

type LoadState = "loading" | "ready" | "error";

export function StudioApp() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [specFiles, setSpecFiles] = useState(emptySpecShell());
  const [repoSpec, setRepoSpec] = useState(emptySpecShell());
  const [activeTab, setActiveTab] = useState("identity.yaml");
  const [adapter, setAdapter] = useState<StudioAdapter>("cursor");

  const [compileLoading, setCompileLoading] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compileResult, setCompileResult] = useState<CompileResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const [doctorLoading, setDoctorLoading] = useState(false);
  const [doctorError, setDoctorError] = useState<string | null>(null);
  const [doctorResult, setDoctorResult] = useState<DoctorResponse | null>(null);

  const fetchSpec = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch("/api/spec");
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { specFiles: Record<string, string> };
      const merged = { ...emptySpecShell(), ...body.specFiles };
      setSpecFiles(merged);
      setRepoSpec(merged);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load spec");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void fetchSpec();
  }, [fetchSpec]);

  const handleSpecChange = (name: string, value: string) => {
    setSpecFiles((prev) => ({ ...prev, [name]: value }));
  };

  const handleReset = () => {
    setSpecFiles({ ...repoSpec });
    setCompileResult(null);
    setCompileError(null);
    setSelectedFile(null);
  };

  const buildCompilePayload = () => {
    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(specFiles)) {
      if (key === "mcp.yaml" && !value.trim()) continue;
      if (value.trim()) payload[key] = value;
    }
    return payload;
  };

  const handleCompile = async () => {
    setCompileLoading(true);
    setCompileError(null);
    setCompileResult(null);
    setSelectedFile(null);

    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adapter, specFiles: buildCompilePayload() }),
      });
      const body = (await res.json()) as CompileResponse | { error?: string };
      if (!res.ok) {
        throw new Error("error" in body && body.error ? body.error : `HTTP ${res.status}`);
      }
      const result = body as CompileResponse;
      setCompileResult(result);
      if (result.files[0]) setSelectedFile(result.files[0].path);
    } catch (err) {
      setCompileError(err instanceof Error ? err.message : "Compile failed");
    } finally {
      setCompileLoading(false);
    }
  };

  const handleDoctor = async () => {
    setDoctorLoading(true);
    setDoctorError(null);
    try {
      const res = await fetch("/api/doctor", { method: "POST" });
      const body = (await res.json()) as DoctorResponse | { error?: string };
      if (!res.ok) {
        throw new Error("error" in body && body.error ? body.error : `HTTP ${res.status}`);
      }
      setDoctorResult(body as DoctorResponse);
    } catch (err) {
      setDoctorError(err instanceof Error ? err.message : "Doctor failed");
    } finally {
      setDoctorLoading(false);
    }
  };

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="border-b bg-gradient-to-r from-card via-card to-muted/30">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-lg shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">AgentForge Studio</h1>
              <p className="text-muted-foreground text-sm">
                One spec · many adapters · real compile preview
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={adapter} onValueChange={(v) => setAdapter(v as StudioAdapter)}>
              <SelectTrigger className="w-[180px]" aria-label="Adapter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADAPTERS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={() => void handleCompile()}
              disabled={compileLoading || loadState !== "ready"}
              className="gap-2"
            >
              <Hammer className="size-4" />
              {compileLoading ? "Compiling…" : "Compile"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={loadState !== "ready"}
              className="gap-2"
            >
              <RotateCcw className="size-4" />
              Reset spec
            </Button>
          </div>
        </div>
      </header>

      {loadState === "error" && loadError && (
        <Alert variant="destructive" className="mx-4 mt-4 max-w-[1680px] lg:mx-auto">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Could not load repo spec: {loadError}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void fetchSpec()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <main className="mx-auto grid w-full max-w-[1680px] flex-1 gap-4 p-4 lg:grid-cols-2 xl:grid-cols-[1fr_1.15fr_300px]">
        <Card className="flex min-h-[480px] flex-col overflow-hidden py-0 shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-medium">Spec YAML</h2>
            <Badge variant="secondary">
              {loadState === "loading" ? "Loading…" : "CodeMirror 6"}
            </Badge>
          </div>
          {loadState === "loading" ? (
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
              Loading spec from repo…
            </div>
          ) : (
            <SpecEditor
              specFiles={specFiles}
              onChange={handleSpecChange}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          )}
        </Card>

        <Card className="flex min-h-[480px] flex-col overflow-hidden py-0 shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-medium">Preview</h2>
            {compileResult && (
              <Badge variant="outline" className="font-mono text-[10px]">
                {compileResult.meta.durationMs}ms · {compileResult.meta.fileCount} files
              </Badge>
            )}
          </div>
          <PreviewPane
            files={compileResult?.files ?? null}
            selectedPath={selectedFile}
            onSelect={setSelectedFile}
            loading={compileLoading}
            error={compileError}
          />
        </Card>

        <Card className="flex min-h-[320px] flex-col overflow-hidden py-0 shadow-sm lg:col-span-2 xl:col-span-1 xl:min-h-[480px]">
          <DoctorPanel
            result={doctorResult}
            loading={doctorLoading}
            error={doctorError}
            onRun={() => void handleDoctor()}
          />
        </Card>
      </main>

      <footer className="text-muted-foreground border-t px-4 py-3 text-center text-xs">
        Stateless session · writes only to temp dirs · never calls{" "}
        <code className="font-mono">agentforge init</code>
      </footer>
    </div>
  );
}
