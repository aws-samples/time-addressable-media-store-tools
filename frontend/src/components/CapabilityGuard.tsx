import { Outlet } from "react-router";
import { Box, Spinner } from "@cloudscape-design/components";
import { useCapability } from "@/hooks/useCapability";

type Props = {
  path: string;
};

/**
 * Route guard for endpoints that may not exist on older TAMS stores.
 * Renders the child routes only when the connected store exposes `path`;
 * shows a spinner while probing and a message when the feature is absent.
 */
const CapabilityGuard = ({ path }: Props) => {
  const available = useCapability(path);

  if (available === undefined) {
    return (
      <Box textAlign="center" margin={{ vertical: "xl" }}>
        <Spinner />
      </Box>
    );
  }

  if (!available) {
    return (
      <Box textAlign="center" color="inherit" margin={{ vertical: "xl" }}>
        <b>This feature is not available on the connected TAMS store.</b>
      </Box>
    );
  }

  return <Outlet />;
};

export default CapabilityGuard;
