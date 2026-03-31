import { Box, Button, SpaceBetween } from "@cloudscape-design/components";

type Props = {
  onCancel: () => void;
  onSubmit: () => void;
  submitText?: string;
  submitDisabled?: boolean;
  submitLoading?: boolean;
  cancelDisabled?: boolean;
  cancelLoading?: boolean;
};

const CancelModalFooter = ({
  onCancel,
  onSubmit,
  submitText = "Submit",
  submitDisabled = false,
  submitLoading = false,
  cancelDisabled = false,
  cancelLoading = false,
}: Props) => {
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

export default CancelModalFooter;
