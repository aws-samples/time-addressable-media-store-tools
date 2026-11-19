import { useEffect, useRef } from "react";
import { UiEventType } from "@byomakase/omakase-player";
import type {
  Marker,
  MarkerOnChromingStyle,
  MarkerOnMarkerListStyle,
  MarkerOnMarkerTrackLaneStyle,
  OmakasePlayerApi,
} from "@byomakase/omakase-player";

// The three style bags that carry a "this marker is selected" key, one per renderer:
// `active` on the chroming marker bar, `highlightMarker` in the marker list, and
// `markerRenderType` on the timeline lane (the band that spans up into the scrubber header).
type MarkerFocusStyle = MarkerOnChromingStyle &
  MarkerOnMarkerListStyle &
  MarkerOnMarkerTrackLaneStyle;

/**
 * Drives selection styling from the player's own UI element registry.
 *
 * 0.25.4 styled the selected marker imperatively, per renderer. omakase-player 1.x instead has a
 * single `focused` element prop: toggle it on the marker's id and translate the resulting
 * `UI_ELEMENT_UPDATED` event into an id style rule, which every renderer picks up reactively.
 * Id rules are the highest-priority layer of the style cascade and are shallow-merged, so this
 * coexists with the per-marker `markerColor` rules applied elsewhere.
 */
export const useMarkerFocusStyles = (
  omakasePlayer: OmakasePlayerApi | undefined,
  selectedMarker: Marker | undefined,
) => {
  const focusedMarkerIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!omakasePlayer) return;
    focusedMarkerIdRef.current = undefined;
    const sub = omakasePlayer.ui.onEvent$.subscribe({
      next: (event) => {
        if (event.type !== UiEventType.UI_ELEMENT_UPDATED) return;
        const focused = !!event.data.element.props?.focused;
        omakasePlayer.ui.updateStyleRule<MarkerFocusStyle>({
          id: event.data.element.id,
          style: {
            active: focused,
            highlightMarker: focused,
            markerRenderType: focused ? "spanning-over-all-lanes" : "default",
          },
        });
      },
    });
    return () => sub.unsubscribe();
  }, [omakasePlayer]);

  useEffect(() => {
    if (!omakasePlayer) return;
    const previousMarkerId = focusedMarkerIdRef.current;
    const nextMarkerId = selectedMarker?.id;
    if (previousMarkerId === nextMarkerId) return;
    if (previousMarkerId) {
      // `focused: false` rather than `undefined`: clearing every prop deletes the element and
      // emits UI_ELEMENTS_REMOVED instead of UI_ELEMENT_UPDATED, which would leave the focused
      // style rule in place with nothing to reset it.
      omakasePlayer.ui.updateElement({
        id: previousMarkerId,
        props: { focused: false },
      });
    }
    if (nextMarkerId) {
      omakasePlayer.ui.updateElement({
        id: nextMarkerId,
        props: { focused: true },
      });
    }
    focusedMarkerIdRef.current = nextMarkerId;
  }, [omakasePlayer, selectedMarker]);
};
