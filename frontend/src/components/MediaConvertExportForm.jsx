import {
  FormField,
  Input,
  Textarea,
  SpaceBetween,
} from "@cloudscape-design/components";
import validateJson from "@/utils/validateJson";

const MediaConvertExportForm = ({
  timeranges,
  onTimerangesChange,
  jobSpec,
  onJobSpecChange,
  timerangeProps = {},
  readOnly = false,
}) => {
  const timerangeValue = Array.isArray(timeranges)
    ? timeranges.join(",")
    : timeranges;

  return (
    <SpaceBetween size="xs">
      <FormField label="Timerange" {...timerangeProps}>
        <Input
          value={timerangeValue || ""}
          readOnly={readOnly}
          onChange={
            readOnly
              ? undefined
              : ({ detail }) => onTimerangesChange?.(detail.value)
          }
          {...(timerangeProps.inputProps || {})}
        />
      </FormField>
      <FormField
        label="Job Specification"
        warningText={validateJson(jobSpec).error?.message}
      >
        <Textarea
          rows={20}
          disableBrowserAutocorrect
          spellcheck={false}
          value={jobSpec}
          onChange={({ detail }) => onJobSpecChange(detail.value)}
        />
      </FormField>
    </SpaceBetween>
  );
};

export default MediaConvertExportForm;
