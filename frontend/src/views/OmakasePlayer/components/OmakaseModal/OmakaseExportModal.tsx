import React, { ReactNode, useEffect, useState } from "react";
import OmakaseModal from "./OmakaseModal";
import { PopUpIcon } from "../../icons/PopUpIcon";
import "./OmakaseExportModal.css";
import { CaretDownIcon } from "../../icons/CaretDownIcon";
import { CheckedIcon } from "../../icons/CheckedIcon";
import { UncheckedIcon } from "../../icons/UncheckedIcon";
import { CaretUpIcon } from "../../icons/CaretUpIcon";
import { fetchAuthSession } from "aws-amplify/auth";
import {
  EventBridgeClient,
  PutEventsCommand,
  PutEventsCommandInput,
} from "@aws-sdk/client-eventbridge";
import {
  MarkerApi,
  MarkerLane,
  OmakasePlayer,
  PeriodMarker,
} from "@byomakase/omakase-player";
import { TimeRangeUtil } from "../../util/time-range-util";
import { Spinner } from "@cloudscape-design/components";
import { Flow, VideoFlow } from "@byomakase/omakase-react-components";

export type OmakaseExportModalProps = {
  flows: Flow[];
  source: MarkerLane;
  markerOffset: number;
  exportDisabled: boolean;
  omakasePlayer: OmakasePlayer;
};

export type OmakaseExportModalBodyProps = {
  flows: Flow[];
  source: MarkerLane;
  setShowModal: React.Dispatch<React.SetStateAction<boolean>> | undefined;
  markerOffset: number;
  showToast: (message: string, error: boolean, duration: number) => void;
  omakasePlayer: OmakasePlayer;
};

export type OmakaseExportModalOperations =
  | "Segment Concatenation"
  | "Flow Creation";
export type OmakaseExportModalFormats = "TS" | "MP4";

interface OmakaseCheckboxProps {
  label: string;
  name: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

interface DropdownProps {
  title: string;
  children: ReactNode;
  disabled: boolean;
}

type OmakaseToastProps = {
  message: string;
  duration: number;
  error: boolean;
  onClose: () => void;
};

const OmakaseToast = ({
  message,
  duration,
  onClose,
  error,
}: OmakaseToastProps) => {
  const className = error
    ? "omakase-toast omakase-toast-error"
    : "omakase-toast omakase-toast-success";
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return <div className={className}>{message}</div>;
};

export function OmakaseDropdown({ title, children, disabled }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (disabled && isOpen) {
    setIsOpen(false);
  }

  const toggleClassName = disabled
    ? "omakase-dropdown-toggle-control-disabled"
    : "omakase-dropdown-toggle-control";

  return (
    <div className="omakase-dropdown">
      <div
        className={toggleClassName}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="omakase-dropdown-title">{title}</div>
        <span className="omakase-dropdown-icon">
          {isOpen ? (
            <CaretUpIcon width={18} height={18} />
          ) : (
            <CaretDownIcon width={18} height={18} />
          )}
        </span>
      </div>
      {isOpen && <div className="omakase-dropdown-content">{children}</div>}
    </div>
  );
}

export function OmakaseCheckbox({
  label,
  name,
  checked: controlledChecked,
  onChange,
}: OmakaseCheckboxProps) {
  const [internalChecked, setInternalChecked] = useState(
    controlledChecked || false
  );
  const checked = controlledChecked ?? internalChecked;

  const handleChange = (event: React.MouseEvent) => {
    event.stopPropagation();
    const newChecked = !checked;
    setInternalChecked(newChecked);
    onChange?.(newChecked);
  };

  return (
    <label className="omakase-checkbox">
      <input name={name} type="checkbox" checked={checked} readOnly />
      <div className="omakase-checkbox-icon-container" onClick={handleChange}>
        {checked ? (
          <CheckedIcon width={18} height={18} />
        ) : (
          <UncheckedIcon width={18} height={18} />
        )}
      </div>
      <div>{label}</div>
    </label>
  );
}

type FormData = {
  operation: OmakaseExportModalOperations;
  format: OmakaseExportModalFormats;
  bucket: string;
  filename: string;
  path: string;
  label: string;
  flows: Record<string, boolean>;
};

function resolveMaxBitRateVideoFlow(flows: Flow[]) {
  return flows.reduce(
    (maxBitRateVideoFlow: VideoFlow | undefined, currentFlow: Flow) => {
      if (currentFlow.format !== "urn:x-nmos:format:video") {
        return maxBitRateVideoFlow;
      }

      currentFlow as VideoFlow;

      if (maxBitRateVideoFlow === undefined) {
        return currentFlow;
      }

      if (currentFlow.avg_bit_rate !== undefined) {
        if (
          maxBitRateVideoFlow.avg_bit_rate !== undefined &&
          currentFlow.avg_bit_rate <= maxBitRateVideoFlow.avg_bit_rate
        ) {
          return maxBitRateVideoFlow;
        }

        return currentFlow;
      }

      return maxBitRateVideoFlow;
    },
    undefined
  );
}

export function OmakaseExportModalBody({
  flows,
  setShowModal,
  source,
  markerOffset,
  showToast,
  omakasePlayer,
}: OmakaseExportModalBodyProps) {
  const operations = ["Segment Concatenation", "Flow Creation"];
  const formats = ["TS", "MP4"];

  const [formData, setFormData] = useState<FormData>({
    operation: "Segment Concatenation",
    format: "TS",
    bucket: "",
    path: "",
    filename: "",
    label: "",
    flows: flows
      .filter((flow) => flow.format === "urn:x-nmos:format:audio")
      .reduce((acc, flow) => {
        acc[flow.id] = true; // assuming all checkboxes are checked by default
        return acc;
      }, {} as Record<string, boolean>),
  });

  const [alertMessage, setAlertMessage] = useState("");

  const [isSpinnerVisible, setIsSpinnerVisible] = useState(false);

  if (alertMessage !== "") {
    window.alert(alertMessage);
    setAlertMessage("");
  }

  const isExportButtonDisabled =
    formData.operation === "Flow Creation" && formData.label === "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { credentials } = await fetchAuthSession();

    const region =
      //@ts-ignore
      import.meta.env.VITE_APP_AWS_REGION;

    if (region === undefined) {
      console.error("VITE_EXPORT_EVENT_BRIDGE_REGION is not defined in .env");
    }

    const client = new EventBridgeClient({
      region: region,
      credentials: credentials,
    });

    const selectedFlows = Object.keys(formData.flows).filter(
      (key) => formData.flows[key]
    );
    const timeRanges = source
      .getMarkers()
      .map((marker: MarkerApi) => {
        if ("time" in marker.timeObservation) {
          return undefined;
        }
        marker as PeriodMarker;
        if (
          marker.timeObservation.start == undefined ||
          marker.timeObservation.end == undefined
        ) {
          return undefined;
        }

        // ensures marker start time lines up with start of the frame in milliseconds
        const startTime = omakasePlayer.video.calculateFrameToTime(
          omakasePlayer.video.calculateTimeToFrame(marker.timeObservation.start)
        );
        const endTime = omakasePlayer.video.calculateFrameToTime(
          omakasePlayer.video.calculateTimeToFrame(marker.timeObservation.end)
        );

        const startMoment = TimeRangeUtil.secondsToTimeMoment(
          startTime + markerOffset
        );
        const endMoment = TimeRangeUtil.secondsToTimeMoment(
          endTime + markerOffset
        );
        const timeRange = TimeRangeUtil.toTimeRange(
          startMoment,
          endMoment,
          true,
          false
        );

        return TimeRangeUtil.formatTimeRangeExpr(timeRange);
      })
      .filter((timeRange) => timeRange !== undefined);

    const editFlows = selectedFlows;
    const videoFlow = resolveMaxBitRateVideoFlow(flows);
    if (videoFlow) {
      editFlows.push(videoFlow.id);
    }

    const editPayload = timeRanges.map((timeRange) => ({
      timerange: timeRange,
      flows: editFlows,
    }));

    let configuration: any = {};

    if (formData.operation === "Segment Concatenation") {
      configuration.format = formData.format;
      configuration.output = {
        bucket: formData.bucket !== "" ? formData.bucket : undefined,
        path: formData.path !== "" ? formData.path : undefined,
        filename: formData.filename !== "" ? formData.filename : undefined,
      };
    } else if (formData.operation === "Flow Creation") {
      configuration.label = formData.label;
    }

    const operation = formData.operation.replaceAll(" ", "_").toUpperCase();

    const eventBusName =
      //@ts-ignore
      import.meta.env.VITE_APP_OMAKASE_EXPORT_EVENT_BUS ?? "omakase-tams";

    const params: PutEventsCommandInput = {
      Entries: [
        {
          Source: "TAMS_UX",
          DetailType: "TAMS_PROCESSING_REQUEST",
          Detail: JSON.stringify({
            edit: editPayload,
            operation: operation,
            configuration: configuration,
          }),
          EventBusName: eventBusName,
        },
      ],
    };

    setIsSpinnerVisible(true);

    try {
      await client.send(new PutEventsCommand(params));

      showToast("Successful export", false, 6000);
    } catch (error) {
      showToast("Error", true, 3000);
    } finally {
      setShowModal && setShowModal(false);
      setIsSpinnerVisible(false);
    }
  };

  const handleOperationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData((prevFormData) => {
      const newOperation = e.target.value as OmakaseExportModalOperations;
      if (
        prevFormData.operation === "Segment Concatenation" &&
        newOperation !== "Segment Concatenation"
      ) {
        return {
          ...prevFormData,
          operation: newOperation,
          filename: "",
          bucket: "",
          path: "",
        };
      }

      return {
        ...prevFormData,
        operation: newOperation,
      };
    });
  };

  return (
    <div className="omakase-export-modal-body">
      <div>
        <label>Operation:</label>
        <br />
        <div className="omakase-select-wrapper">
          <select
            className="omakase-select"
            value={formData.operation}
            // onChange={(e) => setSelectedOperation(e.target.value)}
            onChange={(e) => handleOperationChange(e)}
          >
            {operations.map((operation) => (
              <option key={operation} value={operation}>
                {operation}
              </option>
            ))}
          </select>
          <CaretDownIcon width={16} height={16} />
        </div>

        <br />

        {formData.operation === "Segment Concatenation" && (
          <>
            <label>Format:</label>
            <br />
            <div className="omakase-select-wrapper">
              <select
                className="omakase-select"
                onChange={(e) =>
                  setFormData((prevFormData) => ({
                    ...prevFormData,
                    format: e.target.value as OmakaseExportModalFormats,
                  }))
                }
              >
                {formats.map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
              <CaretDownIcon width={16} height={16} />
            </div>
            <br />
          </>
        )}

        {formData.operation === "Flow Creation" && (
          <>
            <label>Label:</label>
            <br />
            <input
              name="label"
              className="omakase-input omakase-input-short"
              placeholder="Label"
              value={formData.label}
              onChange={(e) =>
                setFormData({ ...formData, label: e.target.value })
              }
            ></input>
            <br />
          </>
        )}

        {flows
          .filter((flow) => flow.format === "urn:x-nmos:format:audio")
          .map((flow) => (
            <OmakaseCheckbox
              key={flow.id}
              name={flow.id}
              checked={formData.flows[flow.id] || false}
              label={flow.description ?? ""}
              onChange={(checked) =>
                setFormData((prev) => ({
                  ...prev,
                  flows: { ...prev.flows, [flow.id]: checked },
                }))
              }
            />
          ))}

        <OmakaseDropdown
          title={"ADVANCED"}
          disabled={formData.operation !== "Segment Concatenation"}
        >
          <input
            name="bucket"
            className="omakase-input"
            placeholder="Bucket"
            value={formData.bucket}
            onChange={(e) =>
              setFormData({ ...formData, bucket: e.target.value })
            }
          ></input>
          <input
            name="path"
            className="omakase-input"
            placeholder="Path"
            value={formData.path}
            onChange={(e) => setFormData({ ...formData, path: e.target.value })}
          ></input>
          <input
            name="filename"
            className="omakase-input"
            placeholder="Filename"
            value={formData.filename}
            onChange={(e) =>
              setFormData({ ...formData, filename: e.target.value })
            }
          ></input>
        </OmakaseDropdown>
        <div className="omakase-button-container">
          <div className="omakase-button-spinner-container">
            {isSpinnerVisible && <Spinner />}
            <button
              className="omakase-export-button"
              type="button"
              disabled={isExportButtonDisabled}
              onClick={(e) => !isExportButtonDisabled && handleSubmit(e)}
            >
              Export
            </button>
          </div>
          <button
            className="omakase-cancel-button"
            onClick={() => setShowModal && setShowModal(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OmakaseExportModal({
  flows,
  source,
  markerOffset,
  exportDisabled,
  omakasePlayer,
}: OmakaseExportModalProps) {
  const [toast, setToast] = useState({
    message: "",
    visible: false,
    error: false,
    duration: 3000,
  });

  const showToast = (
    message: string,
    error: boolean,
    duration: number = 3000
  ) => {
    setToast({ message, visible: true, duration: duration, error: error });
    setTimeout(() => {
      setToast({
        message: "",
        visible: false,
        duration: duration,
        error: false,
      });
    }, duration);
  };

  return (
    <>
      {!exportDisabled ? (
        <OmakaseModal
          trigger={
            <div className="segmentation-export">
              <PopUpIcon />
              EXPORT
            </div>
          }
          header={"Export"}
          children={
            <OmakaseExportModalBody
              setShowModal={undefined}
              flows={flows}
              source={source}
              markerOffset={markerOffset}
              showToast={showToast}
              omakasePlayer={omakasePlayer}
            />
          }
        />
      ) : (
        <div className="segmentation-export-disabled">
          <PopUpIcon />
          EXPORT
        </div>
      )}
      {toast.visible && (
        <OmakaseToast
          message={toast.message}
          duration={toast.duration}
          error={toast.error}
          onClose={() =>
            setToast({
              message: "",
              visible: false,
              duration: toast.duration,
              error: false,
            })
          }
        />
      )}
    </>
  );
}
