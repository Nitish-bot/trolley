import type { LogEntry } from "../types/trolley";
import { Label } from "./ui/label";
import { Btn } from "./ui/button";

interface InstructionLogProps {
  log: LogEntry[];
  onClear: () => void;
}

export function InstructionLog({ log, onClear }: InstructionLogProps) {
  return (
    <div className="border-l border-trolley-border bg-trolley-panel flex flex-col overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-trolley-border flex items-center justify-between">
        <Label>Instruction Log</Label>
        {log.length > 0 && (
          <Btn
            onClick={onClear}
            className="bg-transparent border-0 text-trolley-text-dim font-ibm-plex text-[10px] hover:text-trolley-text transition-colors"
            style={{ cursor: "pointer" }}
            small
          >
            CLEAR
          </Btn>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {log.length === 0 ? (
          <div className="px-4 py-5 text-[10px] text-trolley-text-dim tracking-[0.08em] text-center">
            instructions appear here
            <br />
            as you interact
          </div>
        ) : (
          log.map((entry, i) => (
            <div
              key={i}
              className={[
                "px-3.5 py-2 border-b border-trolley-border/15",
                i === 0 ? "animate-fade-up" : "",
              ].join(" ")}
            >
              <div className="flex justify-between mb-0.5">
                <span className="text-[10px] text-trolley-amber font-semibold">
                  → {entry.ix}
                </span>
                <span className="text-[9px] text-trolley-text-dim">
                  {entry.ts}
                </span>
              </div>
              {Object.entries(entry.details).map(([k, v]) => (
                <div key={k} className="text-[9px] pl-2.5 leading-relaxed">
                  <span className="text-trolley-blue">{k}</span>
                  <span className="text-trolley-text-dim">: </span>
                  <span className="text-trolley-text-hi">{String(v)}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
