import "@byomakase/omakase-react-components/dist/omakase-react-components.css";

import { OmakasePlayerTamsComponent } from "./components";
import { Spinner, Box } from "@cloudscape-design/components";
import { useOmakaseData } from "@/hooks/useOmakaseData";
import { useParams } from "react-router-dom";
import { Component, useState } from "react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  firstError: Error | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Capture ONLY the first error
    if (this.firstError === null) {
      this.firstError = error;
      this.setState({ error });
    }

    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const error = this.state.error || this.firstError;

      return (
        <Box>
          Can't initialize playback due to the following error(s):
          <br />
          {error?.message}
        </Box>
      );
    }

    return this.props.children;
  }
}

export const OmakaseHlsPlayer = () => {
  const { type, id } = useParams<{ type: string; id: string }>();
  const [timerange, setTimerange] = useState<string | undefined>();

  const {
    sourceId,
    flow,
    relatedFlows: filteredChildFlows,
    flowSegments,
    timerange: calculatedTimerange,
    maxTimerange,
    isLoading,
  } = useOmakaseData(type!, id!, timerange!);

  if (!isLoading && !flow) {
    return <Box textAlign="center">{`No valid ${type} found`}</Box>;
  }
  if (!isLoading) {
    const hasSegments =
      Object.values(flowSegments || {}).find(
        (segments) => segments.length > 0,
      ) != undefined;

    if (!hasSegments) {
      return <Box textAlign="center">Selected timerange has no segments</Box>;
    }
  }

  return !isLoading ? (
    <ErrorBoundary>
      <Box>
        <OmakasePlayerTamsComponent
          sourceId={sourceId!}
          flow={flow as any}
          childFlows={filteredChildFlows as any}
          flowsSegments={new Map(Object.entries(flowSegments || {}))}
          timeRange={calculatedTimerange!}
          maxTimeRange={maxTimerange!}
          setTimeRange={setTimerange as any}
          displayConfig={{}}
        />
      </Box>
    </ErrorBoundary>
  ) : (
    <Box textAlign="center">
      Loading Media <Spinner />
    </Box>
  );
};

export default OmakaseHlsPlayer;
