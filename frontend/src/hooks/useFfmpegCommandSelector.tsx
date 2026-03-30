import { useState, useMemo } from "react";
import { AWS_FFMPEG_COMMANDS_PARAMETER } from "@/constants";
import { useParameter } from "@/hooks/useParameters";
import type { FfmpegConfig } from "@/types/ingestFFmpeg";
import type { SelectProps } from "@cloudscape-design/components";


export const useFfmpegCommandSelector = (filterTams: boolean) => {
    const [selectedCommand, setSelectedCommand] = useState<string>("");
    const { parameter: commandsData } = useParameter(AWS_FFMPEG_COMMANDS_PARAMETER);

    const commands = useMemo<SelectProps.Option[]>(() => {
        if (!commandsData) return [];
        const typedCommands = commandsData as Record<string, FfmpegConfig>;
        return Object.entries(typedCommands)
            .filter(([_, value]) => filterTams ? value.tams : !value.tams)
            .map(([label, _]) => ({ label, value: label }));
    }, [commandsData, filterTams]);

    const ffmpeg = selectedCommand && commandsData
        ? (commandsData as Record<string, FfmpegConfig>)[selectedCommand]
        : undefined;

    return { commands, ffmpeg, selectedCommand, setSelectedCommand };
};
