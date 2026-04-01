import {
  FormField,
  KeyValuePairs,
  Select,
} from "@cloudscape-design/components";
import type { FfmpegConfig } from "@/types/ingestFFmpeg";
import type { SelectProps } from "@cloudscape-design/components";

type Props = {
  commands: SelectProps.Option[];
  selectedCommand: string;
  setSelectedCommand: React.Dispatch<React.SetStateAction<string>>;
  ffmpeg?: FfmpegConfig;
};

const FfmpegCommandSelector = ({
  commands,
  selectedCommand,
  setSelectedCommand,
  ffmpeg,
}: Props) => (
  <>
    <FormField description="Choose an FFmpeg command" label="FFmpeg Command">
      <Select
        selectedOption={
          commands.find(({ value }) => value === selectedCommand) ?? null
        }
        onChange={({ detail }) =>
          setSelectedCommand(detail.selectedOption?.value ?? "")
        }
        options={commands}
      />
    </FormField>
    {ffmpeg && (
      <KeyValuePairs
        columns={1}
        items={[
          {
            label: "Command",
            value: Object.entries(ffmpeg.command)
              .map((arg) => arg.join(" "))
              .join(" "),
          },
        ]}
      />
    )}
  </>
);

export default FfmpegCommandSelector;
