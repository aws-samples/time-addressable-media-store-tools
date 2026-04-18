import {
  FormField,
  RadioGroup,
} from "@cloudscape-design/components";

type Props = {
  label: string,
  description: string,
  undefinedBool: boolean | undefined;
  setUndefinedBool: React.Dispatch<React.SetStateAction<boolean | undefined>>;
};

const undefinedBoolean =
  [
    { value: "undefined", label: "Not set" },
    { value: "true", label: "True" },
    { value: "false", label: "False" },
  ]

const UndefinedBoolInput = ({
  label,
  description,
  undefinedBool,
  setUndefinedBool,
}: Props) => {

  return (
    <FormField
      description={description}
      label={label}
    >
      <RadioGroup
        value={undefinedBool === undefined ? "undefined" : String(undefinedBool)}
        onChange={({ detail }) => {
          if (detail.value === "undefined") {
            setUndefinedBool(undefined);
          } else {
            setUndefinedBool(detail.value === "true");
          }
        }}
        items={undefinedBoolean}
      />
    </FormField>

  );
};

export default UndefinedBoolInput;
