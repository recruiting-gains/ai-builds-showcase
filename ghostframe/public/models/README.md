# Local vision assets

`npm run assets` installs the locked MediaPipe package's WASM/runtime files and downloads two fixed Google-hosted model versions. The script checks existing files too; a size or digest mismatch fails closed rather than silently trusting a modified model.

| Asset | Version | Bytes | SHA-256 |
| --- | --- | --- | --- |
| hand_landmarker | float16/1 | 7819105 | fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1 |
| selfie_segmenter_landscape | float16/1 | 250177 | 490e9ea734313e0de10fa0cd9e3c6133e36ea4db2b7a49bde9ef019f72796b8e |

Sources and model cards: [Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/index#models), [Image Segmenter](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/index#models). The package retains its Apache-2.0 license; models retain their upstream terms. Generated binary assets are excluded from Git and included in the frontend deployment after verification. The user-supplied reference video is not a model asset.
