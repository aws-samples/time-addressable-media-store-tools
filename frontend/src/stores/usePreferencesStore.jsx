import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PAGE_SIZE } from "@/constants";

const usePreferencesStore = create(
  persist(
    (set) => ({
      flowsShowHierarchy: true,
      setFlowsShowHierarchy: (hierarchy) =>
        set({ flowsShowHierarchy: hierarchy }),

      sourcesShowHierarchy: true,
      setSourcesShowHierarchy: (hierarchy) =>
        set({ sourcesShowHierarchy: hierarchy }),

      flowsPreferences: {
        pageSize: PAGE_SIZE,
        contentDisplay: [
          { id: "id", visible: true },
          { id: "label", visible: true },
          { id: "description", visible: true },
          { id: "format", visible: true },
          { id: "created_by", visible: false },
          { id: "updated_by", visible: false },
          { id: "created", visible: true },
          { id: "tags", visible: false },
          { id: "flow_collection", visible: false },
          { id: "collected_by", visible: false },
          { id: "source_id", visible: false },
          { id: "metadata_version", visible: false },
          { id: "generation", visible: false },
          { id: "metadata_updated", visible: false },
          { id: "read_only", visible: false },
          { id: "codec", visible: false },
          { id: "container", visible: false },
          { id: "avg_bit_rate", visible: false },
          { id: "max_bit_rate", visible: false },
        ],
      },
      setFlowsPreferences: (preferences) =>
        set({ flowsPreferences: preferences }),

      sourcesPreferences: {
        pageSize: PAGE_SIZE,
        contentDisplay: [
          { id: "id", visible: true },
          { id: "label", visible: true },
          { id: "description", visible: true },
          { id: "format", visible: true },
          { id: "created_by", visible: false },
          { id: "updated_by", visible: false },
          { id: "created", visible: true },
          { id: "updated", visible: false },
          { id: "tags", visible: false },
          { id: "source_collection", visible: false },
          { id: "collected_by", visible: false },
        ],
      },
      setSourcesPreferences: (preferences) =>
        set({ sourcesPreferences: preferences }),

      segmentsPreferences: {
        contentDisplay: [
          { id: "id", visible: true },
          { id: "timerange", visible: true },
          { id: "ts_offset", visible: false },
          { id: "last_duration", visible: false },
          { id: "sample_offset", visible: false },
          { id: "sample_count", visible: false },
          { id: "key_frame_count", visible: false },
          { id: "timerange_start", visible: true },
          { id: "timerange_end", visible: true },
        ],
      },
      setSegmentsPreferences: (preferences) =>
        set({ segmentsPreferences: preferences }),

      ffmpegExportsPreferences: {
        pageSize: PAGE_SIZE,
        contentDisplay: [
          { id: "executionArn", visible: true },
          { id: "timerange", visible: true },
          { id: "flowIds", visible: true },
          { id: "command", visible: false },
          { id: "outputFormat", visible: true },
          { id: "output", visible: true },
          { id: "status", visible: true },
          { id: "startDate", visible: false },
          { id: "stopDate", visible: false },
        ],
      },
      setFfmpegExportsPreferences: (preferences) =>
        set({ ffmpegExportsPreferences: preferences }),

      ffmpegJobsPreferences: {
        pageSize: PAGE_SIZE,
        contentDisplay: [
          { id: "id", visible: true },
          { id: "sourceTimerange", visible: true },
          { id: "command", visible: true },
          { id: "outputFormat", visible: false },
          { id: "outputFlow", visible: true },
          { id: "status", visible: true },
          { id: "startDate", visible: false },
          { id: "stopDate", visible: false },
        ],
      },
      setFfmpegJobsPreferences: (preferences) =>
        set({ ffmpegJobsPreferences: preferences }),
    }),
    {
      name: "tams-ui-preferences",
    }
  )
);

export default usePreferencesStore;
