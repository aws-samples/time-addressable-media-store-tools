import { useCallback } from "react";
import {
  Header,
  Container,
  FormField,
  Input,
  Select,
  SpaceBetween,
  Checkbox,
  Textarea,
} from "@cloudscape-design/components";

const DynamicForm = ({ schema, formData, onChange }) => {
  if (!schema.properties) {
    return <></>;
  }

  const renderField = useCallback(
    (fieldName, fieldSchema) => {
      const value = formData[fieldName] || "";
      const handleChange = (newValue) => {
        onChange({ formData: { ...formData, [fieldName]: newValue } });
      };

      // Extract Cloudscape-specific props from schema
      const cloudscapeProps = fieldSchema.cloudscapeProps || {};
      const formFieldProps = {
        description: fieldSchema.description,
        ...fieldSchema.formFieldProps,
      };

      if (fieldSchema.enum) {
        const options = Object.entries(fieldSchema.enum).map(
          ([value, label]) => ({
            value,
            label,
          })
        );
        const selectedOption = options.find((opt) => opt.value === value);

        return (
          <FormField
            key={fieldName}
            label={fieldSchema.title || fieldName}
            {...formFieldProps}
          >
            <Select
              selectedOption={selectedOption}
              onChange={(event) =>
                handleChange(event.detail.selectedOption.value)
              }
              options={options}
              placeholder={fieldSchema.placeholder || "Select an option"}
              {...cloudscapeProps}
            />
          </FormField>
        );
      }

      if (fieldSchema.type === "boolean") {
        console.log();
        return (
          <Checkbox
            key={fieldName}
            checked={value || false}
            onChange={({ detail }) => handleChange(detail.checked)}
            {...cloudscapeProps}
          >
            {fieldSchema.title || fieldName}
          </Checkbox>
        );
      }

      if (fieldSchema.type === "number" || fieldSchema.type === "integer") {
        return (
          <FormField
            key={fieldName}
            label={fieldSchema.title || fieldName}
            {...formFieldProps}
          >
            <Input
              type="number"
              value={value || ""}
              onChange={(event) => handleChange(event.detail.value)}
              placeholder={fieldSchema.placeholder}
              step={fieldSchema.type === "integer" ? "1" : "any"}
              {...cloudscapeProps}
            />
          </FormField>
        );
      }

      if (fieldSchema.format === "textarea") {
        return (
          <FormField
            key={fieldName}
            label={fieldSchema.title || fieldName}
            {...formFieldProps}
          >
            <Textarea
              value={value || ""}
              onChange={({ detail }) => handleChange(detail.value)}
              placeholder={fieldSchema.placeholder}
              {...cloudscapeProps}
            />
          </FormField>
        );
      }

      return (
        <FormField
          key={fieldName}
          label={fieldSchema.title || fieldName}
          {...formFieldProps}
        >
          <Input
            value={value}
            onChange={(event) => handleChange(event.detail.value)}
            placeholder={fieldSchema.placeholder}
            {...cloudscapeProps}
          />
        </FormField>
      );
    },
    [formData, onChange]
  );

  return (
    <Container header={<Header variant="h3">Configuration</Header>}>
      <SpaceBetween direction="vertical" size="xs">
        {Object.entries(schema.properties).map(([fieldName, fieldSchema]) =>
          renderField(fieldName, fieldSchema)
        )}
      </SpaceBetween>
    </Container>
  );
};

export default DynamicForm;
