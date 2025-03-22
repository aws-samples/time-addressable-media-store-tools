import { create } from "zustand";

const useStore = create((set) => ({
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

export default useStore;
