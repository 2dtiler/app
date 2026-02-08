import { useEffect, useState } from "react";
import { initEditorStore } from "@/lib/store";
import { useAutoSave } from "@/hooks/use-auto-save";

function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initEditorStore().then(() => setReady(true));
  }, []);

  useAutoSave();

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-primary text-sm tracking-widest uppercase animate-pulse">
          Initializing…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar placeholder */}
      <header className="flex h-8 shrink-0 items-center border-b border-border bg-card px-2">
        <span className="text-xs font-medium text-primary tracking-wider">
          2D TILER
        </span>
      </header>

      {/* Main editor area placeholder */}
      <main className="flex flex-1 min-h-0">
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Editor workspace — Phase 2 will build the UI here
        </div>
      </main>
    </div>
  );
}

export default App;
