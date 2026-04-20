import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PAGE_SIZE } from "@/constants";
import type { CollectionPreferencesProps } from "@cloudscape-design/components";
import { Mode } from "@cloudscape-design/global-styles";

type Preferences = CollectionPreferencesProps.Preferences;

type PreferencesStore = {
  mode: Mode;
  setMode: (mode: Mode) => void;

  flowsShowHierarchy: boolean;
  setFlowsShowHierarchy: (hierarchy: boolean) => void;

  sourcesShowHierarchy: boolean;
  setSourcesShowHierarchy: (hierarchy: boolean) => void;

  flowsPreferences: Preferences;
  setFlowsPreferences: (preferences: Preferences) => void;

  sourcesPreferences: Preferences;
  setSourcesPreferences: (preferences: Preferences) => void;

  segmentsPreferences: Preferences;
  setSegmentsPreferences: (preferences: Preferences) => void;

  webhooksPreferences: Preferences;
  setWebhooksPreferences: (preferences: Preferences) => void;

  ffmpegExportsPreferences: Preferences;
  setFfmpegExportsPreferences: (preferences: Preferences) => void;

  ffmpegJobsPreferences: Preferences;
  setFfmpegJobsPreferences: (preferences: Preferences) => void;
};

const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      mode: Mode.Dark,
      setMode: (mode) => set({ mode }),

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
          { id: "object_timerange", visible: false },
          { id: "sample_offset", visible: false },
          { id: "sample_count", visible: false },
          { id: "key_frame_count", visible: false },
          { id: "timerange_start", visible: true },
          { id: "timerange_end", visible: true },
        ],
      },
      setSegmentsPreferences: (preferences) =>
        set({ segmentsPreferences: preferences }),

      webhooksPreferences: {
        pageSize: PAGE_SIZE,
        contentDisplay: [
          { id: "id", visible: true },
          { id: "url", visible: true },
          { id: "api_key_name", visible: true },
          { id: "status", visible: true },
          { id: "events", visible: true },
          { id: "flow_ids", visible: false },
          { id: "source_ids", visible: false },
          { id: "flow_collected_by_ids", visible: false },
          { id: "source_collected_by_ids", visible: false },
          { id: "accept_get_urls", visible: false },
          { id: "accept_storage_ids", visible: false },
          { id: "presigned", visible: false },
          { id: "verbose_storage", visible: false },
        ],
      },
      setWebhooksPreferences: (preferences) =>
        set({ webhooksPreferences: preferences }),

      ffmpegExportsPreferences: {
        pageSize: PAGE_SIZE,
        contentDisplay: [
          { id: "executionArn", visible: true },
          { id: "timerange", visible: true },
          { id: "flowIds", visible: true },
          { id: "command", visible: false },
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
    },
  ),
);

export default usePreferencesStore;
