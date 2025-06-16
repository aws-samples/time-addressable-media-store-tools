/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Decimal from "decimal.js";
import { FrameRateUtil } from "./frame-rate-util";

export class TimecodeUtil {
  static formatToTimecode(
    time: number,
    frameRate: number,
    dropFrame: boolean,
    audioOnly = false
  ): string {
    let frameRateDecimal = new Decimal(frameRate);
    let frameNumberDecimal: Decimal;
    let frameRateRoundedDecimal = frameRateDecimal.round();

    frameNumberDecimal = frameRateDecimal.mul(time).floor();

    let framesDecimal: Decimal;
    let secondsDecimal: Decimal;
    let minutesDecimal: Decimal;
    let hoursDecimal: Decimal;

    if (dropFrame) {
      // algorithm for drop frame
      let dropFramesDecimal = new Decimal(
        FrameRateUtil.resolveDropFramesOnMinute(frameRateDecimal)
      );
      let framesPerHourDecimal = frameRateDecimal.mul(3600).round(); // 60 * 60
      let framesPer24HoursDecimal = framesPerHourDecimal.mul(24);
      let framesPer10MinutesDecimal = frameRateDecimal.mul(600).round(); // 60 * 10
      let framesPerMinuteDecimal = frameRateDecimal
        .round()
        .mul(60)
        .minus(dropFramesDecimal);

      frameNumberDecimal = frameNumberDecimal.mod(framesPer24HoursDecimal);

      let dDecimal = frameNumberDecimal.divToInt(framesPer10MinutesDecimal);
      let mDecimal = frameNumberDecimal.mod(framesPer10MinutesDecimal);

      if (mDecimal.gt(dropFramesDecimal)) {
        frameNumberDecimal = frameNumberDecimal
          .plus(dropFramesDecimal.mul(9).mul(dDecimal))
          .plus(
            dropFramesDecimal.mul(
              mDecimal.minus(dropFramesDecimal).divToInt(framesPerMinuteDecimal)
            )
          );
      } else {
        frameNumberDecimal = frameNumberDecimal.plus(
          dropFramesDecimal.mul(9).mul(dDecimal)
        );
      }

      framesDecimal = frameNumberDecimal.mod(frameRateRoundedDecimal);
      secondsDecimal = frameNumberDecimal
        .divToInt(frameRateRoundedDecimal)
        .mod(60);
      minutesDecimal = frameNumberDecimal
        .divToInt(frameRateRoundedDecimal)
        .divToInt(60)
        .mod(60);
      hoursDecimal = frameNumberDecimal
        .divToInt(frameRateRoundedDecimal)
        .divToInt(60)
        .divToInt(60);
    } else {
      // algorithm for non-drop frame
      let framesPer24HoursDecimal = frameRateRoundedDecimal.mul(86400); // 60 * 60 * 24

      let remainingFramesDecimal = frameNumberDecimal.mod(
        framesPer24HoursDecimal
      );
      let hourFramesDecimal = frameRateRoundedDecimal.mul(3600); // 60 * 60
      let minuteFramesDecimal = frameRateRoundedDecimal.mul(60);

      hoursDecimal = remainingFramesDecimal.divToInt(hourFramesDecimal);
      remainingFramesDecimal = remainingFramesDecimal.minus(
        hoursDecimal.mul(hourFramesDecimal)
      );

      minutesDecimal = remainingFramesDecimal.divToInt(minuteFramesDecimal);
      remainingFramesDecimal = remainingFramesDecimal.minus(
        minutesDecimal.mul(minuteFramesDecimal)
      );

      secondsDecimal = remainingFramesDecimal.divToInt(frameRateRoundedDecimal);
      framesDecimal = remainingFramesDecimal.minus(
        secondsDecimal.mul(frameRateRoundedDecimal)
      );
    }

    return TimecodeUtil.formatTimecodeText(
      hoursDecimal.toNumber(),
      minutesDecimal.toNumber(),
      secondsDecimal.toNumber(),
      framesDecimal.toNumber(),
      dropFrame,
      audioOnly
    );
  }

  static formatTimecodeText(
    hours: number,
    minutes: number,
    seconds: number,
    frames: number,
    dropFrame: boolean,
    audioOnly = false
  ): string {
    let frameSeparator = audioOnly ? "." : ":";
    frameSeparator = dropFrame ? ";" : frameSeparator;
    return `${TimecodeUtil.padZero(hours)}:${TimecodeUtil.padZero(
      minutes
    )}:${TimecodeUtil.padZero(seconds)}${frameSeparator}${TimecodeUtil.padZero(
      frames
    )}`;
  }

  /**
   * Fast padding
   * @param num
   * @private
   */
  private static padZero(num: number): string {
    return num < 10 ? `0${num}` : `${num}`;
  }
}
