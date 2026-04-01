import { create } from "zustand";
import type { FlashbarProps } from "@cloudscape-design/components";

type AlertItem = FlashbarProps.MessageDefinition;

type AlertsStore = {
  alertItems: AlertItem[];
  addAlertItem: (alertItem: AlertItem) => void;
  delAlertItem: (id: string) => void;
  addAlertItems: (alertItems: AlertItem[]) => void;
};

const useAlertsStore = create<AlertsStore>((set) => ({
  alertItems: [],
  addAlertItem: (alertItem) =>
    set((state) => ({
      alertItems: [...state.alertItems, alertItem],
    })),
  delAlertItem: (id) =>
    set((state) => ({
      alertItems: state.alertItems.filter((item) => item.id !== id),
    })),
  addAlertItems: (alertItems) =>
    set((state) => ({
      alertItems: [...state.alertItems, ...alertItems],
    })),
}));

export default useAlertsStore;
