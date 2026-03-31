import {
  FormField,
  Input,
  Textarea,
  SpaceBetween,
} from "@cloudscape-design/components";
import validateJson from "@/utils/validateJson";
import type { FormFieldProps, InputProps } from "@cloudscape-design/components";
import type { Timerange } from "@/types/tams"

type Props = {
  timeranges: Timerange | Timerange[],
  onTimerangesChange?: (value: string) => void,
  fileName: string,
  setFileName: React.Dispatch<React.SetStateAction<string>>,
  jobSpec: string,
  onJobSpecChange: (value: string) => void,
  timerangeProps?: Partial<FormFieldProps> & { inputProps?: Partial<InputProps> },
  readOnly?: boolean,
};

const MediaConvertExportForm = ({
  timeranges,
  onTimerangesChange,
  fileName,
  setFileName,
  jobSpec,
  onJobSpecChange,
  timerangeProps = {},
  readOnly = false,
}: Props) => {
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

      <FormField label="Output Filename" description="Provide the output filename. Folders are supported using '/'">
        <Input
          value={fileName}
          onChange={({ detail }) => setFileName(detail.value)}
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
