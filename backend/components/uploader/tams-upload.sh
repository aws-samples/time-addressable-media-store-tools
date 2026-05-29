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

REGION="${TAMS_REGION:-ap-southeast-2}"
API_STACK="${TAMS_STACK_NAME:-tams-api}"

TOTAL_BYTES_UPLOADED=0
TOTAL_RETRIES=0
UPLOAD_START_EPOCH=0
SCRIPT_START_EPOCH=$(date +%s)
WORK_DIR=""

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
  ║            U P L O A D E R   v2.0                        ║
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
  local now=$(date +%s)
  local elapsed=$((now - start))
  local term_width=$(get_terminal_width)

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

generate_uuid() {
  python3 -c "import uuid; print(uuid.uuid4())"
}

to_tams_time() {
  local seconds="$1"
  local whole_sec=$(python3 -c "import math; print(int(math.floor($seconds)))")
  local nanos=$(python3 -c "print(int(round(($seconds - int($seconds)) * 1000000000)))")
  echo "${whole_sec}:${nanos}"
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

authenticate() {
  API_ENDPOINT=$(aws cloudformation describe-stacks --stack-name $API_STACK --region $REGION \
    --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text)
  USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name $API_STACK --region $REGION \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
  CLIENT_ID=$(aws cloudformation describe-stacks --stack-name $API_STACK --region $REGION \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text)
  TOKEN_URL=$(aws cloudformation describe-stacks --stack-name $API_STACK --region $REGION \
    --query "Stacks[0].Outputs[?OutputKey=='TokenUrl'].OutputValue" --output text)

  CLIENT_SECRET=$(aws cognito-idp describe-user-pool-client \
    --user-pool-id "$USER_POOL_ID" --client-id "$CLIENT_ID" --region $REGION \
    --query "UserPoolClient.ClientSecret" --output text)

  TOKEN=$(curl -s -X POST "$TOKEN_URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=$CLIENT_ID&client_secret=$CLIENT_SECRET&scope=tams-api/read tams-api/write tams-api/delete" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

  AUTH="Authorization: Bearer $TOKEN"
  CT="Content-Type: application/json"
}

upload_segment_with_retry() {
  local flow_id="$1"
  local segment_file="$2"
  local start_time="$3"
  local end_time="$4"
  local attempt=0
  local backoff=$INITIAL_BACKOFF_SEC
  local file_size
  file_size=$(get_file_size "$segment_file")

  while [[ $attempt -lt $MAX_RETRIES ]]; do
    local storage_response
    if ! storage_response=$(curl -sf -X POST "$API_ENDPOINT/flows/$flow_id/storage" \
      -H "$AUTH" -H "$CT" -d '{"limit": 1}' 2>/dev/null); then
      ((attempt++)) || true
      ((TOTAL_RETRIES++)) || true
      sleep $backoff
      backoff=$((backoff * 2))
      continue
    fi

    local put_url content_type object_id
    put_url=$(echo "$storage_response" | python3 -c "import sys,json; print(json.load(sys.stdin)['media_objects'][0]['put_url']['url'])")
    content_type=$(echo "$storage_response" | python3 -c "import sys,json; print(json.load(sys.stdin)['media_objects'][0]['put_url']['content-type'])")
    object_id=$(echo "$storage_response" | python3 -c "import sys,json; print(json.load(sys.stdin)['media_objects'][0]['object_id'])")

    if ! curl -sf -X PUT "$put_url" -H "Content-Type: $content_type" --data-binary "@$segment_file" > /dev/null 2>&1; then
      ((attempt++)) || true
      ((TOTAL_RETRIES++)) || true
      sleep $backoff
      backoff=$((backoff * 2))
      continue
    fi

    if ! curl -sf -X POST "$API_ENDPOINT/flows/$flow_id/segments" \
      -H "$AUTH" -H "$CT" -d "{
      \"object_id\": \"$object_id\",
      \"timerange\": \"[${start_time}_${end_time})\"
    }" > /dev/null 2>&1; then
      ((attempt++)) || true
      ((TOTAL_RETRIES++)) || true
      sleep $backoff
      backoff=$((backoff * 2))
      continue
    fi

    TOTAL_BYTES_UPLOADED=$((TOTAL_BYTES_UPLOADED + file_size))
    return 0
  done

  print_error "Failed to upload segment after $MAX_RETRIES attempts"
  return 1
}

# ============================================================
# SECTION 5: INPUT HANDLING
# ============================================================

AUTO_CONFIRM=false
MP4_FILE=""
SEGMENT_DURATION=$DEFAULT_SEGMENT_DURATION
LABEL=""

parse_args() {
  local positional=()
  for arg in "$@"; do
    case "$arg" in
      --yes|-y) AUTO_CONFIRM=true ;;
      *) positional+=("$arg") ;;
    esac
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

  # --- Dependencies ---
  print_header "Checking Dependencies"
  check_dependencies

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
  printf "  ${BOLD}Size:${RESET}      %s\n" "$(format_bytes $(get_file_size "$MP4_FILE"))"
  printf "  ${BOLD}Label:${RESET}     %s\n" "$LABEL"
  printf "  ${BOLD}Segments:${RESET}  %ss each\n" "$SEGMENT_DURATION"
  confirm_proceed

  # --- Probe ---
  print_header "Analysing Media"

  VIDEO_CODEC=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$MP4_FILE")
  VIDEO_WIDTH=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=width -of csv=p=0 "$MP4_FILE")
  VIDEO_HEIGHT=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=height -of csv=p=0 "$MP4_FILE")
  VIDEO_FPS=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$MP4_FILE")
  VIDEO_BITRATE=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=bit_rate -of csv=p=0 "$MP4_FILE")
  VIDEO_FPS_NUM=$(echo "$VIDEO_FPS" | cut -d'/' -f1)
  VIDEO_FPS_DEN=$(echo "$VIDEO_FPS" | cut -d'/' -f2)

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

  ffmpeg -y -v quiet -i "$MP4_FILE" -c:v copy -an \
    -f hls -hls_time "$SEGMENT_DURATION" -hls_list_size 0 \
    -hls_segment_type mpegts -hls_segment_filename "$VIDEO_DIR/seg_%04d.ts" \
    -map 0:v:0 "$VIDEO_DIR/manifest.m3u8" &
  local ffmpeg_pid=$!
  show_spinner $ffmpeg_pid "Segmenting video track..."
  wait $ffmpeg_pid

  VIDEO_SEGMENTS=($(ls "$VIDEO_DIR"/seg_*.ts | sort))
  VIDEO_DURATIONS=($(grep '^#EXTINF:' "$VIDEO_DIR/manifest.m3u8" | sed 's/#EXTINF:\([0-9.]*\).*/\1/'))

  local video_total_size=0
  for seg in "${VIDEO_SEGMENTS[@]}"; do
    video_total_size=$((video_total_size + $(get_file_size "$seg")))
  done
  print_success "Video: ${#VIDEO_SEGMENTS[@]} segments ($(format_bytes $video_total_size))"

  if [[ "$HAS_AUDIO" == true ]]; then
    AUDIO_DIR="$WORK_DIR/audio"
    mkdir -p "$AUDIO_DIR"

    ffmpeg -y -v quiet -i "$MP4_FILE" -c:a copy -vn \
      -f hls -hls_time "$SEGMENT_DURATION" -hls_list_size 0 \
      -hls_segment_type mpegts -hls_segment_filename "$AUDIO_DIR/seg_%04d.ts" \
      -map 0:a:0 "$AUDIO_DIR/manifest.m3u8" &
    local ffmpeg_audio_pid=$!
    show_spinner $ffmpeg_audio_pid "Segmenting audio track..."
    wait $ffmpeg_audio_pid

    AUDIO_SEGMENTS=($(ls "$AUDIO_DIR"/seg_*.ts | sort))
    AUDIO_DURATIONS=($(grep '^#EXTINF:' "$AUDIO_DIR/manifest.m3u8" | sed 's/#EXTINF:\([0-9.]*\).*/\1/'))

    local audio_total_size=0
    for seg in "${AUDIO_SEGMENTS[@]}"; do
      audio_total_size=$((audio_total_size + $(get_file_size "$seg")))
    done
    print_success "Audio: ${#AUDIO_SEGMENTS[@]} segments ($(format_bytes $audio_total_size))"
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

  # --- Create Sources & Flows ---
  print_header "Registering Media"

  curl -s -X PUT "$API_ENDPOINT/sources/$VIDEO_SOURCE_ID" \
    -H "$AUTH" -H "$CT" -d "{
    \"id\": \"$VIDEO_SOURCE_ID\",
    \"format\": \"urn:x-nmos:format:video\",
    \"label\": \"$LABEL - Video\",
    \"description\": \"Video source from: $(basename "$MP4_FILE")\",
    \"tags\": {\"origin\": \"tams-uploader\"}
  }" > /dev/null
  print_success "Video Source created"

  if [[ "$HAS_AUDIO" == true ]]; then
    curl -s -X PUT "$API_ENDPOINT/sources/$AUDIO_SOURCE_ID" \
      -H "$AUTH" -H "$CT" -d "{
      \"id\": \"$AUDIO_SOURCE_ID\",
      \"format\": \"urn:x-nmos:format:audio\",
      \"label\": \"$LABEL - Audio\",
      \"description\": \"Audio source from: $(basename "$MP4_FILE")\",
      \"tags\": {\"origin\": \"tams-uploader\"}
    }" > /dev/null
    print_success "Audio Source created"
  fi

  curl -s -X PUT "$API_ENDPOINT/flows/$VIDEO_FLOW_ID" \
    -H "$AUTH" -H "$CT" -d "{
    \"id\": \"$VIDEO_FLOW_ID\",
    \"source_id\": \"$VIDEO_SOURCE_ID\",
    \"format\": \"urn:x-nmos:format:video\",
    \"label\": \"$LABEL - Video (H.264)\",
    \"description\": \"Video flow: ${VIDEO_WIDTH}x${VIDEO_HEIGHT} @ ${VIDEO_FPS}\",
    \"tags\": {\"flow_status\": \"ingesting\"},
    \"codec\": \"video/h264\",
    \"container\": \"video/mp2t\",
    \"avg_bit_rate\": $VIDEO_BITRATE,
    \"essence_parameters\": {
      \"frame_rate\": {\"numerator\": $VIDEO_FPS_NUM, \"denominator\": $VIDEO_FPS_DEN},
      \"frame_width\": $VIDEO_WIDTH,
      \"frame_height\": $VIDEO_HEIGHT
    }
  }" > /dev/null
  print_success "Video Flow created (status: ingesting)"

  if [[ "$HAS_AUDIO" == true ]]; then
    curl -s -X PUT "$API_ENDPOINT/flows/$AUDIO_FLOW_ID" \
      -H "$AUTH" -H "$CT" -d "{
      \"id\": \"$AUDIO_FLOW_ID\",
      \"source_id\": \"$AUDIO_SOURCE_ID\",
      \"format\": \"urn:x-nmos:format:audio\",
      \"label\": \"$LABEL - Audio (AAC)\",
      \"description\": \"Audio flow: ${AUDIO_SAMPLE_RATE}Hz ${AUDIO_CHANNELS}ch\",
      \"tags\": {\"flow_status\": \"ingesting\"},
      \"codec\": \"audio/aac\",
      \"container\": \"video/mp2t\",
      \"avg_bit_rate\": $AUDIO_BITRATE,
      \"essence_parameters\": {
        \"sample_rate\": $AUDIO_SAMPLE_RATE,
        \"channels\": $AUDIO_CHANNELS
      }
    }" > /dev/null
    print_success "Audio Flow created (status: ingesting)"
  fi

  # --- Create Multi Flow early so it appears in portal immediately ---
  if [[ "$HAS_AUDIO" == true ]]; then
    curl -s -X PUT "$API_ENDPOINT/sources/$MULTI_SOURCE_ID" \
      -H "$AUTH" -H "$CT" -d "{
      \"id\": \"$MULTI_SOURCE_ID\",
      \"format\": \"urn:x-nmos:format:multi\",
      \"label\": \"$LABEL\",
      \"description\": \"Combined programme from: $(basename "$MP4_FILE")\",
      \"tags\": {\"origin\": \"tams-uploader\"}
    }" > /dev/null

    curl -s -X PUT "$API_ENDPOINT/flows/$MULTI_FLOW_ID" \
      -H "$AUTH" -H "$CT" -d "{
      \"id\": \"$MULTI_FLOW_ID\",
      \"source_id\": \"$MULTI_SOURCE_ID\",
      \"format\": \"urn:x-nmos:format:multi\",
      \"label\": \"$LABEL\",
      \"description\": \"Combined video and audio flow\",
      \"tags\": {\"flow_status\": \"ingesting\"},
      \"flow_collection\": [
        {\"id\": \"$VIDEO_FLOW_ID\", \"role\": \"video\"},
        {\"id\": \"$AUDIO_FLOW_ID\", \"role\": \"audio\"}
      ]
    }" > /dev/null
    print_success "Multi Flow created (status: ingesting)"
  fi

  # --- Upload Video Segments ---
  print_header "Uploading Video Segments"
  UPLOAD_START_EPOCH=$(date +%s)

  local video_cumulative=0
  for i in "${!VIDEO_SEGMENTS[@]}"; do
    local duration=${VIDEO_DURATIONS[$i]}
    local start_time=$(to_tams_time "$video_cumulative")
    video_cumulative=$(python3 -c "print($video_cumulative + $duration)")
    local end_time=$(to_tams_time "$video_cumulative")

    upload_segment_with_retry "$VIDEO_FLOW_ID" "${VIDEO_SEGMENTS[$i]}" "$start_time" "$end_time"
    draw_progress_bar $((i + 1)) ${#VIDEO_SEGMENTS[@]} $TOTAL_BYTES_UPLOADED $UPLOAD_START_EPOCH $TOTAL_RETRIES "Video"
  done
  echo ""
  print_success "Video upload complete (${#VIDEO_SEGMENTS[@]} segments)"

  # --- Upload Audio Segments ---
  if [[ "$HAS_AUDIO" == true ]]; then
    print_header "Uploading Audio Segments"
    local audio_upload_start=$(date +%s)

    local audio_cumulative=0
    for i in "${!AUDIO_SEGMENTS[@]}"; do
      local duration=${AUDIO_DURATIONS[$i]}
      local start_time=$(to_tams_time "$audio_cumulative")
      audio_cumulative=$(python3 -c "print($audio_cumulative + $duration)")
      local end_time=$(to_tams_time "$audio_cumulative")

      upload_segment_with_retry "$AUDIO_FLOW_ID" "${AUDIO_SEGMENTS[$i]}" "$start_time" "$end_time"
      draw_progress_bar $((i + 1)) ${#AUDIO_SEGMENTS[@]} $TOTAL_BYTES_UPLOADED $UPLOAD_START_EPOCH $TOTAL_RETRIES "Audio"
    done
    echo ""
    print_success "Audio upload complete (${#AUDIO_SEGMENTS[@]} segments)"
  fi

  # --- Mark Flows Complete ---
  print_header "Finalising"

  curl -s -X PUT "$API_ENDPOINT/flows/$VIDEO_FLOW_ID" \
    -H "$AUTH" -H "$CT" -d "{
    \"id\": \"$VIDEO_FLOW_ID\",
    \"source_id\": \"$VIDEO_SOURCE_ID\",
    \"format\": \"urn:x-nmos:format:video\",
    \"label\": \"$LABEL - Video (H.264)\",
    \"tags\": {\"flow_status\": \"ready\"},
    \"codec\": \"video/h264\",
    \"container\": \"video/mp2t\",
    \"avg_bit_rate\": $VIDEO_BITRATE,
    \"essence_parameters\": {
      \"frame_rate\": {\"numerator\": $VIDEO_FPS_NUM, \"denominator\": $VIDEO_FPS_DEN},
      \"frame_width\": $VIDEO_WIDTH,
      \"frame_height\": $VIDEO_HEIGHT
    }
  }" > /dev/null
  print_success "Video flow marked ready"

  if [[ "$HAS_AUDIO" == true ]]; then
    curl -s -X PUT "$API_ENDPOINT/flows/$AUDIO_FLOW_ID" \
      -H "$AUTH" -H "$CT" -d "{
      \"id\": \"$AUDIO_FLOW_ID\",
      \"source_id\": \"$AUDIO_SOURCE_ID\",
      \"format\": \"urn:x-nmos:format:audio\",
      \"label\": \"$LABEL - Audio (AAC)\",
      \"tags\": {\"flow_status\": \"ready\"},
      \"codec\": \"audio/aac\",
      \"container\": \"video/mp2t\",
      \"avg_bit_rate\": $AUDIO_BITRATE,
      \"essence_parameters\": {
        \"sample_rate\": $AUDIO_SAMPLE_RATE,
        \"channels\": $AUDIO_CHANNELS
      }
    }" > /dev/null
    print_success "Audio flow marked ready"
  fi

  # --- Mark Multi Flow ready ---
  if [[ "$HAS_AUDIO" == true ]]; then
    curl -s -X PUT "$API_ENDPOINT/flows/$MULTI_FLOW_ID" \
      -H "$AUTH" -H "$CT" -d "{
      \"id\": \"$MULTI_FLOW_ID\",
      \"source_id\": \"$MULTI_SOURCE_ID\",
      \"format\": \"urn:x-nmos:format:multi\",
      \"label\": \"$LABEL\",
      \"description\": \"Combined video and audio flow\",
      \"tags\": {\"flow_status\": \"ready\"},
      \"flow_collection\": [
        {\"id\": \"$VIDEO_FLOW_ID\", \"role\": \"video\"},
        {\"id\": \"$AUDIO_FLOW_ID\", \"role\": \"audio\"}
      ]
    }" > /dev/null
    print_success "Multi flow marked ready"
  fi

  # --- Completion Report ---
  local total_time=$(($(date +%s) - SCRIPT_START_EPOCH))

  print_header "Upload Complete"
  printf "  ${GREEN}✓${RESET} ${BOLD}Total time:${RESET}        %s\n" "$(format_duration $total_time)"
  printf "  ${GREEN}✓${RESET} ${BOLD}Video segments:${RESET}    %d uploaded\n" "${#VIDEO_SEGMENTS[@]}"
  if [[ "$HAS_AUDIO" == true ]]; then
    printf "  ${GREEN}✓${RESET} ${BOLD}Audio segments:${RESET}    %d uploaded\n" "${#AUDIO_SEGMENTS[@]}"
  fi
  printf "  ${GREEN}✓${RESET} ${BOLD}Data transferred:${RESET}  %s\n" "$(format_bytes $TOTAL_BYTES_UPLOADED)"
  if [[ $TOTAL_RETRIES -gt 0 ]]; then
    printf "  ${YELLOW}!${RESET} ${BOLD}Retries needed:${RESET}    %d\n" "$TOTAL_RETRIES"
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
