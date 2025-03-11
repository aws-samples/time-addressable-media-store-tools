build-FFprobeLayer:
	curl -O -L https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz
	mkdir ffmpeg-temp
	tar xvf ffmpeg-master-latest-linuxarm64-gpl.tar.xz -C ffmpeg-temp
	mkdir -p "$(ARTIFACTS_DIR)/bin"
	cp ffmpeg-temp/*/bin/ffprobe "$(ARTIFACTS_DIR)/bin"
	mkdir -p "$(ARTIFACTS_DIR)/python"
	cp ffprobe.py "$(ARTIFACTS_DIR)/python"
