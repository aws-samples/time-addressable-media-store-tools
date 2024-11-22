import json
import uuid
from collections import Counter
from copy import deepcopy

import boto3


class Channel:
    def __init__(self, channel_id):
        self.dict = {}
        eml = boto3.client("medialive")

        try:
            self.dict = eml.describe_channel(ChannelId=channel_id)
            self.dict.pop("ResponseMetadata")
        except eml.exceptions.NotFoundException as ex:
            print(ex)

        if "Destinations" in self.dict:
            self.dict["Destinations"] = {
                d.pop("Id"): d for d in self.dict["Destinations"]
            }

        if (
            "EncoderSettings" in self.dict
            and "AudioDescriptions" in self.dict["EncoderSettings"]
        ):
            self.dict["EncoderSettings"]["AudioDescriptions"] = {
                d.pop("Name"): d
                for d in self.dict["EncoderSettings"]["AudioDescriptions"]
            }

        if (
            "EncoderSettings" in self.dict
            and "VideoDescriptions" in self.dict["EncoderSettings"]
        ):
            self.dict["EncoderSettings"]["VideoDescriptions"] = {
                d.pop("Name"): d
                for d in self.dict["EncoderSettings"]["VideoDescriptions"]
            }

        if (
            "EncoderSettings" in self.dict
            and "CaptionDescriptions" in self.dict["EncoderSettings"]
        ):
            self.dict["EncoderSettings"]["CaptionDescriptions"] = {
                d.pop("Name"): d
                for d in self.dict["EncoderSettings"]["CaptionDescriptions"]
            }

    def tams(self, label, source_id):

        def get_hls_output_groups():
            output_groups = [
                output_group
                for output_group in self.dict.get("EncoderSettings", {}).get(
                    "OutputGroups", []
                )
                if "HlsGroupSettings" in output_group["OutputGroupSettings"]
            ]
            return output_groups

        def get_flow_format(output):
            has_audio = (
                "AudioDescriptionNames" in output
                and len(output["AudioDescriptionNames"]) > 0
            )
            has_video = "VideoDescriptionName" in output
            if has_video and has_audio:
                return "urn:x-nmos:format:multi"
            if has_video:
                return "urn:x-nmos:format:video"
            if has_audio:
                return "urn:x-nmos:format:audio"

        def get_video_flow(base_flow, output):
            flow_id = str(uuid.uuid4())
            video_description_name = output.get("VideoDescriptionName", None)
            encoder_settings = self.dict["EncoderSettings"]["VideoDescriptions"][
                video_description_name
            ]
            codec_setting_name = list(encoder_settings["CodecSettings"])[0]
            codec_setting = encoder_settings["CodecSettings"][codec_setting_name]
            codec_setting["Codec"] = (
                f'video/{codec_setting_name.split("Settings")[0].lower()}'
            )
            flow = {
                "id": flow_id,
                **base_flow,
                "format": "urn:x-nmos:format:video",
                "codec": codec_setting["Codec"],
                "avg_bit_rate": codec_setting["Bitrate"],
                "max_bit_rate": codec_setting["Bitrate"],
                "essence_parameters": {
                    "frame_rate": {
                        "numerator": codec_setting["FramerateNumerator"],
                        "denominator": codec_setting["FramerateDenominator"],
                    },
                    "frame_width": encoder_settings["Width"],
                    "frame_height": encoder_settings["Height"],
                    "interlace_mode": codec_setting["ScanType"].lower(),
                },
            }
            return flow

        def get_audio_flow(base_flow, output):
            flow_id = str(uuid.uuid4())
            audio_description_name = next(
                iter(output["AudioDescriptionNames"]), None
            )  # Always get first Audio description as unclear if/how multiple audio descriptions produce files.
            encoder_settings = self.dict["EncoderSettings"]["AudioDescriptions"][
                audio_description_name
            ]
            codec_setting_name = list(encoder_settings["CodecSettings"])[0]
            codec_setting = encoder_settings["CodecSettings"][codec_setting_name]
            codec_setting["Codec"] = (
                f'audio/{codec_setting_name.split("Settings")[0].lower()}'
            )
            channels = {
                "AD_RECEIVER_MIX": 2,  # default value used since unsure how to infer this
                "CODING_MODE_1_0": 1,
                "CODING_MODE_1_1": 2,
                "CODING_MODE_2_0": 2,
                "CODING_MODE_5_1": 6,
            }
            flow = {
                "id": flow_id,
                **base_flow,
                "format": "urn:x-nmos:format:audio",
                "codec": codec_setting["Codec"],
                "avg_bit_rate": codec_setting["Bitrate"],
                "max_bit_rate": codec_setting["Bitrate"],
                "essence_parameters": {
                    "sample_rate": codec_setting["SampleRate"],
                    "channels": channels[codec_setting["CodingMode"]],
                },
            }
            return flow

        def get_flows_from_outputs():
            flows = []
            ssm_parameters = []
            for output_group in get_hls_output_groups():
                destination_id = (
                    output_group.get("OutputGroupSettings", {})
                    .get("HlsGroupSettings", {})
                    .get("Destination", {})
                    .get("DestinationRefId")
                )
                urls = [
                    s["Url"]
                    for s in self.dict.get("Destinations", {})
                    .get(destination_id, {})
                    .get("Settings", [])
                    if "Url" in s and s["Url"].startswith("s3://")
                ]
                if len(urls) > 0:
                    output_group_name = output_group.get("Name", "")
                    segment_length = output_group["OutputGroupSettings"][
                        "HlsGroupSettings"
                    ]["SegmentLength"]
                    url_split = urls[0].split("/")
                    s3_bucket = url_split[2]
                    s3_prefix = "/".join(url_split[3:])
                    ssm_parameter_value = {
                        "use_start_epoch": self.dict.get("Tags", {})
                        .get("use_start_epoch", "false")
                        .lower()
                        == "true",
                        "segment_length": segment_length,
                    }
                    for i, output in enumerate(output_group["Outputs"]):
                        name_modifier = output["OutputSettings"]["HlsOutputSettings"][
                            "NameModifier"
                        ]
                        output_name = output.get(
                            "OutputName", f"Output {i + 1} ({name_modifier})"
                        )
                        flow_format = get_flow_format(output)
                        multi_flow = None
                        if flow_format == "urn:x-nmos:format:multi":
                            multi_flow = {
                                "id": str(uuid.uuid4()),
                                "label": label,
                                "description": f"{self.dict["Name"]}: {output_group_name} - {output_name}",
                                "format": flow_format,
                                "container": "video/mp2t",
                                "flow_collection": [],
                            }
                            ssm_parameter_value[f"{s3_prefix}{name_modifier}_"] = (
                                multi_flow["id"]
                            )
                        if flow_format in [
                            "urn:x-nmos:format:multi",
                            "urn:x-nmos:format:audio",
                        ]:
                            audio_flow = get_audio_flow(
                                {
                                    "label": label,
                                    "description": f"{self.dict["Name"]}: {output_group_name} - {output_name}",
                                },
                                output,
                            )
                            if multi_flow:
                                multi_flow["flow_collection"].append(
                                    {"id": audio_flow["id"], "role": "audio"}
                                )
                            else:
                                ssm_parameter_value[f"{s3_prefix}{name_modifier}_"] = (
                                    audio_flow["id"]
                                )
                                audio_flow["container"] = "video/mp2t"
                            flows.append(audio_flow)
                        if flow_format in [
                            "urn:x-nmos:format:multi",
                            "urn:x-nmos:format:video",
                        ]:
                            video_flow = get_video_flow(
                                {
                                    "label": label,
                                    "description": f"{self.dict["Name"]}: {output_group_name} - {output_name}",
                                },
                                output,
                            )
                            if multi_flow:
                                multi_flow["flow_collection"].append(
                                    {"id": video_flow["id"], "role": "video"}
                                )
                            else:
                                ssm_parameter_value[f"{s3_prefix}{name_modifier}_"] = (
                                    video_flow["id"]
                                )
                                video_flow["container"] = "video/mp2t"
                            flows.append(video_flow)
                        if multi_flow:
                            flows.append(multi_flow)
                    ssm_parameters.append(
                        {
                            "bucket": s3_bucket,
                            "prefix": s3_prefix,
                            "value": ssm_parameter_value,
                        }
                    )
            return flows, ssm_parameters

        def remove_duplicate_flows(flows):
            flows_dict = {f["id"]: f for f in deepcopy(flows)}
            flows_compare = []
            for flow in flows_dict.values():
                if "container" not in flow:
                    temp_flow = deepcopy(flow)
                    del temp_flow["description"]
                    flows_compare.append((temp_flow.pop("id"), temp_flow))
            duplicate_ids = [
                (f[0], flows_compare[b][0])
                for a, f in enumerate(flows_compare)
                for b in range(a + 1, len(flows_compare))
                if f[1] == flows_compare[b][1]
            ]
            for a, b in duplicate_ids:
                del flows_dict[b]
                flows_dict = json.loads(json.dumps(flows_dict).replace(b, a))
            return list(flows_dict.values())

        def get_source_ids(flows):
            flows_copy = deepcopy(flows)
            source_ids = {
                f: str(uuid.uuid4()) if f != "urn:x-nmos:format:multi" else source_id
                for f in Counter([flow["format"] for flow in flows_copy])
            }
            for flow in flows_copy:
                flow["source_id"] = source_ids[flow["format"]]
            return source_ids, flows_copy

        output_flows, ssm_parameters = get_flows_from_outputs()
        format_counts = dict(Counter([flow["format"] for flow in output_flows]))
        if len(format_counts) > 1 and "urn:x-nmos:format:multi" not in format_counts:
            output_flows.append(
                {
                    "id": str(uuid.uuid4()),
                    "label": label,
                    "description": self.dict["Name"],
                    "format": "urn:x-nmos:format:multi",
                    "flow_collection": [
                        {"id": f["id"], "role": f["format"].split(":")[-1]}
                        for f in output_flows
                    ],
                }
            )
        dedup_flows = remove_duplicate_flows(output_flows)
        source_ids, source_flows = get_source_ids(dedup_flows)
        source_descriptions = {
            v: f'{self.dict["Name"]}: {k.split(":")[-1]}' for k, v in source_ids.items()
        }
        return source_flows, source_descriptions, ssm_parameters
