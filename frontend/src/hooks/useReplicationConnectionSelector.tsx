import { useState, useMemo } from "react";
import { AWS_REPLICATION_CONNECTIONS_PARAMETER } from "@/constants";
import { useParameter } from "@/hooks/useParameters";
import type { SelectProps } from "@cloudscape-design/components";

type ConnectionData = {
    endpoint: string;
    connectionArn: string;
};

export const useReplicationConnectionSelector = () => {
    const [selectedConnection, setSelectedConnection] = useState<string>("");
    const { parameter: connectionsData } = useParameter(
        AWS_REPLICATION_CONNECTIONS_PARAMETER
    );

    const connections = useMemo<SelectProps.Option[]>(() => {
        if (!connectionsData) return [];
        const typedConnections = connectionsData as Record<string, ConnectionData>;
        return Object.entries(typedConnections)
            .map(([label]) => ({ label, value: label }));
    }, [connectionsData]);

    const connection = selectedConnection && connectionsData
        ? (connectionsData as Record<string, ConnectionData>)[selectedConnection]
        : undefined;

    return { connections, connection, selectedConnection, setSelectedConnection };
};
