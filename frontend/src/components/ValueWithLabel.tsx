import { Box } from "@cloudscape-design/components";

type Props = {
  label: string;
  children: React.ReactNode;
};

const ValueWithLabel = ({ label, children }: Props) => (
  <>
    <Box variant="awsui-key-label">{label}</Box>
    <>{children}</>
  </>
);

export default ValueWithLabel;
