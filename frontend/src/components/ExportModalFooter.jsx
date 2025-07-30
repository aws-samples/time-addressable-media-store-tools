import { Box, Button, SpaceBetween } from "@cloudscape-design/components";

const ExportModalFooter = ({
  onCancel,
  onSubmit,
  submitText = "Submit",
  submitDisabled = false,
  submitLoading = false,
  cancelDisabled = false,
  cancelLoading = false,
}) => {
  return (
    <Box float="right">
      <SpaceBetween direction="horizontal" size="xs">
        <Button
          variant="link"
          disabled={cancelDisabled}
          loading={cancelLoading}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={submitDisabled}
          loading={submitLoading}
          onClick={onSubmit}
        >
          {submitText}
        </Button>
      </SpaceBetween>
    </Box>
  );
};

export default ExportModalFooter;
