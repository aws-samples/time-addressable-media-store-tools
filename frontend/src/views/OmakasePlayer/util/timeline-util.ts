import {
  ImageButton,
  OmakasePlayer,
  TextLabel,
  TimelineApi,
} from "@byomakase/omakase-player";
import {
  convertFlowIdToSubtitlesId,
  Flow,
  OmakasePlayerTimelineBuilder,
} from "@byomakase/omakase-react-components";
import {
  SUBTITLES_BUTTON_CONFIG,
  CHATBOX_ACTIVE_SVG_SOURCE,
  CHATBOX_SVG_SOURCE,
  CHEVRON_DOWN_SVG_SOURCE,
  CHEVRON_RIGHT_SVG_SOURCE,
  DROPDOWN_BUTTON_CONFIG,
  MARKER_LANE_TEXT_LABEL_STYLE,
  SOUND_BUTTON_CONFIG,
} from "../components/OmakasePlayerTamsComponent/constants";

export function createSubtitlesButton(
  timelineBuilder: OmakasePlayerTimelineBuilder,
  omakasePlayer: OmakasePlayer,
  flow: Flow,
  subtitlesLaneId: string
) {
  const config = { ...SUBTITLES_BUTTON_CONFIG };
  if (
    omakasePlayer.subtitles.getActiveTrack()?.id ===
    convertFlowIdToSubtitlesId(flow.id)
  ) {
    config.src = CHATBOX_ACTIVE_SVG_SOURCE;
  }
  const subtitlesButton = new ImageButton(config);

  const subtitlesId = convertFlowIdToSubtitlesId(flow.id);
  subtitlesButton.onClick$.subscribe(() => {
    if (omakasePlayer.subtitles.getActiveTrack()?.id !== subtitlesId) {
      if (
        omakasePlayer.subtitles
          .getTracks()
          .find((track) => track.id === subtitlesId)
      ) {
        omakasePlayer.subtitles.showTrack(subtitlesId);
      }
    } else {
      omakasePlayer.subtitles.hideActiveTrack();
    }
  });

  omakasePlayer.subtitles.onShow$.subscribe((subtitlesEvent) => {
    if (subtitlesEvent.currentTrack?.id === subtitlesId) {
      subtitlesButton.setImage({
        src: CHATBOX_ACTIVE_SVG_SOURCE,
      });
    } else if (subtitlesButton.getImage()?.src !== CHATBOX_SVG_SOURCE) {
      subtitlesButton.setImage({
        src: CHATBOX_SVG_SOURCE,
      });
    }
  });

  timelineBuilder.addTimelineNode(subtitlesLaneId, {
    node: subtitlesButton,
    config: {
      height: subtitlesButton.config.height!,
      width: subtitlesButton.config.width!,
      justify: "start" as "start",
      timelineNode: subtitlesButton,
      margin: [0, 0, 0, 10],
    },
  });
}

export function createDropdownButton(
  timelineBuilder: OmakasePlayerTimelineBuilder,
  timeline: TimelineApi,
  controlLaneId: string,
  laneIds: string[]
) {
  const dropdownButton = new ImageButton({
    ...DROPDOWN_BUTTON_CONFIG,
  });

  dropdownButton.onClick$.subscribe(() => {
    let wasMinimized = false;
    laneIds.forEach((laneId) => {
      const lane = timeline.getTimelineLane(laneId);

      if (lane!.isMinimized()) {
        lane!.maximize();
        wasMinimized = true;
      } else {
        lane!.minimize();
      }
    });

    if (wasMinimized) {
      dropdownButton.setImage({ src: CHEVRON_DOWN_SVG_SOURCE });
    } else {
      dropdownButton.setImage({ src: CHEVRON_RIGHT_SVG_SOURCE });
    }
  });

  timelineBuilder.addTimelineNode(controlLaneId, {
    node: dropdownButton,
    config: {
      height: dropdownButton.config.height!,
      width: dropdownButton.config.width!,
      justify: "start" as "start",
      timelineNode: dropdownButton,
      margin: [0, 0, 0, 5],
    },
  });
}

export function createLabel(
  timelineBuilder: OmakasePlayerTimelineBuilder,
  text: string,
  laneId: string
) {
  const label = new TextLabel({
    text: text,
    style: MARKER_LANE_TEXT_LABEL_STYLE,
  });

  const labelConstructionData = {
    node: label,
    config: {
      justify: "end" as "end",
      timelineNode: label,
      width: 150,
      height: 42,
      margin: [0, 0, 0, 10],
    },
  };

  timelineBuilder.addTimelineNode(laneId, labelConstructionData);
}

export function createAudioButton(
  timelineBuilder: OmakasePlayerTimelineBuilder,
  omakasePlayer: OmakasePlayer,
  flow: Flow,
  laneId: string
) {
  const buttonImageSrc =
    omakasePlayer.audio.getActiveAudioTrack()?.label === flow.description
      ? "/sound-active-button.svg"
      : "/sound-inactive-button.svg";

  const soundControlButton = new ImageButton({
    ...SOUND_BUTTON_CONFIG,
    src: buttonImageSrc,
  });

  soundControlButton.onClick$.subscribe({
    next: () => {
      const audioTrack = omakasePlayer.audio
        .getAudioTracks()
        .find((track) => track.label === flow.description)!;
      omakasePlayer.audio.setActiveAudioTrack(audioTrack.id);
    },
  });

  omakasePlayer.audio.onAudioSwitched$.subscribe({
    next: (audioSwitchedEvent) => {
      const buttonImageSrc =
        audioSwitchedEvent.activeAudioTrack.label === flow.description
          ? "/sound-active-button.svg"
          : "/sound-inactive-button.svg";
      soundControlButton.setImage({
        ...SOUND_BUTTON_CONFIG,
        src: buttonImageSrc,
      });
    },
  });

  const buttonConstructionData = {
    node: soundControlButton,
    config: {
      height: soundControlButton.config.height!,
      width: soundControlButton.config.width!,
      justify: "start" as "start",
      timelineNode: soundControlButton,
      margin: [0, 10, 0, 10],
    },
  };

  timelineBuilder.addTimelineNode(laneId, buttonConstructionData);
}
