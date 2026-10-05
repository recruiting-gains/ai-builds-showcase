/** Emits fresh software fixtures. This is not a Wi-Fi driver or hardware capture. */
const argument = process.argv[2];
const seconds = argument === undefined ? 30 : Number(argument);
if (!Number.isFinite(seconds) || seconds < 1 || seconds > 300) {
  console.error("Usage: npm run fixture -- [seconds from 1 to 300]");
  process.exitCode = 1;
} else {
  for (let index = 0; index < Math.floor(seconds * 5); index++) {
    const time = index / 5;
    const sample = {
      sensorId: "software-fixture",
      sourceKind: "fixture",
      capturedAt: new Date().toISOString(),
      rssi: Number((-62 + Math.sin(time) * 3).toFixed(2)),
      amplitudes: Array.from({ length: 32 }, (_, i) =>
        Number((0.4 + 0.15 * Math.sin(time + i * 0.3)).toFixed(3)),
      ),
      amplitudeUnit: "relative",
    };
    if (!process.stdout.write(JSON.stringify(sample) + "\n"))
      await new Promise<void>((resolve) =>
        process.stdout.once("drain", resolve),
      );
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export {};
