import uuid


def apply_changes(flow: dict, changes: dict, source_id: str) -> dict:
    new_flow = {
        **flow,
        "id": str(uuid.uuid4()),
        "source_id": source_id,
    }
    for key in ["created_by", "updated_by"]:
        if new_flow.get(key):
            del new_flow[key]
    for key, value in changes.items():
        if value is None:
            path_parts = key.split(".")
            current = new_flow
            for i in range(len(path_parts) - 1):
                current = current[path_parts[i]]
            if current.get(path_parts[-1]):
                del current[path_parts[-1]]
        else:
            if "." in key:
                path_parts = key.split(".")
                current = new_flow
                for i in range(len(path_parts) - 1):
                    part = path_parts[i]
                    if part not in current:
                        current[part] = {}
                    current = current[part]
                current[path_parts[-1]] = value
            else:
                new_flow[key] = value
    new_flow["generation"] = new_flow.get("generation", 0) + 1
    return new_flow


# pylint: disable=unused-argument
def lambda_handler(event, context):
    return apply_changes(event["flow"], event["changes"], event["newSourceId"])
