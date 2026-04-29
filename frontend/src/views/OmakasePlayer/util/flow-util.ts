import { Flow } from "@byomakase/omakase-react-components";

export class FlowUtil {
  public static hasTextFlow(flows: Flow[]) {
    return flows.some(
      (flow) =>
        flow.format === "urn:x-nmos:format:data" &&
        flow.container === "text/vtt",
    );
  }
}
