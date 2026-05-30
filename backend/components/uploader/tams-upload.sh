#!/bin/bash
set -eo pipefail

# ============================================================
# SECTION 1: CONSTANTS & CONFIGURATION
# ============================================================

readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly DIM='\033[2m'
readonly RESET='\033[0m'

readonly BAR_FILLED='█'
readonly BAR_EMPTY='░'

readonly DEFAULT_SEGMENT_DURATION=10
readonly MAX_RETRIES=3
readonly INITIAL_BACKOFF_SEC=1

# Number of segments to upload concurrently. Parallelism is the main speed
# lever for getting media to remote operators fast; the default of 4 balances
# throughput against congesting a weak field uplink. Set TAMS_PARALLEL=1 to
# force sequential uploads.
readonly MAX_PARALLEL_UPLOADS="${TAMS_PARALLEL:-4}"

# Network timeouts (seconds): fail fast on stalled connections instead of
# hanging forever so the retry logic can actually engage.
readonly CONNECT_TIMEOUT="${TAMS_CONNECT_TIMEOUT:-10}"
# MAX_TIME bounds the small JSON API calls. The S3 PUT of a full segment can
# legitimately take much longer on a weak field uplink, so it gets its own,
# larger budget (default 30 min) to avoid killing a slow-but-progressing
# upload and re-transmitting the bytes.
readonly MAX_TIME="${TAMS_MAX_TIME:-300}"
readonly UPLOAD_MAX_TIME="${TAMS_UPLOAD_MAX_TIME:-1800}"
# Refresh the Cognito token when within this many seconds of expiry so long
# uploads don't 401 partway through.
readonly TOKEN_REFRESH_MARGIN_SEC=300

REGION="${TAMS_REGION:-ap-southeast-2}"
API_STACK="${TAMS_STACK_NAME:-tams-api}"

# Network egress on shared/corporate/public WiFi. This tool only needs
# outbound TCP 443 (HTTPS) + DNS — same as a web browser. These let a field
# user work through a corporate proxy or TLS-inspecting gateway.
PROXY_URL="${TAMS_PROXY:-}"
CA_BUNDLE="${TAMS_CA_BUNDLE:-}"
# curl proxy/CA flags, populated by configure_network(). Declared empty so
# "${CURL_NET_OPTS[@]}" is safe to expand under `set -u`-style usage.
CURL_NET_OPTS=()

TOTAL_BYTES_UPLOADED=0
TOTAL_RETRIES=0
UPLOAD_START_EPOCH=0
SCRIPT_START_EPOCH=$(date +%s)
WORK_DIR=""
LOG_FILE=""
TOKEN_EXPIRY_EPOCH=0

# Populated by http_request() on every call.
HTTP_STATUS=""
HTTP_BODY=""
# Set by handle_failure(): "continue" to retry, "abort" to give up.
FAILURE_DECISION=""
# Current backoff (seconds) within a retry loop. Shared between
# upload_segment_with_retry() and handle_failure(); safe in the parallel path
# because each upload runs in its own subshell (fork-time copy, no sharing).
RETRY_BACKOFF=$INITIAL_BACKOFF_SEC
# Indices of segments that exhausted all retries during the current flow's
# upload; populated by the parallel driver and checked before marking ready.
FAILED_SEGMENTS=()
# Per-wave worker result directory (under WORK_DIR), set by upload_track().
RESULT_DIR=""
# Set by segment_track(): the segment files, their durations, and total bytes.
SEGMENT_FILES=()
SEGMENT_DURATIONS=()
SEGMENT_TOTAL_SIZE=0

# ============================================================
# SECTION 2: UX HELPER FUNCTIONS
# ============================================================

show_title() {
  printf "${CYAN}${BOLD}"
  cat << 'TITLE'

  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║   ████████╗ █████╗ ███╗   ███╗███████╗                  ║
  ║      ██╔══╝██╔══██╗████╗ ████║██╔════╝                  ║
  ║      ██║   ███████║██╔████╔██║███████╗                   ║
  ║      ██║   ██╔══██║██║╚██╔╝██║╚════██║                  ║
  ║      ██║   ██║  ██║██║ ╚═╝ ██║███████║                  ║
  ║      ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝                  ║
  ║                                                          ║
  ║            U P L O A D E R   v2.1                        ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝

TITLE
  printf "${RESET}"
}

print_info() {
  printf "  ${CYAN}▸${RESET} %s\n" "$1"
}

print_success() {
  printf "  ${GREEN}✓${RESET} %s\n" "$1"
}

print_warning() {
  printf "  ${YELLOW}!${RESET} %s\n" "$1"
}

print_error() {
  printf "  ${RED}✗${RESET} %s\n" "$1" >&2
}

print_header() {
  echo ""
  printf "  ${CYAN}${BOLD}━━━ %s ━━━${RESET}\n" "$1"
  echo ""
}

get_terminal_width() {
  local width
  width=$(tput cols 2>/dev/null) || width=80
  echo "$width"
}

show_spinner() {
  local pid=$1 msg=$2
  local spin_chars='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local i=0
  tput civis 2>/dev/null || true
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r\033[2K  ${CYAN}%s${RESET} %s" "${spin_chars:i%10:1}" "$msg"
    sleep 0.1
    ((i++)) || true
  done
  printf "\r\033[2K"
  tput cnorm 2>/dev/null || true
}

draw_progress_bar() {
  local current=$1 total=$2 bytes=$3 start=$4 retries=$5 label=$6
  local now elapsed term_width
  now=$(date +%s)
  elapsed=$((now - start))
  term_width=$(get_terminal_width)

  local pct=0
  [[ $total -gt 0 ]] && pct=$((current * 100 / total))

  local speed=0
  [[ $elapsed -gt 0 ]] && speed=$((bytes / elapsed))

  local eta_str="--:--"
  if [[ $current -gt 0 && $elapsed -gt 0 ]]; then
    local remaining=$(( (total - current) * elapsed / current ))
    eta_str=$(format_duration $remaining)
  fi

  local stats_width=50
  local bar_width=$((term_width - stats_width))
  [[ $bar_width -lt 10 ]] && bar_width=10
  [[ $bar_width -gt 40 ]] && bar_width=40

  local filled=$((pct * bar_width / 100))
  local empty=$((bar_width - filled))

  local bar=""
  for ((j=0; j<filled; j++)); do bar+="$BAR_FILLED"; done
  for ((j=0; j<empty; j++)); do bar+="$BAR_EMPTY"; done

  local retry_info=""
  [[ $retries -gt 0 ]] && retry_info="  ${YELLOW}(${retries} retries)${RESET}"

  printf "\r\033[2K  ${DIM}%s${RESET} [${GREEN}%s${RESET}%s] %d/%d  %s/s  ETA %s%b" \
    "$label" "$bar" "" "$current" "$total" "$(format_bytes $speed)" "$eta_str" "$retry_info"
}

prompt_input() {
  local prompt=$1 default=$2
  local value
  if [[ -n "$default" ]]; then
    printf "  ${BOLD}%s${RESET} ${DIM}[%s]${RESET}: " "$prompt" "$default"
  else
    printf "  ${BOLD}%s${RESET}: " "$prompt"
  fi
  read -r value
  echo "${value:-$default}"
}

confirm_proceed() {
  if [[ "$AUTO_CONFIRM" == true ]]; then
    return 0
  fi
  echo ""
  printf "  ${BOLD}Proceed with upload?${RESET} [Y/n]: "
  local answer
  read -r answer
  if [[ "$answer" =~ ^[Nn] ]]; then
    print_info "Upload cancelled."
    exit 0
  fi
}

format_duration() {
  local total_sec=$1
  if [[ $total_sec -lt 60 ]]; then
    echo "${total_sec}s"
  elif [[ $total_sec -lt 3600 ]]; then
    echo "$((total_sec / 60))m $((total_sec % 60))s"
  else
    echo "$((total_sec / 3600))h $((total_sec % 3600 / 60))m"
  fi
}

format_bytes() {
  local bytes=$1
  if [[ $bytes -lt 1024 ]]; then
    echo "${bytes} B"
  elif [[ $bytes -lt 1048576 ]]; then
    echo "$((bytes / 1024)) KB"
  elif [[ $bytes -lt 1073741824 ]]; then
    local mb=$((bytes * 10 / 1048576))
    echo "$((mb / 10)).$((mb % 10)) MB"
  else
    local gb=$((bytes * 10 / 1073741824))
    echo "$((gb / 10)).$((gb % 10)) GB"
  fi
}

get_file_size() {
  local file=$1
  if [[ "$(uname)" == "Darwin" ]]; then
    stat -f%z "$file"
  else
    stat -c%s "$file"
  fi
}

# ============================================================
# SECTION 3: UTILITY FUNCTIONS
# ============================================================

# Append a timestamped line to the persistent log file (and nowhere else, so
# it never disrupts the progress UI). Safe to call before LOG_FILE is set.
log() {
  local level="$1"; shift
  [[ -z "$LOG_FILE" ]] && return 0
  printf '%s [%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$level" "$*" >> "$LOG_FILE"
}

# Perform an HTTP request with consistent timeouts, capturing status and body
# into the globals HTTP_STATUS / HTTP_BODY. The response body and HTTP status
# are separated so callers can classify failures (retry vs re-auth vs abort)
# and log the server's error message. Returns curl's exit code (0 on a
# completed request regardless of HTTP status; non-zero on network failure).
http_request() {
  local method="$1"; shift
  local url="$1"; shift
  # Remaining args are passed through to curl (headers, data, etc.).
  # CURL_NET_OPTS carries proxy / CA-bundle flags built by configure_network().
  # A caller may set HTTP_MAX_TIME to override the per-request total timeout
  # (used for the large S3 PUT); it defaults to MAX_TIME for the JSON calls.
  local raw curl_rc
  raw=$(curl -sS \
    --connect-timeout "$CONNECT_TIMEOUT" --max-time "${HTTP_MAX_TIME:-$MAX_TIME}" \
    "${CURL_NET_OPTS[@]}" \
    -w '\n%{http_code}' -X "$method" "$url" "$@" 2>>"$LOG_FILE")
  curl_rc=$?
  if [[ $curl_rc -ne 0 ]]; then
    HTTP_STATUS="000"
    HTTP_BODY="$raw"
    # curl rc 35/60 = TLS handshake/cert failure: the hallmark of a
    # TLS-inspecting corporate proxy without the right CA bundle installed.
    if [[ $curl_rc -eq 60 || $curl_rc -eq 35 ]]; then
      log "ERROR" "$method $url -> TLS error (curl rc=$curl_rc); likely HTTPS inspection. host=$(url_host_port "$url")"
    else
      log "ERROR" "$method $url -> network error (curl rc=$curl_rc); host=$(url_host_port "$url")"
    fi
    return $curl_rc
  fi
  HTTP_STATUS="${raw##*$'\n'}"
  HTTP_BODY="${raw%$'\n'*}"
  return 0
}

# Extract host:port from a URL for diagnostics — so a blocked non-443 port (or
# an unreachable custom domain) shows up clearly in logs rather than as a
# generic "connection failed".
url_host_port() {
  echo "$1" | python3 -c "import sys,urllib.parse as u; p=u.urlparse(sys.stdin.read().strip()); port=p.port or (443 if p.scheme=='https' else 80); print(f'{p.hostname}:{port}')" 2>/dev/null || echo "$1"
}

# Build curl proxy/CA options and export proxy env vars for the aws CLI. Field
# laptops on corporate/guest WiFi often must traverse an HTTP proxy and/or a
# TLS-inspecting gateway; curl and the aws CLI honour DIFFERENT env-var
# conventions, so set BOTH casings to avoid the "half the calls work" trap.
configure_network() {
  CURL_NET_OPTS=()
  if [[ -n "$PROXY_URL" ]]; then
    CURL_NET_OPTS+=(--proxy "$PROXY_URL")
    # curl reads lowercase https_proxy; aws/botocore reads uppercase. Set all.
    export https_proxy="$PROXY_URL" HTTPS_PROXY="$PROXY_URL"
    export http_proxy="$PROXY_URL"  HTTP_PROXY="$PROXY_URL"
    print_info "Using proxy: $PROXY_URL"
    log "INFO" "Proxy configured: $PROXY_URL"
  fi
  if [[ -n "$CA_BUNDLE" ]]; then
    if [[ ! -f "$CA_BUNDLE" ]]; then
      print_error "CA bundle not found: $CA_BUNDLE"
      exit 1
    fi
    CURL_NET_OPTS+=(--cacert "$CA_BUNDLE")
    export AWS_CA_BUNDLE="$CA_BUNDLE"      # aws CLI / botocore
    export CURL_CA_BUNDLE="$CA_BUNDLE"     # belt-and-braces for nested curls
    print_info "Using CA bundle: $CA_BUNDLE"
    log "INFO" "CA bundle configured: $CA_BUNDLE"
  fi
}

# Fast connectivity check BEFORE the expensive segmentation step, so a blocked
# network / missing proxy / captive portal fails in ~seconds rather than after
# minutes of ffmpeg work. Only needs outbound TCP 443 + DNS.
preflight_network() {
  local targets=(
    "https://cloudformation.$REGION.amazonaws.com"
    "https://cognito-idp.$REGION.amazonaws.com"
    "https://s3.$REGION.amazonaws.com"
  )
  local t http_code content_type rc
  for t in "${targets[@]}"; do
    # %{content_type} lets us spot a captive portal without buffering the body.
    local resp
    resp=$(curl -sS --connect-timeout 8 --max-time 15 \
      "${CURL_NET_OPTS[@]}" -o /dev/null -w '%{http_code} %{content_type}' "$t" 2>>"$LOG_FILE")
    rc=$?
    if [[ $rc -ne 0 ]]; then
      print_error "Cannot reach $(url_host_port "$t") on port 443."
      if [[ $rc -eq 60 || $rc -eq 35 ]]; then
        print_warning "HTTPS appears to be intercepted by your network. Ask IT for the"
        print_warning "corporate CA certificate and pass --ca-bundle <file>."
      else
        print_warning "On corporate/guest WiFi you may need a proxy (--proxy http://host:port"
        print_warning "or HTTPS_PROXY), or to finish a captive-portal login in your browser first."
      fi
      log "ERROR" "preflight failed for $t (curl rc=$rc)"
      return 1
    fi
    http_code="${resp%% *}"
    content_type="${resp#* }"
    # Captive-portal detection by CONTENT-TYPE, not status code or headers:
    # AWS service endpoints answer with text/plain, application/xml, or an empty
    # body (and a range of codes — e.g. cloudformation returns "200 healthy",
    # cognito a 400, s3 a 307). A portal hijacks the request and serves an HTML
    # login page, so text/html is the reliable signal that we're not talking to
    # AWS. Status/header heuristics false-positive across these varied endpoints.
    if [[ "$content_type" == *text/html* ]]; then
      print_error "Reached $(url_host_port "$t") (HTTP $http_code) but got an HTML page"
      print_warning "instead of an AWS response — likely a captive portal (public/cafe WiFi)."
      print_warning "Open a browser, complete the WiFi login, then re-run."
      log "ERROR" "captive-portal suspected: $t http=$http_code content_type=$content_type"
      return 1
    fi
    log "INFO" "preflight ok: $(url_host_port "$t") http=$http_code ct=${content_type:-none}"
  done
  print_success "Network reachable (outbound 443 OK)"
  return 0
}

# Classify an HTTP status for retry decisions:
#   "ok"      2xx                       -> success
#   "auth"    401                       -> re-authenticate then retry
#   "retry"   408/429/5xx/000(network)  -> transient, back off and retry
#   "fatal"   other 4xx                 -> permanent, abort with logged body
classify_status() {
  local code="$1"
  case "$code" in
    2*) echo "ok" ;;
    401) echo "auth" ;;
    408|429|5*|000) echo "retry" ;;
    *) echo "fatal" ;;
  esac
}

# PUT a TAMS resource (source/flow) through http_request so it inherits
# timeouts, proxy/CA options, status capture and logging. Owns its own
# success/failure messaging so call sites are a single bare statement (no
# fragile `api_put ... && print_success` chains that silently swallow failures
# under `set -e`).
#
# Args: <mode> <message> <url> <json-body>
#   mode = "required" -> on failure, print error and exit 1 (creation calls:
#                        uploading segments to a non-existent flow is pointless)
#   mode = "optional" -> on failure, warn and return 1 (finalisation calls:
#                        the bytes are already uploaded, so don't abort)
api_put() {
  local mode="$1" message="$2" url="$3" data="$4"
  if http_request PUT "$url" -H "$AUTH" -H "$CT" -d "$data" \
      && [[ "$(classify_status "$HTTP_STATUS")" == "ok" ]]; then
    print_success "$message"
    log "INFO" "$message ($url)"
    return 0
  fi
  log "ERROR" "$message: PUT $url http=$HTTP_STATUS body=$HTTP_BODY"
  if [[ "$mode" == "required" ]]; then
    print_error "$message failed (http=$HTTP_STATUS) — see $LOG_FILE. Aborting."
    exit 1
  fi
  print_warning "$message failed (http=$HTTP_STATUS) — see $LOG_FILE"
  return 1
}

# Set a source's metadata via its sub-resources. In the TAMS data model a
# source is auto-created by the flow that references it (you cannot PUT a whole
# source object — the API forbids it), so label/description/tags are set
# individually here. Best-effort: a failure is logged but never aborts, since
# the source and its essence already exist by this point.
# Args: <source-id> <label> <description>
set_source_metadata() {
  local source_id="$1" label="$2" description="$3"
  # JSON string values, hence the surrounding quotes in the payloads.
  http_request PUT "$API_ENDPOINT/sources/$source_id/label" \
    -H "$AUTH" -H "$CT" -d "\"$label\"" >/dev/null 2>&1 || true
  http_request PUT "$API_ENDPOINT/sources/$source_id/description" \
    -H "$AUTH" -H "$CT" -d "\"$description\"" >/dev/null 2>&1 || true
  http_request PUT "$API_ENDPOINT/sources/$source_id/tags/origin" \
    -H "$AUTH" -H "$CT" -d "\"tams-uploader\"" >/dev/null 2>&1 || true
  log "INFO" "source $source_id metadata set (label/description/tags)"
}

# Flow-body builders. Each takes the desired flow_status ("ingesting" or
# "ready") and emits the JSON for that flow, so the ingesting/ready payloads
# stay in one place instead of being duplicated at each call site. Rely on the
# probe globals (VIDEO_*, AUDIO_*) being populated.
video_flow_body() {
  local flow_status="$1"
  cat <<JSON
{
  "id": "$VIDEO_FLOW_ID",
  "source_id": "$VIDEO_SOURCE_ID",
  "format": "urn:x-nmos:format:video",
  "label": "$LABEL - Video (H.264)",
  "description": "Video flow: ${VIDEO_WIDTH}x${VIDEO_HEIGHT} @ ${VIDEO_FPS}",
  "tags": {"flow_status": "$flow_status"},
  "codec": "video/h264",
  "container": "video/mp2t",
  "avg_bit_rate": $VIDEO_BITRATE,
  "essence_parameters": {
    "frame_rate": {"numerator": $VIDEO_FPS_NUM, "denominator": $VIDEO_FPS_DEN},
    "frame_width": $VIDEO_WIDTH,
    "frame_height": $VIDEO_HEIGHT
  }
}
JSON
}

audio_flow_body() {
  local flow_status="$1"
  cat <<JSON
{
  "id": "$AUDIO_FLOW_ID",
  "source_id": "$AUDIO_SOURCE_ID",
  "format": "urn:x-nmos:format:audio",
  "label": "$LABEL - Audio (AAC)",
  "description": "Audio flow: ${AUDIO_SAMPLE_RATE}Hz ${AUDIO_CHANNELS}ch",
  "tags": {"flow_status": "$flow_status"},
  "codec": "audio/aac",
  "container": "video/mp2t",
  "avg_bit_rate": $AUDIO_BITRATE,
  "essence_parameters": {
    "sample_rate": $AUDIO_SAMPLE_RATE,
    "channels": $AUDIO_CHANNELS
  }
}
JSON
}

multi_flow_body() {
  local flow_status="$1"
  cat <<JSON
{
  "id": "$MULTI_FLOW_ID",
  "source_id": "$MULTI_SOURCE_ID",
  "format": "urn:x-nmos:format:multi",
  "label": "$LABEL",
  "description": "Combined video and audio flow",
  "tags": {"flow_status": "$flow_status"},
  "flow_collection": [
    {"id": "$VIDEO_FLOW_ID", "role": "video"},
    {"id": "$AUDIO_FLOW_ID", "role": "audio"}
  ]
}
JSON
}

generate_uuid() {
  python3 -c "import uuid; print(uuid.uuid4())"
}

# Convert a fractional-seconds value to the TAMS "<seconds>:<nanoseconds>"
# timestamp format. Single python invocation (not two) to keep the per-segment
# hot loop cheap; stderr to the log so a bad value doesn't corrupt the UI.
to_tams_time() {
  python3 -c "
import sys, math
s = float($1)
whole = int(math.floor(s))
nanos = int(round((s - whole) * 1_000_000_000))
print(f'{whole}:{nanos}')" 2>>"$LOG_FILE"
}

# Segment one track of the source with ffmpeg's HLS muxer and collect the
# resulting files and per-segment durations. Sets these globals for the caller:
#   SEGMENT_FILES[]      sorted .ts segment paths
#   SEGMENT_DURATIONS[]  matching EXTINF durations (seconds)
#   SEGMENT_TOTAL_SIZE   combined size in bytes
# Args: <track-label> <output-dir> <ffmpeg-codec/map-args>
# Aborts with a clear message (not a cryptic `ls`/`set -e` crash) if ffmpeg
# fails or produces no segments — the most likely failure for an unsupported
# or corrupt input file.
segment_track() {
  local track="$1" out_dir="$2" codec_args="$3"
  local manifest="$out_dir/manifest.m3u8"

  # ffmpeg stderr is captured to the log (not discarded) so a failure is
  # diagnosable. $codec_args is intentionally unquoted to word-split into flags.
  # shellcheck disable=SC2086
  ffmpeg -y -v error -i "$MP4_FILE" $codec_args \
    -f hls -hls_time "$SEGMENT_DURATION" -hls_list_size 0 \
    -hls_segment_type mpegts -hls_segment_filename "$out_dir/seg_%04d.ts" \
    "$manifest" >>"$LOG_FILE" 2>&1 &
  local ffmpeg_pid=$!
  show_spinner "$ffmpeg_pid" "Segmenting $track track..."
  if ! wait "$ffmpeg_pid"; then
    print_error "ffmpeg failed to segment the $track track (see $LOG_FILE)."
    print_warning "The source may use an unsupported codec or be corrupt."
    log "ERROR" "ffmpeg segmentation failed for $track track"
    exit 1
  fi

  # nullglob so a no-match glob yields an empty array rather than a literal
  # pattern; restore the previous setting afterwards.
  local had_nullglob=0
  shopt -q nullglob && had_nullglob=1
  shopt -s nullglob
  SEGMENT_FILES=("$out_dir"/seg_*.ts)
  [[ $had_nullglob -eq 0 ]] && shopt -u nullglob

  if [[ ${#SEGMENT_FILES[@]} -eq 0 ]]; then
    print_error "No $track segments were produced (see $LOG_FILE)."
    log "ERROR" "no segments produced for $track track"
    exit 1
  fi
  # Sort for deterministic ordering (glob is already sorted, but be explicit).
  # mapfile would be cleaner but is bash 4+; this split is the bash 3.2 idiom
  # and is safe here (segment paths contain no whitespace).
  # shellcheck disable=SC2207
  SEGMENT_FILES=($(printf '%s\n' "${SEGMENT_FILES[@]}" | sort))

  # shellcheck disable=SC2207
  SEGMENT_DURATIONS=($(grep '^#EXTINF:' "$manifest" | sed 's/#EXTINF:\([0-9.]*\).*/\1/'))

  SEGMENT_TOTAL_SIZE=0
  local seg
  for seg in "${SEGMENT_FILES[@]}"; do
    SEGMENT_TOTAL_SIZE=$((SEGMENT_TOTAL_SIZE + $(get_file_size "$seg")))
  done
}

cleanup() {
  tput cnorm 2>/dev/null || true
  if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then
    rm -rf "$WORK_DIR"
  fi
}

trap cleanup EXIT INT TERM

check_dependencies() {
  local all_ok=true
  for cmd in ffmpeg ffprobe aws curl python3; do
    if command -v "$cmd" >/dev/null 2>&1; then
      print_success "$cmd found"
    else
      print_error "$cmd is required but not installed"
      all_ok=false
    fi
  done
  if [[ "$all_ok" != true ]]; then
    echo ""
    print_error "Missing dependencies. Please install them and retry."
    exit 1
  fi
}

# ============================================================
# SECTION 4: CORE TAMS FUNCTIONS
# ============================================================

# Inspect an aws CLI error message for the common field-laptop failure modes
# and give the user the right next step instead of a raw stack trace.
diagnose_aws_error() {
  local err="$1"
  if echo "$err" | grep -qiE 'RequestTimeTooSkewed|Signature.*not yet|too skewed|InvalidSignatureException'; then
    print_error "AWS rejected the request due to clock skew."
    print_warning "Your laptop clock reads $(date '+%Y-%m-%d %H:%M:%S %z')."
    print_warning "Enable automatic network time (System Settings > Date & Time) and retry."
    log "ERROR" "clock skew detected; local time $(date '+%Y-%m-%dT%H:%M:%S%z'); aws err: $err"
  elif echo "$err" | grep -qiE 'could not connect|connection.*timed out|EndpointConnectionError|ProxyError'; then
    print_error "Could not reach AWS — connection blocked or proxy needed."
    print_warning "On corporate/guest WiFi try --proxy http://host:port (or HTTPS_PROXY)."
    log "ERROR" "aws connection error: $err"
  elif echo "$err" | grep -qiE 'SSLError|certificate verify failed|CERTIFICATE'; then
    print_error "TLS verification failed — your network may inspect HTTPS."
    print_warning "Ask IT for the corporate CA certificate and pass --ca-bundle <file>."
    log "ERROR" "aws TLS error: $err"
  else
    log "ERROR" "aws error: $err"
  fi
}

authenticate() {
  local aws_out
  # Capture stdout+stderr together so we can diagnose clock skew, proxy and
  # TLS-inspection failures that would otherwise surface as an empty endpoint.
  aws_out=$(aws cloudformation describe-stacks --stack-name "$API_STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text 2>&1) || true
  if [[ -z "$aws_out" || "$aws_out" == "None" || "$aws_out" == *"error"* || "$aws_out" == *"Error"* || "$aws_out" == *"Exception"* ]]; then
    if [[ -z "$aws_out" || "$aws_out" == "None" ]]; then
      print_error "Stack '$API_STACK' has no ApiEndpoint output in region $REGION."
      log "ERROR" "missing ApiEndpoint output for stack $API_STACK in $REGION"
    else
      diagnose_aws_error "$aws_out"
    fi
    print_error "Authentication failed (see $LOG_FILE)"
    return 1
  fi
  API_ENDPOINT="$aws_out"
  USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name $API_STACK --region $REGION \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
  CLIENT_ID=$(aws cloudformation describe-stacks --stack-name $API_STACK --region $REGION \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text)
  TOKEN_URL=$(aws cloudformation describe-stacks --stack-name $API_STACK --region $REGION \
    --query "Stacks[0].Outputs[?OutputKey=='TokenUrl'].OutputValue" --output text)

  CLIENT_SECRET=$(aws cognito-idp describe-user-pool-client \
    --user-pool-id "$USER_POOL_ID" --client-id "$CLIENT_ID" --region $REGION \
    --query "UserPoolClient.ClientSecret" --output text)

  local token_response now expires_in
  now=$(date +%s)
  token_response=$(curl -sS --connect-timeout "$CONNECT_TIMEOUT" --max-time "$MAX_TIME" \
    "${CURL_NET_OPTS[@]}" \
    -X POST "$TOKEN_URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=$CLIENT_ID&client_secret=$CLIENT_SECRET&scope=tams-api/read tams-api/write tams-api/delete" 2>>"$LOG_FILE")

  TOKEN=$(echo "$token_response" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])") || {
    log "ERROR" "Failed to obtain access token: $token_response"
    print_error "Authentication failed (see $LOG_FILE)"
    return 1
  }
  # expires_in is seconds-to-live; default to 3600 if the field is absent.
  expires_in=$(echo "$token_response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('expires_in', 3600))" 2>/dev/null || echo 3600)
  TOKEN_EXPIRY_EPOCH=$((now + expires_in))

  AUTH="Authorization: Bearer $TOKEN"
  CT="Content-Type: application/json"
  log "INFO" "Authenticated; token valid for ${expires_in}s"
}

# Re-authenticate if the token is missing or within the refresh margin of
# expiry. Called before each segment so long uploads never run on a stale token.
ensure_token_fresh() {
  local now
  now=$(date +%s)
  if [[ $((TOKEN_EXPIRY_EPOCH - now)) -le $TOKEN_REFRESH_MARGIN_SEC ]]; then
    log "INFO" "Token near expiry; refreshing"
    authenticate
  fi
}

# Handle a non-success status inside the retry loop. Sets the global
# FAILURE_DECISION to "continue" (caller should retry) or "abort" (permanent
# failure). On a 401 it re-authenticates. In the parallel path this runs inside
# the worker subshell, so the refreshed token is intentionally subshell-local
# (it heals that worker's remaining retries; new workers get a fresh token from
# the parent's own ensure_token_fresh before they fork).
# Args: <step-label> <segment-file>
handle_failure() {
  local step="$1" segment_file="$2"
  local kind
  kind=$(classify_status "$HTTP_STATUS")
  case "$kind" in
    auth)
      log "WARN" "$step seg=$(basename "$segment_file") http=401 -> re-authenticating"
      authenticate
      FAILURE_DECISION="continue" ;;
    retry)
      log "WARN" "$step seg=$(basename "$segment_file") http=$HTTP_STATUS -> transient, backoff ${RETRY_BACKOFF}s; body=${HTTP_BODY}"
      sleep "$RETRY_BACKOFF"
      RETRY_BACKOFF=$((RETRY_BACKOFF * 2))
      FAILURE_DECISION="continue" ;;
    *)
      log "ERROR" "$step seg=$(basename "$segment_file") http=$HTTP_STATUS -> fatal; body=${HTTP_BODY}"
      FAILURE_DECISION="abort" ;;
  esac
}

upload_segment_with_retry() {
  local flow_id="$1"
  local segment_file="$2"
  local start_time="$3"
  local end_time="$4"
  local attempt=0
  RETRY_BACKOFF=$INITIAL_BACKOFF_SEC
  local file_size
  file_size=$(get_file_size "$segment_file")
  local seg_name
  seg_name=$(basename "$segment_file")

  # Refresh the token proactively so we don't waste an attempt on a 401.
  ensure_token_fresh

  while [[ $attempt -lt $MAX_RETRIES ]]; do
    FAILURE_DECISION=""

    # --- Step 1: request a storage URL ---
    if ! http_request POST "$API_ENDPOINT/flows/$flow_id/storage" \
      -H "$AUTH" -H "$CT" -d '{"limit": 1}'; then
      handle_failure "storage" "$segment_file"
      ((attempt++)) || true; ((TOTAL_RETRIES++)) || true
      [[ "$FAILURE_DECISION" == "abort" ]] && break || continue
    fi
    if [[ "$(classify_status "$HTTP_STATUS")" != "ok" ]]; then
      handle_failure "storage" "$segment_file"
      ((attempt++)) || true; ((TOTAL_RETRIES++)) || true
      [[ "$FAILURE_DECISION" == "abort" ]] && break || continue
    fi

    # Extract all three fields in ONE python call. A single point of failure
    # handling here means a malformed storage response fails the attempt
    # cleanly, rather than silently baking empty values into the S3 PUT and
    # the segment-register payload. Tab-separated so values can't be confused.
    local put_url content_type object_id storage_response="$HTTP_BODY" parsed
    parsed=$(echo "$storage_response" | python3 -c "
import sys, json
o = json.load(sys.stdin)['media_objects'][0]
print(o['put_url']['url'], o['put_url']['content-type'], o['object_id'], sep='\t')" 2>>"$LOG_FILE") || {
      log "ERROR" "storage seg=$seg_name -> malformed response; body=$storage_response"
      ((attempt++)) || true; ((TOTAL_RETRIES++)) || true
      sleep "$RETRY_BACKOFF"; RETRY_BACKOFF=$((RETRY_BACKOFF * 2)); continue
    }
    IFS=$'\t' read -r put_url content_type object_id <<< "$parsed"

    # --- Step 2: PUT the segment bytes to S3 ---
    # Allow a longer timeout for the binary transfer than for JSON API calls.
    if ! HTTP_MAX_TIME="$UPLOAD_MAX_TIME" \
        http_request PUT "$put_url" -H "Content-Type: $content_type" --data-binary "@$segment_file"; then
      handle_failure "s3-put" "$segment_file"
      ((attempt++)) || true; ((TOTAL_RETRIES++)) || true
      [[ "$FAILURE_DECISION" == "abort" ]] && break || continue
    fi
    if [[ "$(classify_status "$HTTP_STATUS")" != "ok" ]]; then
      handle_failure "s3-put" "$segment_file"
      ((attempt++)) || true; ((TOTAL_RETRIES++)) || true
      [[ "$FAILURE_DECISION" == "abort" ]] && break || continue
    fi

    # --- Step 3: register the segment timerange ---
    if ! http_request POST "$API_ENDPOINT/flows/$flow_id/segments" \
      -H "$AUTH" -H "$CT" -d "{
      \"object_id\": \"$object_id\",
      \"timerange\": \"[${start_time}_${end_time})\"
    }"; then
      handle_failure "register" "$segment_file"
      ((attempt++)) || true; ((TOTAL_RETRIES++)) || true
      [[ "$FAILURE_DECISION" == "abort" ]] && break || continue
    fi
    if [[ "$(classify_status "$HTTP_STATUS")" != "ok" ]]; then
      handle_failure "register" "$segment_file"
      ((attempt++)) || true; ((TOTAL_RETRIES++)) || true
      [[ "$FAILURE_DECISION" == "abort" ]] && break || continue
    fi

    TOTAL_BYTES_UPLOADED=$((TOTAL_BYTES_UPLOADED + file_size))
    log "INFO" "uploaded seg=$seg_name bytes=$file_size object_id=$object_id timerange=[${start_time}_${end_time}) attempts=$((attempt + 1))"
    return 0
  done

  print_error "Failed to upload segment $seg_name after $attempt attempt(s) (last http=$HTTP_STATUS, see $LOG_FILE)"
  log "ERROR" "GIVING UP seg=$seg_name after $attempt attempts; last http=$HTTP_STATUS"
  return 1
}

# Upload one segment in an isolated subshell and record the outcome to a result
# file ($RESULT_DIR/<index>) as "<status> <bytes> <retries>". Running in a
# subshell means global mutations (TOTAL_BYTES_UPLOADED/TOTAL_RETRIES) stay
# local to the worker; the parent aggregates them when reaping. This keeps the
# parallel path correct on bash 3.2, which lacks namerefs and `wait -n`.
upload_worker() {
  local idx="$1" flow_id="$2" segment_file="$3" start_time="$4" end_time="$5"
  TOTAL_BYTES_UPLOADED=0
  TOTAL_RETRIES=0
  if upload_segment_with_retry "$flow_id" "$segment_file" "$start_time" "$end_time"; then
    printf 'ok %s %s\n' "$TOTAL_BYTES_UPLOADED" "$TOTAL_RETRIES" > "$RESULT_DIR/$idx"
  else
    printf 'fail %s %s\n' "$TOTAL_BYTES_UPLOADED" "$TOTAL_RETRIES" > "$RESULT_DIR/$idx"
  fi
}

# Drive uploads for one track with bounded concurrency. Args:
#   $1 flow_id  $2 label  $3 name of segments array  $4 name of durations array
# Aggregates per-worker results into TOTAL_BYTES_UPLOADED/TOTAL_RETRIES and
# populates FAILED_SEGMENTS. Continues past individual failures so we can report
# partial state rather than abort mid-flight (and leave the flow stuck).
upload_track() {
  local flow_id="$1" label="$2"
  # bash 3.2-compatible indirect array access via eval.
  local segs_var="$3" durs_var="$4"
  local count; eval "count=\${#${segs_var}[@]}"
  FAILED_SEGMENTS=()
  RESULT_DIR=$(mktemp -d "${WORK_DIR}/results.XXXXXX")

  local cumulative=0 i=0
  local pids=() pid_idx=()
  local completed=0

  while [[ $i -lt $count || ${#pids[@]} -gt 0 ]]; do
    # Fill the window up to MAX_PARALLEL_UPLOADS.
    while [[ $i -lt $count && ${#pids[@]} -lt $MAX_PARALLEL_UPLOADS ]]; do
      local seg dur start_t end_t
      eval "seg=\${${segs_var}[$i]}"
      eval "dur=\${${durs_var}[$i]}"
      start_t=$(to_tams_time "$cumulative")
      cumulative=$(python3 -c "print($cumulative + $dur)" 2>>"$LOG_FILE")
      end_t=$(to_tams_time "$cumulative")
      # Refresh the token in the PARENT before spawning, so each NEW child forks
      # with a fresh token. In-flight children that started earlier self-recover
      # via their own 401 -> re-auth path inside their subshell.
      ensure_token_fresh
      upload_worker "$i" "$flow_id" "$seg" "$start_t" "$end_t" &
      pids+=("$!"); pid_idx+=("$i")
      ((i++)) || true
    done

    # Reap any finished workers (poll; bash 3.2 has no `wait -n`).
    local new_pids=() new_idx=() j=0
    for j in "${!pids[@]}"; do
      local pid="${pids[$j]}" idx="${pid_idx[$j]}"
      if kill -0 "$pid" 2>/dev/null; then
        new_pids+=("$pid"); new_idx+=("$idx")
      else
        wait "$pid" 2>/dev/null || true
        # Default all three fields: a worker killed before writing its result
        # file (e.g. SIGTERM mid-upload) must count as a failure, not skew totals.
        local r_status="fail" r_bytes=0 r_retries=0
        read -r r_status r_bytes r_retries < "$RESULT_DIR/$idx" 2>/dev/null || true
        TOTAL_BYTES_UPLOADED=$((TOTAL_BYTES_UPLOADED + ${r_bytes:-0}))
        TOTAL_RETRIES=$((TOTAL_RETRIES + ${r_retries:-0}))
        [[ "$r_status" != "ok" ]] && FAILED_SEGMENTS+=("$idx")
        ((completed++)) || true
        draw_progress_bar "$completed" "$count" "$TOTAL_BYTES_UPLOADED" "$UPLOAD_START_EPOCH" "$TOTAL_RETRIES" "$label"
      fi
    done
    pids=("${new_pids[@]}"); pid_idx=("${new_idx[@]}")
    # Small poll delay while the window is full or we're draining the tail.
    # `|| true` so the false branch doesn't trip `set -e`.
    if [[ ${#pids[@]} -ge $MAX_PARALLEL_UPLOADS || ( $i -ge $count && ${#pids[@]} -gt 0 ) ]]; then
      sleep 0.2
    fi
  done
  echo ""
}

# ============================================================
# SECTION 5: INPUT HANDLING
# ============================================================

AUTO_CONFIRM=false
MP4_FILE=""
SEGMENT_DURATION=$DEFAULT_SEGMENT_DURATION
LABEL=""

usage() {
  cat <<EOF
  Usage: tams-upload.sh [options] [FILE] [SEGMENT_DURATION] [LABEL]

  Options:
    -y, --yes              Skip the confirmation prompt (non-interactive)
        --proxy URL        HTTP/HTTPS proxy for corporate/guest WiFi
                           (e.g. http://proxy.corp:8080). Also honours
                           HTTPS_PROXY / TAMS_PROXY.
        --ca-bundle FILE   CA certificate bundle for networks that inspect
                           HTTPS traffic. Also honours TAMS_CA_BUNDLE.
    -h, --help             Show this help

  Network: this tool only needs outbound TCP 443 (HTTPS) + DNS.
EOF
}

parse_args() {
  local positional=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes|-y) AUTO_CONFIRM=true ;;
      --proxy) PROXY_URL="$2"; shift ;;
      --proxy=*) PROXY_URL="${1#*=}" ;;
      --ca-bundle) CA_BUNDLE="$2"; shift ;;
      --ca-bundle=*) CA_BUNDLE="${1#*=}" ;;
      -h|--help) usage; exit 0 ;;
      *) positional+=("$1") ;;
    esac
    shift
  done

  if [[ ${#positional[@]} -gt 0 ]]; then
    MP4_FILE="${positional[0]}"
  fi
  if [[ ${#positional[@]} -gt 1 ]]; then
    SEGMENT_DURATION="${positional[1]}"
  fi
  if [[ ${#positional[@]} -gt 2 ]]; then
    LABEL="${positional[2]}"
  fi
}

interactive_input() {
  print_header "Configuration"

  while true; do
    MP4_FILE=$(prompt_input "Path to media file" "")
    if [[ -f "$MP4_FILE" ]]; then
      break
    fi
    print_error "File not found: $MP4_FILE"
  done

  local default_label
  default_label=$(basename "$MP4_FILE" .mp4)
  LABEL=$(prompt_input "Label for this content" "$default_label")
  SEGMENT_DURATION=$(prompt_input "Segment duration (seconds)" "$DEFAULT_SEGMENT_DURATION")
}

# ============================================================
# SECTION 6: MAIN ORCHESTRATION
# ============================================================

main() {
  show_title
  parse_args "$@"

  # --- Logging ---
  # Persist to a stable path (not $WORK_DIR, which the cleanup trap removes) so
  # the log survives for post-mortem inspection after a failed run.
  LOG_FILE="${TAMS_LOG_FILE:-${TMPDIR:-/tmp}/tams-upload-$SCRIPT_START_EPOCH.log}"
  : > "$LOG_FILE" 2>/dev/null || LOG_FILE=""
  [[ -n "$LOG_FILE" ]] && print_info "Logging to $LOG_FILE"
  log "INFO" "tams-upload starting; region=$REGION stack=$API_STACK"

  # --- Dependencies ---
  print_header "Checking Dependencies"
  check_dependencies

  # --- Network setup ---
  # Configure proxy/CA before any network call so the aws CLI and curl agree.
  configure_network

  # --- Input ---
  if [[ -z "$MP4_FILE" ]]; then
    interactive_input
  else
    if [[ ! -f "$MP4_FILE" ]]; then
      print_error "File not found: $MP4_FILE"
      exit 1
    fi
    [[ -z "$LABEL" ]] && LABEL=$(basename "$MP4_FILE" .mp4)
  fi

  # --- Summary ---
  print_header "Upload Configuration"
  printf "  ${BOLD}File:${RESET}      %s\n" "$(basename "$MP4_FILE")"
  printf "  ${BOLD}Path:${RESET}      %s\n" "$MP4_FILE"
  printf "  ${BOLD}Size:${RESET}      %s\n" "$(format_bytes "$(get_file_size "$MP4_FILE")")"
  printf "  ${BOLD}Label:${RESET}     %s\n" "$LABEL"
  printf "  ${BOLD}Segments:${RESET}  %ss each\n" "$SEGMENT_DURATION"
  confirm_proceed

  # --- Preflight ---
  # Check connectivity BEFORE the expensive ffmpeg segmentation so a blocked
  # network / missing proxy / captive portal fails in seconds, not minutes.
  print_header "Checking Network"
  if ! preflight_network; then
    print_error "Network preflight failed — see $LOG_FILE. Aborting before segmentation."
    exit 1
  fi

  # --- Probe ---
  print_header "Analysing Media"

  VIDEO_CODEC=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$MP4_FILE")
  VIDEO_WIDTH=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=width -of csv=p=0 "$MP4_FILE")
  VIDEO_HEIGHT=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=height -of csv=p=0 "$MP4_FILE")
  VIDEO_FPS=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$MP4_FILE")
  VIDEO_BITRATE=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=bit_rate -of csv=p=0 "$MP4_FILE")

  # This tool segments the video track, so a missing video stream is fatal.
  if [[ -z "$VIDEO_CODEC" ]]; then
    print_error "No video stream found in $(basename "$MP4_FILE")."
    print_warning "This tool requires an H.264 video track. For audio-only or other"
    print_warning "formats, use the server-side ingest-ffmpeg component instead."
    log "ERROR" "no video stream in $MP4_FILE"
    exit 1
  fi

  VIDEO_FPS_NUM=$(echo "$VIDEO_FPS" | cut -d'/' -f1)
  VIDEO_FPS_DEN=$(echo "$VIDEO_FPS" | cut -d'/' -f2)
  # Some containers report a bare integer frame rate (no "/"), leaving the
  # denominator empty and producing invalid JSON. Default it to 1.
  VIDEO_FPS_DEN=${VIDEO_FPS_DEN:-1}

  AUDIO_CODEC=$(ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$MP4_FILE")
  HAS_AUDIO=false
  if [[ -n "$AUDIO_CODEC" ]]; then
    HAS_AUDIO=true
    AUDIO_SAMPLE_RATE=$(ffprobe -v quiet -select_streams a:0 -show_entries stream=sample_rate -of csv=p=0 "$MP4_FILE")
    AUDIO_CHANNELS=$(ffprobe -v quiet -select_streams a:0 -show_entries stream=channels -of csv=p=0 "$MP4_FILE")
    AUDIO_BITRATE=$(ffprobe -v quiet -select_streams a:0 -show_entries stream=bit_rate -of csv=p=0 "$MP4_FILE")
    AUDIO_BITRATE=${AUDIO_BITRATE:-192000}
  fi

  VIDEO_BITRATE=${VIDEO_BITRATE:-5000000}

  print_success "Video: ${VIDEO_CODEC} ${VIDEO_WIDTH}x${VIDEO_HEIGHT} @ ${VIDEO_FPS} fps"
  if [[ "$HAS_AUDIO" == true ]]; then
    print_success "Audio: ${AUDIO_CODEC} ${AUDIO_SAMPLE_RATE}Hz ${AUDIO_CHANNELS}ch"
  else
    print_info "Audio: none detected (video-only upload)"
  fi

  # --- Segment ---
  print_header "Segmenting Media"

  WORK_DIR=$(mktemp -d)
  VIDEO_DIR="$WORK_DIR/video"
  mkdir -p "$VIDEO_DIR"

  segment_track video "$VIDEO_DIR" "-c:v copy -an -map 0:v:0"
  VIDEO_SEGMENTS=("${SEGMENT_FILES[@]}")
  # VIDEO_DURATIONS is consumed by upload_track via eval indirection.
  # shellcheck disable=SC2034
  VIDEO_DURATIONS=("${SEGMENT_DURATIONS[@]}")
  print_success "Video: ${#VIDEO_SEGMENTS[@]} segments ($(format_bytes "$SEGMENT_TOTAL_SIZE"))"

  if [[ "$HAS_AUDIO" == true ]]; then
    AUDIO_DIR="$WORK_DIR/audio"
    mkdir -p "$AUDIO_DIR"
    segment_track audio "$AUDIO_DIR" "-c:a copy -vn -map 0:a:0"
    AUDIO_SEGMENTS=("${SEGMENT_FILES[@]}")
    # AUDIO_DURATIONS is consumed by upload_track via eval indirection.
    # shellcheck disable=SC2034
    AUDIO_DURATIONS=("${SEGMENT_DURATIONS[@]}")
    print_success "Audio: ${#AUDIO_SEGMENTS[@]} segments ($(format_bytes "$SEGMENT_TOTAL_SIZE"))"
  fi

  # --- Authenticate ---
  print_header "Connecting to TAMS"
  print_info "Authenticating with AWS Cognito..."
  authenticate
  print_success "Connected to: $API_ENDPOINT"

  # --- Generate IDs ---
  VIDEO_SOURCE_ID=$(generate_uuid)
  AUDIO_SOURCE_ID=$(generate_uuid)
  MULTI_SOURCE_ID=$(generate_uuid)
  VIDEO_FLOW_ID=$(generate_uuid)
  AUDIO_FLOW_ID=$(generate_uuid)
  MULTI_FLOW_ID=$(generate_uuid)

  # --- Create Flows (sources are auto-created from them) ---
  # In the TAMS data model a source is derived from the flow(s) that reference
  # it; the API does not accept a whole-source PUT. So we create flows here and
  # then enrich each auto-created source's metadata via its sub-resources.
  print_header "Registering Media"
  local base_name
  base_name=$(basename "$MP4_FILE")

  api_put required "Video Flow created (status: ingesting)" "$API_ENDPOINT/flows/$VIDEO_FLOW_ID" "$(video_flow_body ingesting)"
  set_source_metadata "$VIDEO_SOURCE_ID" "$LABEL - Video" "Video source from: $base_name"

  if [[ "$HAS_AUDIO" == true ]]; then
    api_put required "Audio Flow created (status: ingesting)" "$API_ENDPOINT/flows/$AUDIO_FLOW_ID" "$(audio_flow_body ingesting)"
    set_source_metadata "$AUDIO_SOURCE_ID" "$LABEL - Audio" "Audio source from: $base_name"
  fi

  # --- Create Multi Flow early so it appears in portal immediately ---
  if [[ "$HAS_AUDIO" == true ]]; then
    api_put required "Multi Flow created (status: ingesting)" "$API_ENDPOINT/flows/$MULTI_FLOW_ID" "$(multi_flow_body ingesting)"
    set_source_metadata "$MULTI_SOURCE_ID" "$LABEL" "Combined programme from: $base_name"
  fi

  # --- Upload Video Segments ---
  print_header "Uploading Video Segments ($MAX_PARALLEL_UPLOADS parallel)"
  UPLOAD_START_EPOCH=$(date +%s)

  TOTAL_BYTES_UPLOADED=0
  TOTAL_RETRIES=0
  upload_track "$VIDEO_FLOW_ID" "Video" VIDEO_SEGMENTS VIDEO_DURATIONS
  local video_failures=("${FAILED_SEGMENTS[@]}")
  if [[ ${#video_failures[@]} -eq 0 ]]; then
    print_success "Video upload complete (${#VIDEO_SEGMENTS[@]} segments)"
  else
    print_warning "Video upload finished with ${#video_failures[@]} failed segment(s): ${video_failures[*]}"
  fi

  # --- Upload Audio Segments ---
  local audio_failures=()
  if [[ "$HAS_AUDIO" == true ]]; then
    print_header "Uploading Audio Segments ($MAX_PARALLEL_UPLOADS parallel)"
    upload_track "$AUDIO_FLOW_ID" "Audio" AUDIO_SEGMENTS AUDIO_DURATIONS
    audio_failures=("${FAILED_SEGMENTS[@]}")
    if [[ ${#audio_failures[@]} -eq 0 ]]; then
      print_success "Audio upload complete (${#AUDIO_SEGMENTS[@]} segments)"
    else
      print_warning "Audio upload finished with ${#audio_failures[@]} failed segment(s): ${audio_failures[*]}"
    fi
  fi

  # --- Mark Flows Complete ---
  # Only advance a flow to "ready" if every one of its segments uploaded;
  # otherwise leave it "ingesting" so operators don't preview an incomplete
  # flow, and the run can be retried.
  print_header "Finalising"

  if [[ ${#video_failures[@]} -eq 0 ]]; then
    api_put optional "Video flow marked ready" "$API_ENDPOINT/flows/$VIDEO_FLOW_ID" "$(video_flow_body ready)"
  else
    print_warning "Video flow left 'ingesting' due to failed segments"
    log "WARN" "Video flow $VIDEO_FLOW_ID left ingesting; failed=${video_failures[*]}"
  fi

  if [[ "$HAS_AUDIO" == true ]]; then
    if [[ ${#audio_failures[@]} -eq 0 ]]; then
      api_put optional "Audio flow marked ready" "$API_ENDPOINT/flows/$AUDIO_FLOW_ID" "$(audio_flow_body ready)"
    else
      print_warning "Audio flow left 'ingesting' due to failed segments"
      log "WARN" "Audio flow $AUDIO_FLOW_ID left ingesting; failed=${audio_failures[*]}"
    fi
  fi

  # --- Mark Multi Flow ready (only if BOTH tracks fully uploaded) ---
  if [[ "$HAS_AUDIO" == true ]]; then
    if [[ ${#video_failures[@]} -eq 0 && ${#audio_failures[@]} -eq 0 ]]; then
      api_put optional "Multi flow marked ready" "$API_ENDPOINT/flows/$MULTI_FLOW_ID" "$(multi_flow_body ready)"
    else
      print_warning "Multi flow left 'ingesting' — one or more tracks incomplete"
      log "WARN" "Multi flow $MULTI_FLOW_ID left ingesting"
    fi
  fi

  # --- Completion Report ---
  local total_time=$(($(date +%s) - SCRIPT_START_EPOCH))
  local total_failures=$(( ${#video_failures[@]} + ${#audio_failures[@]} ))

  if [[ $total_failures -eq 0 ]]; then
    print_header "Upload Complete"
  else
    print_header "Upload Completed With Errors"
  fi
  printf "  ${GREEN}✓${RESET} ${BOLD}Total time:${RESET}        %s\n" "$(format_duration $total_time)"
  printf "  ${GREEN}✓${RESET} ${BOLD}Video segments:${RESET}    %d/%d uploaded\n" \
    "$(( ${#VIDEO_SEGMENTS[@]} - ${#video_failures[@]} ))" "${#VIDEO_SEGMENTS[@]}"
  if [[ "$HAS_AUDIO" == true ]]; then
    printf "  ${GREEN}✓${RESET} ${BOLD}Audio segments:${RESET}    %d/%d uploaded\n" \
      "$(( ${#AUDIO_SEGMENTS[@]} - ${#audio_failures[@]} ))" "${#AUDIO_SEGMENTS[@]}"
  fi
  printf "  ${GREEN}✓${RESET} ${BOLD}Data transferred:${RESET}  %s\n" "$(format_bytes $TOTAL_BYTES_UPLOADED)"
  if [[ $TOTAL_RETRIES -gt 0 ]]; then
    printf "  ${YELLOW}!${RESET} ${BOLD}Retries needed:${RESET}    %d\n" "$TOTAL_RETRIES"
  fi
  if [[ $total_failures -gt 0 ]]; then
    printf "  ${RED}✗${RESET} ${BOLD}Failed segments:${RESET}   %d (flow(s) left 'ingesting'; see %s)\n" \
      "$total_failures" "$LOG_FILE"
  fi
  echo ""
  printf "  ${CYAN}${BOLD}Flow IDs:${RESET}\n"
  printf "    Video: %s\n" "$VIDEO_FLOW_ID"
  if [[ "$HAS_AUDIO" == true ]]; then
    printf "    Audio: %s\n" "$AUDIO_FLOW_ID"
    printf "    Multi: %s\n" "$MULTI_FLOW_ID"
  fi
  echo ""
  printf "  ${BOLD}View in browser:${RESET} ${CYAN}http://localhost:5173${RESET}\n"
  echo ""
}

main "$@"
