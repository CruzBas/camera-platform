import { useEffect, useState } from "react";
import {
  defaultAssumptions,
  type Assumptions,
} from "./operator-settings";

const KEY = "operator-dashboard.assumptions";

export function useAssumptions() {
  const [assumptions, setAssumptions] = useState<Assumptions>(() => {
    if (typeof window === "undefined") return defaultAssumptions;
    try {
      const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
      return saved ? { ...defaultAssumptions, ...saved } : defaultAssumptions;
    } catch {
      return defaultAssumptions;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(assumptions));
    } catch {
      // Storage unavailable
    }
  }, [assumptions]);

  const isDefault =
    assumptions.costPerBusHour === defaultAssumptions.costPerBusHour &&
    assumptions.seniorShare === defaultAssumptions.seniorShare;

  return {
    assumptions,
    setAssumptions,
    reset: () => setAssumptions(defaultAssumptions),
    isDefault,
  };
}
