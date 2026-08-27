import json
import os
import subprocess  # nosec B404 - subprocess call is safe as command input is controlled
import tempfile
from urllib.parse import urlparse

import boto3
import requests
from botocore.config import Config


def get_signed_url(bucket, obj, expires_in=60):
    s3_cli = boto3.client(
        "s3",
        region_name=os.environ["AWS_REGION"],
        config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    )
    presigned_url = s3_cli.generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": obj}, ExpiresIn=expires_in
    )
    return presigned_url


def _download_byterange(source, source_parse, byterange):
    """Download exactly the bytes for an HLS #EXT-X-BYTERANGE value ('length[@offset]').
    A missing offset means the sub-range starts at byte 0 (only the first sub-range of a
    resource may omit it); callers probing later sub-ranges pass a normalised value."""
    parts = byterange.split("@")
    length = int(parts[0])
    offset = int(parts[1]) if len(parts) > 1 else 0
    end = offset + length - 1
    if source_parse.scheme == "s3":
        s3_cli = boto3.client("s3")
        response = s3_cli.get_object(
            Bucket=source_parse.netloc,
            Key=source_parse.path[1:],
            Range=f"bytes={offset}-{end}",
        )
        return response["Body"].read()
    response = requests.get(
        source, headers={"Range": f"bytes={offset}-{end}"}, timeout=30
    )
    response.raise_for_status()
    return response.content


def ffprobe_link(source, byterange=None):
    source_parse = urlparse(source)
    tmp_path = None
    try:
        if byterange:
            # Fetch exactly the segment's bytes and probe them locally. Probing a remote
            # URL with an injected Range header does not work for single-file byterange
            # renditions: for the first segment ffprobe reads the total size from the
            # response Content-Range header and reports the WHOLE file's duration, and it
            # fails outright on mid-file offsets.
            data = _download_byterange(source, source_parse, byterange)
            suffix = os.path.splitext(source_parse.path)[1]
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir="/tmp") as tmp:  # nosec B108 - /tmp is the only writable path in Lambda
                tmp.write(data)
                tmp_path = tmp.name
            target = tmp_path
        elif source_parse.scheme == "s3":
            target = get_signed_url(source_parse.netloc, source_parse.path[1:])
        else:
            target = source
        args = [
            "/opt/bin/ffprobe",
            "-loglevel",
            "error",
            "-show_format",
            "-show_streams",
            target,
            "-print_format",
            "json",
        ]
        ffprobe = subprocess.run(
            args,
            check=True,
            shell=False,  # nosec B603 - subprocess call is safe as command input is controlled
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if ffprobe.returncode == 0:
            return json.loads(ffprobe.stdout.decode("utf-8"))
    except subprocess.CalledProcessError as ex:
        print(ex.stderr.decode("utf-8"))
    except requests.RequestException as ex:
        print(f"Failed to fetch byte range for {source}: {ex}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)
