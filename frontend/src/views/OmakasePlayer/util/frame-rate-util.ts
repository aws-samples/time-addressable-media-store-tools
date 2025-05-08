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

const frameRatePrecision = 15; // frame rate precision

export class FrameRateUtil {
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
}
