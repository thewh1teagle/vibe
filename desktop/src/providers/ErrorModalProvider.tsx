import { ReactNode, createContext, useState } from "react";

export interface ErrorModalState {
  open: boolean;
  log?: string;
}
interface ErrorModalContext {
  state?: ErrorModalState;
  setState?: (state: ErrorModalState) => void;
}

export const ErrorModalContext = createContext<ErrorModalContext>({} as ErrorModalContext);

export function ErrorModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ErrorModalState>();
  return <ErrorModalContext.Provider value={{ setState, state }}>{children}</ErrorModalContext.Provider>;
}
