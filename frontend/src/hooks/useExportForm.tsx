import { useState, useMemo } from "react";
import { JsonSchema, FormData } from "@/types/hooks"

const initializeFormData = (operation: string, schema: JsonSchema | null) => {
  const formData: FormData = { operation };
  if (schema?.properties) {
    Object.entries(schema.properties).forEach(([fieldName, fieldSchema]) => {
      formData[fieldName] = fieldSchema.default ?? "";
    });
  }
  return formData;
};

export const useExportForm = (getOperationSchema: (operation: string) => JsonSchema | null) => {
  const [formData, setFormData] = useState<FormData>({
    operation: "MEDIACONVERT_EXPORT",
  });
  const [formSchema, setFormSchema] = useState<JsonSchema | null>(null);

  const handleOperationChange = (operation: string) => {
    const schema: JsonSchema | null = getOperationSchema(operation);
    setFormSchema(schema);
    setFormData(initializeFormData(operation, schema));
  };

  const resetForm = () => {
    const operation = "MEDIACONVERT_EXPORT";
    const schema = getOperationSchema(operation);
    setFormSchema(schema);
    setFormData({ operation });
  };

  const isFormValid = useMemo(() => {
    return !formSchema?.required?.some(
      (fieldName) => !formData[fieldName]?.trim()
    );
  }, [formSchema?.required, formData]);

  return {
    formData,
    setFormData,
    formSchema,
    handleOperationChange,
    resetForm,
    isFormValid,
  };
};
