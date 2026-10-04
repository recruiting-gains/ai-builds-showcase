# RuView reference analysis

Inspected on October 4, 2026 at commit `7c8aeacea2ad30972070196eb7d8e7200506b742`. This was source inspection; upstream hardware and model benchmarks were not reproduced.

## Observed architecture

1. ESP32 firmware collects channel state information through a Wi-Fi driver callback, serializes frames, and sends UDP packets to a local receiver.
2. A Rust sensing server receives those measurements, processes features, and broadcasts structured events through WebSockets.
3. Browser interfaces draw signal and spatial views. Some demonstration paths generate synthetic data; a transport connection alone cannot establish hardware provenance.

Relevant pinned source:

- [CSI collector firmware](https://github.com/ruvnet/RuView/blob/7c8aeacea2ad30972070196eb7d8e7200506b742/firmware/esp32-csi-node/main/csi_collector.c)
- [Sensing server](https://github.com/ruvnet/RuView/blob/7c8aeacea2ad30972070196eb7d8e7200506b742/v2/crates/wifi-densepose-sensing-server/src/main.rs)
- [Browser CSI simulator](https://github.com/ruvnet/RuView/blob/7c8aeacea2ad30972070196eb7d8e7200506b742/ui/pose-fusion/js/csi-simulator.js)
- [README and disclosed limitations](https://github.com/ruvnet/RuView/blob/7c8aeacea2ad30972070196eb7d8e7200506b742/README.md)
- [Upstream verification claims and prerequisites](https://github.com/ruvnet/RuView/blob/7c8aeacea2ad30972070196eb7d8e7200506b742/PROOF.md)

## What ReTrace takes from the analysis

The useful architectural separation is collection, typed transport, and visualization. ReTrace implements the transport and visualization as an independent small project. Its bridge accepts a documented normalized format rather than copying RuView's device protocol.

The public scenarios are deterministic and explicitly simulated. The private stream preserves source kind, session, sequence, capture time, and receipt time. A replay keeps its original source kind. The display never labels an arbitrary amplitude array as verified hardware sensing.

The room view is a scenario illustration. It cannot infer a physical position from RSSI or amplitudes. Live inference, occupancy counts, through-wall imaging, human skeletons, identity, vital signs, firmware, and calibration are not implemented or claimed.

## Originality and license boundary

No RuView source, branding, example media, trained checkpoints, or firmware is included in ReTrace. The referenced repository reports an MIT license; that is not a substitute for checking asset/model licenses if any are considered in later work. Any future adaptation should identify its provenance and preserve the applicable notices.
