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

const frameRatePrecision = 15; // frame rate precision

export interface FrameRateModel {
  value: number;
  fraction?: string;
  dropFrameEnabled: boolean;
  dropFramesOnMinute?: number;
}

const initFrameRates: { fraction: string; dropFramesOnMinute?: number }[] = [
  {
    fraction: "24000/1001",
  },
  {
    fraction: "30000/1001",
    dropFramesOnMinute: 2,
  },
  {
    fraction: "60000/1001",
    dropFramesOnMinute: 4,
  },
  {
    fraction: "120000/1001",
  },
  {
    fraction: "240000/1001",
  },
];

export class FrameRateUtil {
  static AUDIO_FRAME_RATE = 100;

  private static frameRateModels: FrameRateModel[];
  private static frameRateModelByValue: Map<number, FrameRateModel> = new Map<
    number,
    FrameRateModel
  >();

  static {
    this.frameRateModels = initFrameRates.map((fractionFrameRate) => {
      return {
        value: this.resolveFrameRateValueFromFraction(
          fractionFrameRate.fraction
        ),
        fraction: fractionFrameRate.fraction,
        dropFrameEnabled: fractionFrameRate.dropFramesOnMinute != undefined,
        dropFramesOnMinute: fractionFrameRate.dropFramesOnMinute,
      };
    });

    this.frameRateModels.forEach((frameRateModel) => {
      this.frameRateModelByValue.set(frameRateModel.value, frameRateModel);
    });
  }
  static resolveFrameRateValueFromFraction(fraction: string): number {
    let parts = fraction.split("/");

    if (parts.length !== 2) {
      throw new Error(`Incorrect frame rate fraction format`);
    }

    let numerator = parseInt(parts[0]);
    let denominator = parseInt(parts[1]);

    if (
      isNaN(numerator) ||
      isNaN(denominator) ||
      numerator < 1 ||
      denominator < 0
    ) {
      throw new Error(
        `Numerator and denominator must be integers larger than 0`
      );
    }

    return parseFloat((numerator / denominator).toFixed(frameRatePrecision));
  }

  static resolveDropFramesOnMinute(frameRateDecimal: Decimal): number {
    let frameRateModel = this.frameRateModelByValue.get(
      frameRateDecimal.toNumber()
    );
    if (!frameRateModel || !frameRateModel.dropFrameEnabled) {
      throw new Error("Drop frame for frame rate not supported");
    }
    return frameRateModel.dropFramesOnMinute!;
  }
}
