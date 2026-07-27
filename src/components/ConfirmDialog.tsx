import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";

interface ConfirmOptions {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  variant?: "destructive" | "primary";
}

interface ConfirmContextValue {
  showConfirm: (options: ConfirmOptions) => void;
  hideConfirm: () => void;
}

const ConfirmContext = createContext<ConfirmContextValue>({
  showConfirm: () => {},
  hideConfirm: () => {},
});

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);

  const showConfirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    setOpen(true);
  }, []);

  const hideConfirm = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <ConfirmContext.Provider value={{ showConfirm, hideConfirm }}>
      {children}
      {options && (
        <AlertDialog
          isOpen={open}
          onOpenChange={setOpen}
          title={options.title}
          description={options.description}
          actionLabel={options.actionLabel}
          onAction={() => {
            options.onAction();
            setOpen(false);
          }}
          cancelLabel="Cancel"
          actionVariant={options.variant ?? "destructive"}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
