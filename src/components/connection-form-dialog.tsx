import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CloudUpload,
  FileCheck,
  X,
  ChevronDown,
  RefreshCw,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  connectionsApi,
  type Connection,
  type ConnectionOptions,
  type ConnectionSchema,
} from "@/lib/connections";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ConnectionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection?: Connection;
}

type SourceType = "database" | "sqlite" | "csv" | "excel" | "sas7bdat";

const SOURCE_OPTIONS: { value: SourceType; label: string; hint: string }[] = [
  {
    value: "database",
    label: "Database connection string",
    hint: "PostgreSQL, MySQL, MS SQL, Snowflake",
  },
  { value: "sqlite", label: "SQLite file", hint: ".sqlite / .db" },
  {
    value: "csv",
    label: "CSV file",
    hint: ".csv — converted to a SQLite table",
  },
  {
    value: "excel",
    label: "Excel file",
    hint: ".xlsx — each sheet becomes a table",
  },
  {
    value: "sas7bdat",
    label: "SAS file",
    hint: ".sas7bdat — converted to SQLite",
  },
];

const FILE_TYPE_HINTS: Record<Exclude<SourceType, "database">, string> = {
  sqlite: ".sqlite,.db",
  csv: ".csv",
  excel: ".xlsx,.xls",
  sas7bdat: ".sas7bdat",
};

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

export function ConnectionFormDialog({
  open,
  onOpenChange,
  connection,
}: ConnectionFormDialogProps) {
  const isEdit = !!connection;
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [dsn, setDsn] = useState("");
  const [originalDsn, setOriginalDsn] = useState("");
  const [options, setOptions] = useState<ConnectionOptions | undefined>();
  const [sourceType, setSourceType] = useState<SourceType>("database");
  const [file, setFile] = useState<File | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setName(connection?.name ?? "");
      setDsn(connection?.dsn ?? "");
      setOriginalDsn(connection?.dsn ?? "");
      setOptions(connection?.options);
      setSourceType("database");
      setFile(undefined);
      setError(undefined);
    }
  }, [open, connection]);

  const createDsnMut = useMutation({
    mutationFn: () => connectionsApi.create({ name, dsn }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connections"] });
      onOpenChange(false);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? err.message
          : ((err as Error)?.message ?? "Failed to create connection"),
      );
    },
  });

  const createFileMut = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("No file selected");
      if (sourceType === "database") throw new Error("Wrong source type");
      return connectionsApi.createFromFile({ file, name, type: sourceType });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connections"] });
      onOpenChange(false);
    },
    onError: (err) => {
      setError((err as Error)?.message ?? "Failed to upload file");
    },
  });

  const updateMut = useMutation({
    mutationFn: () => {
      // If the DSN changed, the backend re-introspects and ignores options anyway
      // (its update_connection branches on `elif`). Send only what changed.
      const dsnChanged = dsn !== originalDsn;
      return connectionsApi.update(connection!.id, {
        name,
        ...(dsnChanged ? { dsn } : {}),
        ...(!dsnChanged && options ? { options } : {}),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connections"] });
      onOpenChange(false);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError ? err.message : "Failed to update connection",
      );
    },
  });

  const refreshMut = useMutation({
    mutationFn: () => connectionsApi.refresh(connection!.id),
    onSuccess: (refreshed) => {
      setOptions(refreshed.options);
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (err) => {
      setError(
        err instanceof ApiError ? err.message : "Failed to refresh schema",
      );
    },
  });

  const submitting =
    createDsnMut.isPending || createFileMut.isPending || updateMut.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (isEdit) {
      updateMut.mutate();
      return;
    }

    if (sourceType === "database") {
      if (!dsn.trim()) {
        setError("DSN is required");
        return;
      }
      createDsnMut.mutate();
    } else {
      if (!file) {
        setError("Please select a file");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError("File exceeds 500 MB limit");
        return;
      }
      createFileMut.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit connection" : "New database connection"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="conn-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="conn-name"
              placeholder="My Production DB"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {isEdit ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor="conn-dsn" className="text-sm font-medium">
                  DSN
                </label>
                <Input
                  id="conn-dsn"
                  placeholder="postgresql://user:password@host:5432/db"
                  value={dsn}
                  onChange={(e) => setDsn(e.target.value)}
                />
                {dsn !== originalDsn && (
                  <p className="text-xs text-amber-600">
                    Changing the DSN re-introspects the schema; your table
                    preferences will be re-merged.
                  </p>
                )}
              </div>

              {/* Schema options — only meaningful when DSN is unchanged */}
              {dsn === originalDsn &&
                options?.schemas &&
                options.schemas.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">
                        Schema options
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => refreshMut.mutate()}
                        disabled={refreshMut.isPending}
                        title="Refresh schema from database"
                      >
                        <RefreshCw
                          className={cn(
                            "size-4",
                            refreshMut.isPending && "animate-spin",
                          )}
                        />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Choose which schemas and tables the agent can see.
                      Disabled tables are hidden from the LLM.
                    </p>
                    <SchemaOptionsEditor
                      options={options}
                      onChange={setOptions}
                    />
                  </div>
                )}
            </>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium mb-1">
                  Source type
                </legend>
                <div className="space-y-1.5">
                  {SOURCE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        "flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer transition-colors",
                        sourceType === opt.value
                          ? "border-foreground bg-sidebar-accent"
                          : "hover:bg-sidebar-accent",
                      )}
                    >
                      <input
                        type="radio"
                        name="source-type"
                        value={opt.value}
                        checked={sourceType === opt.value}
                        onChange={() => {
                          setSourceType(opt.value);
                          setError(undefined);
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {opt.hint}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>

              {sourceType === "database" ? (
                <div className="space-y-1.5">
                  <label htmlFor="conn-dsn" className="text-sm font-medium">
                    DSN
                  </label>
                  <Input
                    id="conn-dsn"
                    placeholder="postgresql://user:password@host:5432/db"
                    value={dsn}
                    onChange={(e) => setDsn(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Examples: <code>postgresql://...</code>,{" "}
                    <code>mysql://...</code>,{" "}
                    <code>sqlite:///path/to/file.db</code>,{" "}
                    <code>mssql+pyodbc://...</code>
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {SOURCE_OPTIONS.find((o) => o.value === sourceType)?.label}
                  </label>
                  <FileDropzone
                    file={file}
                    onFile={setFile}
                    accept={FILE_TYPE_HINTS[sourceType]}
                  />
                </div>
              )}
            </>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? isEdit
                  ? "Saving…"
                  : sourceType === "database"
                    ? "Connecting…"
                    : "Uploading…"
                : isEdit
                  ? "Save"
                  : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Schema options editor ─────────────────────────────────────────────
function SchemaOptionsEditor({
  options,
  onChange,
}: {
  options: ConnectionOptions;
  onChange: (next: ConnectionOptions) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleSchema = (schemaIdx: number, enabled: boolean) => {
    onChange({
      schemas: options.schemas!.map((schema, i) =>
        i === schemaIdx
          ? {
              ...schema,
              enabled,
              // Cascade to all tables when the user toggles the schema.
              tables: schema.tables.map((t) => ({ ...t, enabled })),
            }
          : schema,
      ),
    });
  };

  const toggleTable = (
    schemaIdx: number,
    tableIdx: number,
    enabled: boolean,
  ) => {
    onChange({
      schemas: options.schemas!.map((schema, i) =>
        i === schemaIdx
          ? {
              ...schema,
              tables: schema.tables.map((t, j) =>
                j === tableIdx ? { ...t, enabled } : t,
              ),
            }
          : schema,
      ),
    });
  };

  const expandAll = () => {
    setExpanded(
      Object.fromEntries((options.schemas ?? []).map((s) => [s.name, true])),
    );
  };
  const collapseAll = () => {
    setExpanded({});
  };

  return (
    <div className="space-y-2">
      {/* <div className='flex gap-2 text-xs'>
				<button
					type='button'
					onClick={expandAll}
					className='text-muted-foreground hover:text-foreground underline'
				>
					Expand all
				</button>
				<span className='text-muted-foreground'>·</span>
				<button
					type='button'
					onClick={collapseAll}
					className='text-muted-foreground hover:text-foreground underline'
				>
					Collapse all
				</button>
			</div> */}

      <div className="rounded-lg border border-border divide-y divide-border">
        {(options.schemas ?? []).map((schema, schemaIdx) => (
          <SchemaRow
            key={schema.name}
            schema={schema}
            isExpanded={!!expanded[schema.name]}
            onToggleExpand={() =>
              setExpanded((prev) => ({
                ...prev,
                [schema.name]: !prev[schema.name],
              }))
            }
            onToggleSchema={(enabled) => toggleSchema(schemaIdx, enabled)}
            onToggleTable={(tableIdx, enabled) =>
              toggleTable(schemaIdx, tableIdx, enabled)
            }
          />
        ))}
      </div>
    </div>
  );
}

function SchemaRow({
  schema,
  isExpanded,
  onToggleExpand,
  onToggleSchema,
  onToggleTable,
}: {
  schema: ConnectionSchema;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleSchema: (enabled: boolean) => void;
  onToggleTable: (tableIdx: number, enabled: boolean) => void;
}) {
  const enabledCount = schema.tables.filter((t) => t.enabled).length;

  if (schema.tables.length === 0) return null;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 p-3">
        <Switch checked={schema.enabled} onCheckedChange={onToggleSchema} />
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 flex items-center gap-2 min-w-0 text-left"
        >
          <span
            className={cn(
              "text-sm font-medium truncate",
              !schema.enabled && "text-muted-foreground",
            )}
          >
            {schema.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {enabledCount}/{schema.tables.length}
          </span>
          <ChevronDown
            className={cn(
              "size-4 ml-auto shrink-0 text-muted-foreground transition-transform",
              isExpanded && "rotate-180",
            )}
          />
        </button>
      </div>

      {isExpanded && (
        <div className="border-t border-border bg-sidebar-accent/30 max-h-64 overflow-y-auto">
          {schema.tables.map((table, tableIdx) => (
            <div
              key={table.name}
              className="flex items-center gap-3 px-3 py-1.5 pl-12 hover:bg-sidebar-accent"
            >
              <Switch
                checked={table.enabled && schema.enabled}
                disabled={!schema.enabled}
                onCheckedChange={(checked) => onToggleTable(tableIdx, checked)}
              />
              <span
                className={cn(
                  "text-sm truncate",
                  (!schema.enabled || !table.enabled) &&
                    "text-muted-foreground",
                )}
              >
                {table.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── File dropzone ─────────────────────────────────────────────────────
function FileDropzone({
  file,
  onFile,
  accept,
}: {
  file: File | undefined;
  onFile: (file: File | undefined) => void;
  accept: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleClick = () => inputRef.current?.click();

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  };

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border bg-sidebar-accent p-3">
        <FileCheck className="size-5 shrink-0 text-green-600" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{file.name}</div>
          <div className="text-xs text-muted-foreground">
            {(file.size / 1024 / 1024).toFixed(2)} MB
          </div>
        </div>
        <button
          type="button"
          onClick={() => onFile(undefined)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Remove file"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 cursor-pointer transition-colors",
        dragOver
          ? "border-foreground bg-sidebar-accent"
          : "border-border hover:border-foreground hover:bg-sidebar-accent/50",
      )}
    >
      <CloudUpload className="size-8 text-muted-foreground" />
      <div className="text-sm font-medium">
        <span className="text-foreground underline">Click to upload</span>{" "}
        <span className="text-muted-foreground">or drag and drop</span>
      </div>
      <div className="text-xs text-muted-foreground">{accept} · max 500 MB</div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}
