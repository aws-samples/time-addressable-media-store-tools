import { create } from "zustand";

const useOmakaseStore = create((set) => ({
  omakaseModalVisible: false,
  setOmakaseModalVisible: (isVisible) =>
    set({ omakaseModalVisible: isVisible }),
}));

export default useOmakaseStore;
