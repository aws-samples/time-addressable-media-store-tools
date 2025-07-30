import { useState, useMemo } from "react";

const initializeFormData = (operation, schema) => {
  const formData = { operation };
  if (schema?.properties) {
    Object.entries(schema.properties).forEach(([fieldName, fieldSchema]) => {
      formData[fieldName] = fieldSchema.default ?? "";
    });
  }
  return formData;
};

export const useExportForm = (getOperationSchema) => {
  const [formData, setFormData] = useState({
    operation: "MEDIACONVERT_EXPORT",
  });
  const [formSchema, setFormSchema] = useState(null);

  const handleOperationChange = (operation) => {
    const schema = getOperationSchema(operation);
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
